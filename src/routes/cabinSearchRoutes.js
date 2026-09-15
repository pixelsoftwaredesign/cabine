const express = require('express');
const Cabin = require('../models/Cabin');
const Reservation = require('../models/Reservation');
const { RATES_TO_EUR, RATES_UPDATED_AT, CURRENCIES, SYMBOLS, LABELS, validCurrency, convert } = require('../config/currency');

const router = express.Router();

// Devises, symboles et taux (pour alimenter les filtres du frontend + moteur de conversion autonome)
router.get('/currencies', (req, res) =>
  res.json({
    success: true,
    currencies: CURRENCIES.map((c) => ({ code: c, symbol: SYMBOLS[c], label: LABELS[c] }))
  })
);

router.get('/rates', (req, res) =>
  res.json({
    success: true,
    base: 'EUR',
    rates: RATES_TO_EUR,
    updatedAt: RATES_UPDATED_AT,
    provider: 'pixelsoftwaredesign-internal'
  })
);

router.get('/countries', async (req, res) => {
  try {
    const cabins = await Cabin.find({
      operatingMode: 'HOST_RENTAL',
      'rentalSettings.isListed': true
    }).select('location.country location.countryName');

    const seen = new Map();
    cabins.forEach((c) => {
      const key = c.location.country || 'UNKNOWN';
      if (!seen.has(key)) seen.set(key, c.location.countryName || key);
    });

    const countries = Array.from(seen, ([code, name]) => ({ code, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    return res.json({ success: true, countries });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route GET /api/cabins/search
 * @desc Rechercher des cabines par pays / ville / prix max et afficher le prix
 *       dans la devise choisie (EUR, TND, USD...).
 */
router.get('/search', async (req, res) => {
  try {
    const { country, city, minPrice, maxPrice, targetCurrency = 'TND', date } = req.query;
    const destCurrency = validCurrency(targetCurrency) ? targetCurrency.toUpperCase() : 'TND';

    const query = {
      operatingMode: 'HOST_RENTAL',
      'rentalSettings.isListed': true,
      status: { $in: ['AVAILABLE', 'CLEANING_REQUIRED'] },
      'location.coordinates.lat': { $ne: 0 },
      'location.coordinates.lng': { $ne: 0 }
    };

    if (country) query['location.country'] = String(country).toUpperCase();
    if (city) query['location.city'] = { $regex: new RegExp(String(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };

    // Filtre de disponibilité sur une date donnée
    let dayBusyIds = new Set();
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      const dayBookings = await Reservation.find({
        startTime: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] }
      }).select('cabinId startTime endTime');

      // Cabines sans AUCUN créneau libre ce jour-là
      const byCabin = new Map();
      dayBookings.forEach(b => {
        if (!byCabin.has(b.cabinId.toString())) byCabin.set(b.cabinId.toString(), []);
        byCabin.get(b.cabinId.toString()).push(b);
      });

      for (const [cabinId, bookings] of byCabin) {
        let hasFree = false;
        for (let h = 8; h <= 22 && !hasFree; h++) {
          const start = new Date(date);
          start.setHours(h, 0, 0, 0);
          const end = new Date(start.getTime() + 3600000);
          const busy = bookings.some(b => b.startTime < end && b.endTime > start);
          if (!busy) hasFree = true;
        }
        if (!hasFree) dayBusyIds.add(cabinId);
      }
    }

    let cabins = await Cabin.find(query);
    if (date) cabins = cabins.filter(c => !dayBusyIds.has(c._id.toString()));
    let results = cabins.map((cabin) => {
      const baseCurrency = cabin.pricing.currency;
      const basePrice = cabin.rentalSettings.pricePerHour || 0;
      const converted = convert(basePrice, baseCurrency, destCurrency);

      return {
        id: cabin._id,
        title: cabin.name,
        address: cabin.address,
        serialNumber: cabin.serialNumber,
        location: cabin.location,
        rooms: cabin.rooms || [],
        telemetry: cabin.telemetry,
        status: cabin.status,
        guestState: cabin.guestState,
        isOnline: isOnline(cabin.telemetry),
        lastUpdate: cabin.telemetry.lastUpdate,
        pricing: {
          originalPrice: basePrice,
          originalCurrency: baseCurrency,
          displayPrice: parseFloat(converted.value.toFixed(2)),
          displayCurrency: destCurrency,
          rate: parseFloat(converted.rate.toFixed(4))
        }
      };
    });

    if (minPrice && !isNaN(minPrice) && results.length) {
      results = results.filter((r) => r.pricing.displayPrice >= Number(minPrice));
    }
    if (maxPrice && !isNaN(maxPrice)) {
      results = results.filter((r) => r.pricing.displayPrice <= Number(maxPrice));
    }

    return res.json({
      success: true,
      count: results.length,
      currency: destCurrency,
      data: results
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur lors de la recherche' });
  }
});

/**
 * @route GET /api/cabins/:id/status
 * @desc Vérification d'une cabine avant réservation : statut, télémétrie,
 *       connectivité et disponibilité sur un créneau.
 */
router.get('/:idOrSerial/status', async (req, res) => {
  try {
    const { idOrSerial } = req.params;
    const cabin = await Cabin.findOne({
      $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(idOrSerial) ? idOrSerial : null },
            { serialNumber: idOrSerial }],
      ...(req.query.cabinId ? { _id: req.query.cabinId } : {})
    });

    if (!cabin) {
      return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    }

    const listed = cabin.operatingMode === 'HOST_RENTAL' && cabin.rentalSettings.isListed;

    let occupied = false;
    if (req.query.startTime) {
      const start = new Date(req.query.startTime);
      const end = req.query.endTime ? new Date(req.query.endTime) : new Date(start.getTime() + 3600000);
      const overlap = await Reservation.findOne({
        cabinId: cabin._id,
        startTime: { $lt: end },
        endTime: { $gt: start },
        status: { $in: ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] }
      });
      occupied = !!overlap;
    }

    const online = isOnline(cabin.telemetry);
    const bookable =
      listed &&
      ['AVAILABLE', 'CLEANING_REQUIRED'].includes(cabin.status) &&
      !occupied;

    return res.json({
      success: true,
      cabin: {
        id: cabin._id,
        serialNumber: cabin.serialNumber,
        name: cabin.name,
        address: cabin.address,
        location: cabin.location,
        rooms: cabin.rooms || [],
        status: cabin.status,
        operatingMode: cabin.operatingMode,
        isListed: cabin.rentalSettings.isListed,
        pricePerHour: cabin.rentalSettings.pricePerHour,
        currency: cabin.pricing.currency,
        telemetry: cabin.telemetry,
        isOnline: online,
        occupied,
        bookable,
        verification: {
          statusText: statusLabel(cabin.status),
          modeText: listed ? 'location' : 'personnel',
          onlineText: online ? 'cabine en ligne' : 'cabine hors ligne',
          checks: {
            mode: listed,
            listed: cabin.rentalSettings.isListed,
            available: cabin.status !== 'OCCUPIED_BY_GUEST' && cabin.status !== 'MAINTENANCE',
            slotFree: !occupied
          }
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

function isOnline(telemetry) {
  if (!telemetry || !telemetry.lastUpdate) return false;
  return Date.now() - new Date(telemetry.lastUpdate).getTime() < 120000;
}

function statusLabel(s) {
  return {
    AVAILABLE: 'Prête',
    OCCUPIED_BY_GUEST: 'Occupée',
    OCCUPIED_BY_OWNER: 'Usage personnel',
    CLEANING_REQUIRED: 'À nettoyer',
    MAINTENANCE: 'Maintenance'
  }[s] || s;
}

module.exports = router;