const express = require('express');
const stripe = require('../config/stripe');
const User = require('../models/User');
const Cabin = require('../models/Cabin');
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { generateAccessCode } = require('../services/accessService');
const { publishSystemConfig } = require('../services/mqttService');

const router = express.Router();

router.post('/partner/onboard', authMiddleware, requireRole('PARTNER'), async (req, res) => {
  try {
    const user = req.user;

    let account;
    if (!user.stripeAccountId) {
      account = await stripe.accounts.create({
        type: 'express',
        country: req.body.country || 'FR',
        email: user.email,
        capabilities: { transfers: { requested: true } }
      });
      user.stripeAccountId = account.id;
      user.stripeAccountStatus = 'PENDING';
      await user.save();
    } else {
      account = await stripe.accounts.retrieve(user.stripeAccountId);
    }

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/partner/onboarding`,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/partner/dashboard`,
      type: 'account_onboarding'
    });

    return res.json({ success: true, onboardingUrl: accountLink.url, accountStatus: user.stripeAccountStatus });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/partner/status', authMiddleware, requireRole('PARTNER'), async (req, res) => {
  try {
    const user = req.user;
    if (!user.stripeAccountId) {
      return res.json({ success: true, accountStatus: 'NONE', payoutsEnabled: false });
    }

    const account = await stripe.accounts.retrieve(user.stripeAccountId);
    return res.json({
      success: true,
      accountStatus: user.stripeAccountStatus,
      payoutsEnabled: account.payouts_enabled
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const { reservationId } = req.body;
    const reservation = await Reservation.findOne({
      _id: reservationId,
      userId: req.user._id,
      status: 'PENDING_PAYMENT'
    }).populate('cabinId');

    if (!reservation) {
      return res.status(404).json({ success: false, message: 'Réservation introuvable ou déjà payée' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(reservation.totalPrice * 100),
      currency: reservation.currency || 'eur',
      metadata: { reservationId: reservation._id.toString() }
    });

    const payment = await Payment.create({
      reservationId: reservation._id,
      cabinId: reservation.cabinId._id,
      guestId: req.user._id,
      partnerId: reservation.cabinId.ownerId,
      stripePaymentIntentId: paymentIntent.id,
      amount: reservation.totalPrice,
      status: 'PENDING'
    });

    reservation.paymentId = payment._id;
    await reservation.save();

    return res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentId: payment._id
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

const finalizePayment = async (paymentId) => {
  const payment = await Payment.findById(paymentId).populate('partnerId');
  if (!payment || payment.status !== 'PENDING') return;

  const reservation = await Reservation.findById(payment.reservationId).populate('cabinId');
  if (!reservation) return;

  const cabin = reservation.cabinId;
  const platformFeeRate = parseFloat(process.env.PLATFORM_FEE_RATE || '0.15');
  const platformFee = Math.round(payment.amount * platformFeeRate * 100) / 100;
  const partnerPayout = Math.round((payment.amount - platformFee) * 100) / 100;

  payment.status = 'SUCCEEDED';
  payment.platformFee = platformFee;
  payment.partnerPayout = partnerPayout;
  await payment.save();

  reservation.status = 'CONFIRMED';
  reservation.accessCode = generateAccessCode();
  reservation.accessCodeExpiresAt = reservation.endTime;
  await reservation.save();

  if (payment.partnerId && payment.partnerId.stripeAccountId) {
    await stripe.transfers.create({
      amount: Math.round(partnerPayout * 100),
      currency: payment.currency || 'eur',
      destination: payment.partnerId.stripeAccountId,
      transfer_group: payment._id.toString()
    });
    payment.status = 'PAID_OUT';
    await payment.save();
  }

  publishSystemConfig(cabin.serialNumber, {
    event: 'BOOKING_CONFIRMED',
    reservationId: reservation._id,
    accessCode: reservation.accessCode
  });
};

const handlePaymentSuccess = async (paymentIntent) => {
  const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntent.id });
  if (!payment) return;
  await finalizePayment(payment._id);
};

router.post('/dev-confirm', authMiddleware, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Non disponible en production' });
    }

    const { reservationId } = req.body;
    const reservation = await Reservation.findById(reservationId)
      .populate({ path: 'cabinId', populate: { path: 'ownerId' } });

    if (!reservation || reservation.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Réservation introuvable' });
    }

    let payment = await Payment.findOne({ reservationId: reservation._id, status: 'PENDING' });
    if (!payment) {
      payment = await Payment.create({
        reservationId: reservation._id,
        cabinId: reservation.cabinId._id,
        guestId: req.user._id,
        partnerId: reservation.cabinId?.ownerId?._id,
        stripePaymentIntentId: 'dev_' + reservation._id,
        amount: reservation.totalPrice,
        status: 'PENDING'
      });
    }

    await finalizePayment(payment._id);

    const updated = await Reservation.findById(reservation._id);
    return res.json({
      success: true,
      message: 'Paiement confirmé (mode démo)',
      accessCode: updated.accessCode
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

const webhookHandler = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    await handlePaymentSuccess(event.data.object);
  }

  return res.json({ received: true });
};

module.exports = { router, webhookHandler };