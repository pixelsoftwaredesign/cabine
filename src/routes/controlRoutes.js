const express = require('express');
const Cabin = require('../models/Cabin');
const { authMiddleware, requireAdminOr } = require('../middleware/auth');
const { canAccessCabin } = require('../services/accessControl');
const { publishCommand } = require('../services/mqttService');

const router = express.Router();

router.use(authMiddleware);

// Passage « Occupée (client) » / « Prête » (dispo) — réservé MANAGER + ADMIN
router.post('/:cabinId/status', requireAdminOr('MANAGER'), async (req, res) => {
  try {
    const { status } = req.body || {};
    const valid = ['AVAILABLE', 'OCCUPIED_BY_GUEST'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: `Statut invalide. Attendu : ${valid.join(' ou ')}` });
    }

    const cabin = await Cabin.findById(req.params.cabinId);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    cabin.status = status;
    if (status === 'OCCUPIED_BY_GUEST') cabin.guestState = 'INSIDE';
    else if (status === 'AVAILABLE') cabin.guestState = 'OUTSIDE';

    cabin.lifecycleEvents = cabin.lifecycleEvents || [];
    cabin.lifecycleEvents.push({
      at: new Date(),
      action: status === 'OCCUPIED_BY_GUEST' ? 'OCCUPIED_BY_GUEST' : 'AVAILABLE',
      by: req.user.name || req.user.email
    });
    await cabin.save();

    return res.json({
      success: true,
      message: status === 'OCCUPIED_BY_GUEST' ? 'Cabine passée en « Occupée (client) »' : 'Cabine remise « Prête »',
      cabin: { id: cabin._id, status: cabin.status, guestState: cabin.guestState }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:cabinId/control', async (req, res) => {
  try {
    const { device, value } = req.body;
    if (!device || !value) {
      return res.status(400).json({ success: false, message: 'device et value requis' });
    }

    const access = await canAccessCabin(req.user._id, req.params.cabinId);
    if (!access.authorized) {
      return res.status(403).json({
        success: false,
        message: access.reason === 'NOT_FOUND' ? 'Cabine introuvable' : 'Aucun accès valide pour cette cabine'
      });
    }

    if (access.role === 'GUEST' && device === 'lock') {
      return res.status(403).json({ success: false, message: "Le client ne peut pas piloter la serrure" });
    }

    publishCommand(access.cabin.serialNumber, device, { action: 'SET', value });

    return res.json({
      success: true,
      message: `Commande envoyée : ${device} = ${value}`,
      role: access.role
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:cabinId/live', async (req, res) => {
  try {
    const access = await canAccessCabin(req.user._id, req.params.cabinId);
    if (!access.authorized) {
      return res.status(403).json({ success: false, message: 'Aucun accès valide pour cette cabine' });
    }

    return res.json({
      success: true,
      telemetry: access.cabin.telemetry,
      status: access.cabin.status,
      role: access.role,
      reservation: access.reservation
        ? { endTime: access.reservation.endTime }
        : null
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;