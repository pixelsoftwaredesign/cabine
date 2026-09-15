const express = require('express');
const mongoose = require('mongoose');
const Cabin = require('../models/Cabin');
const Reservation = require('../models/Reservation');
const HousekeepingTask = require('../models/HousekeepingTask');
const { verifyAccessCode } = require('../services/accessService');
const { publishCommand, publishSystemConfig } = require('../services/mqttService');
const { openGuestSession } = require('../services/sessionService');
const { HOUSEKEEPING_CHECKLIST } = require('../config/factory');

const router = express.Router();

const validId = (id) => id && mongoose.Types.ObjectId.isValid(id);

// Check-out : termine une session en cours (statut COMPLETED)
router.post('/reservation/:id/checkout', async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Identifiant de réservation invalide' });
    }
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ success: false, message: 'Réservation introuvable' });

    if (reservation.status === 'COMPLETED' || reservation.status === 'CANCELLED') {
      return res.json({ success: true, message: 'Session déjà terminée', status: reservation.status });
    }

    reservation.status = 'COMPLETED';
    reservation.accessCodeExpiresAt = Date.now();
    await reservation.save();

    const cabin = await Cabin.findById(reservation.cabinId);
    if (cabin) {
      if (cabin.status === 'OCCUPIED_BY_GUEST') {
        cabin.status = 'CLEANING_REQUIRED';
        cabin.housekeepingState = 'DIRTY';
        await cabin.save();
        const existing = await HousekeepingTask.findOne({ cabinId: cabin._id, status: { $ne: 'COMPLETED' } });
        if (!existing) {
          await HousekeepingTask.create({
            cabinId: cabin._id,
            cabinSerial: cabin.serialNumber,
            priority: 'MEDIUM',
            checklist: HOUSEKEEPING_CHECKLIST.map((c) => ({ key: c.key, label: c.label, done: false }))
          });
        }
      }
      cabin.guestState = 'OUTSIDE';
      cabin.guestExitedAt = new Date();
      await cabin.save();
      publishCommand(cabin.serialNumber, 'lighting', { action: 'SET', value: 'OFF' });
      publishCommand(cabin.serialNumber, 'lock', { action: 'LOCK' });
      publishSystemConfig(cabin.serialNumber, { event: 'GUEST_CHECKED_OUT', reservationId: reservation._id });
    }

    return res.json({ success: true, message: 'Check-out effectué', status: reservation.status });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/cabin/:id/status', async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Identifiant de cabine invalide' });
    }
    const cabin = await Cabin.findById(req.params.id).select('status operatingMode name telemetry guestState guestEnteredAt guestExitedAt');
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    return res.json({ success: true, cabin });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { pinCode, cabinId } = req.body;
    if (!pinCode) {
      return res.status(400).json({ success: false, message: 'Code PIN requis' });
    }
    if (cabinId && !validId(cabinId)) {
      return res.status(400).json({ success: false, message: 'Identifiant de cabine invalide' });
    }

    const reservation = await verifyAccessCode({ pinCode, cabinId });

    if (!reservation) {
      return res.status(401).json({
        success: false,
        message: cabinId
          ? 'Code invalide ou hors créneau'
          : 'Aucune réservation active avec ce code'
      });
    }

    const session = await openGuestSession({ userId: reservation.userId._id || reservation.userId });

    if (!session) {
      return res.status(401).json({ success: false, message: 'Réservation non active' });
    }

    return res.json({
      success: true,
      message: 'Bienvenue !',
      reservation: session
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;