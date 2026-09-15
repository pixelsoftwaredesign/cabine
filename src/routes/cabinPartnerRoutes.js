const express = require('express');
const Cabin = require('../models/Cabin');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { publishSystemConfig } = require('../services/mqttService');
const { resolveRooms } = require('../config/rooms');

const router = express.Router();

router.post('/cabins', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    const { serialNumber, name, address, pricePerHour, location, pricing, rooms } = req.body;

    if (!serialNumber || !name) {
      return res.status(400).json({ success: false, message: 'serialNumber et name requis' });
    }

    const alreadyExists = await Cabin.findOne({ serialNumber });
    if (alreadyExists) {
      return res.status(409).json({ success: false, message: 'Numéro de série déjà associé à une cabine' });
    }

    const cabin = await Cabin.create({
      serialNumber,
      name,
      address,
      ownerId: req.user._id,
      operatingMode: 'PERSONAL',
      status: 'OCCUPIED_BY_OWNER',
      rentalSettings: { pricePerHour: pricePerHour || 0, isListed: false },
      ...(location
        ? {
            location: {
              country: location.country || 'TN',
              countryName: location.countryName || 'Tunisie',
              city: location.city || '',
              coordinates: {
                lat: location.lat || location.coordinates?.lat || 0,
                lng: location.lng || location.coordinates?.lng || 0
              }
            }
          }
        : {}),
      ...(pricing ? { pricing: { currency: pricing.currency || 'EUR', ...pricing } } : {}),
      rooms: resolveRooms(rooms)
    });

    publishSystemConfig(cabin.serialNumber, {
      event: 'CABIN_PAIRED',
      ownerId: req.user._id,
      mode: 'PERSONAL'
    });

    return res.status(201).json({ success: true, cabin });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/cabins', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    const cabins = await Cabin.find({ ownerId: req.user._id });
    return res.json({ success: true, cabins });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/cabins/:cabinId', authMiddleware, async (req, res) => {
  try {
    const cabin = await Cabin.findById(req.params.cabinId);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    if (cabin.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    return res.json({ success: true, cabin });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/cabins/:cabinId/mode', authMiddleware, async (req, res) => {
  try {
    const { cabinId } = req.params;
    const { targetMode, pricePerHour, isListed, location, pricing } = req.body;

    if (!['PERSONAL', 'HOST_RENTAL'].includes(targetMode)) {
      return res.status(400).json({
        success: false,
        message: "Mode invalide. Choix possibles : 'PERSONAL' ou 'HOST_RENTAL'."
      });
    }

    const cabin = await Cabin.findById(cabinId);
    if (!cabin) {
      return res.status(404).json({ success: false, message: 'Cabine non trouvée' });
    }

    if (cabin.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: "Vous n'êtes pas le propriétaire de cette cabine" });
    }

    if (cabin.status === 'OCCUPIED_BY_GUEST') {
      return res.status(409).json({
        success: false,
        message: 'Impossible de modifier le mode : un client occupe actuellement la cabine'
      });
    }

    cabin.operatingMode = targetMode;

    if (targetMode === 'HOST_RENTAL') {
      if (pricePerHour !== undefined) cabin.rentalSettings.pricePerHour = pricePerHour;
      if (isListed !== undefined) cabin.rentalSettings.isListed = isListed;
      cabin.status = 'AVAILABLE';
    } else {
      cabin.rentalSettings.isListed = false;
      cabin.status = 'OCCUPIED_BY_OWNER';
    }

    if (location) {
      cabin.location = {
        country: location.country || cabin.location.country,
        countryName: location.countryName || cabin.location.countryName,
        city: location.city || cabin.location.city,
        coordinates: {
          lat: location.lat || location.coordinates?.lat || cabin.location.coordinates.lat,
          lng: location.lng || location.coordinates?.lng || cabin.location.coordinates.lng
        }
      };
    }

    if (pricing) {
      cabin.pricing.currency = pricing.currency || cabin.pricing.currency;
      if (pricing.displayCurrency) cabin.pricing.displayCurrency = pricing.displayCurrency;
    }

    await cabin.save();

    publishSystemConfig(cabin.serialNumber, {
      event: 'MODE_CHANGE',
      mode: cabin.operatingMode,
      status: cabin.status,
      timestamp: new Date()
    });

    return res.status(200).json({
      success: true,
      message: `La cabine est maintenant en ${targetMode === 'PERSONAL' ? 'Mode Personnel' : 'Mode Location'}`,
      cabin: {
        id: cabin._id,
        serialNumber: cabin.serialNumber,
        operatingMode: cabin.operatingMode,
        status: cabin.status,
        rentalSettings: cabin.rentalSettings
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/cabins/:cabinId/status', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['AVAILABLE', 'MAINTENANCE', 'CLEANING_REQUIRED', 'OCCUPIED_BY_OWNER'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    const cabin = await Cabin.findOne({ _id: req.params.cabinId, ownerId: req.user._id });
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine non trouvée' });

    cabin.status = status;
    await cabin.save();

    return res.json({ success: true, cabin });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;