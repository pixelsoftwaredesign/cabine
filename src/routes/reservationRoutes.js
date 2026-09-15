const express = require('express');
const Cabin = require('../models/Cabin');
const Reservation = require('../models/Reservation');
const { authMiddleware } = require('../middleware/auth');
const { generateAccessCode } = require('../services/accessService');
const { publishCommand } = require('../services/mqttService');

const router = express.Router();

router.get('/available', async (req, res) => {
  try {
    const { date } = req.query;
    const cabins = await Cabin.find({
      operatingMode: 'HOST_RENTAL',
      'rentalSettings.isListed': true,
      status: { $in: ['AVAILABLE', 'CLEANING_REQUIRED'] }
    }).select('name address serialNumber rentalSettings status telemetry rooms pricing');

    if (!date) return res.json({ success: true, cabins });

    const requestedStart = new Date(date);
    const requestedEnd = new Date(requestedStart.getTime() + 3600000);

    const overlapping = await Reservation.find({
      cabinId: { $in: cabins.map((c) => c._id) },
      startTime: { $lt: requestedEnd },
      endTime: { $gt: requestedStart },
      status: { $in: ['CONFIRMED', 'IN_PROGRESS'] }
    }).distinct('cabinId');

    const blockedIds = new Set(overlapping.map((id) => id.toString()));
    const available = cabins.filter((c) => !blockedIds.has(c._id.toString()));

    return res.json({ success: true, cabins: available });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/slots', async (req, res) => {
  try {
    const { cabinId, date } = req.query;
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const bookings = await Reservation.find({
      cabinId,
      startTime: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['CONFIRMED', 'IN_PROGRESS'] }
    }).select('startTime endTime');

    const slots = [];
    for (let h = 8; h <= 22; h++) {
      const start = new Date(date);
      start.setHours(h, 0, 0, 0);
      const end = new Date(start.getTime() + 3600000);

      const busy = bookings.some(
        (b) => b.startTime < end && b.endTime > start
      );

      slots.push({ start: start.toISOString(), end: end.toISOString(), available: !busy });
    }

    return res.json({ success: true, slots });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { cabinId, startTime, endTime } = req.body;
    const cabin = await Cabin.findById(cabinId);

    if (!cabin || cabin.operatingMode !== 'HOST_RENTAL' || !cabin.rentalSettings.isListed) {
      return res.status(400).json({ success: false, message: 'Cabine non disponible à la réservation' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({ success: false, message: 'Créneau invalide' });
    }

    const overlap = await Reservation.findOne({
      cabinId,
      startTime: { $lt: end },
      endTime: { $gt: start },
      status: { $in: ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] }
    });

    if (overlap) {
      return res.status(409).json({ success: false, message: 'Créneau déjà réservé' });
    }

    const hours = (end - start) / 3600000;
    const totalPrice = Math.round(hours * cabin.rentalSettings.pricePerHour * 100) / 100;

    if (!cabin.rentalSettings.autoAcceptBookings) {
      return res.status(202).json({
        success: false,
        message: 'Réservation manuelle : veuillez contacter la cabine',
        price: totalPrice
      });
    }

    const reservation = await Reservation.create({
      cabinId,
      userId: req.user._id,
      startTime: start,
      endTime: end,
      totalPrice,
      status: 'PENDING_PAYMENT'
    });

    publishCommand(cabin.serialNumber, 'system', {
      event: 'BOOKING_PENDING',
      reservationId: reservation._id
    });

    return res.status(201).json({
      success: true,
      reservation: {
        id: reservation._id,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        totalPrice: reservation.totalPrice,
        status: reservation.status
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const reservations = await Reservation.find({ userId: req.user._id })
      .populate('cabinId', 'name address serialNumber')
      .sort({ startTime: -1 });

    return res.json({ success: true, reservations });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('cabinId', 'name serialNumber address')
      .populate('userId', 'name email');

    if (!reservation || reservation.userId._id.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Réservation introuvable' });
    }

    return res.json({ success: true, reservation });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;