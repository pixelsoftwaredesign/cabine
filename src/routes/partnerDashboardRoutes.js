const express = require('express');
const mongoose = require('mongoose');
const Cabin = require('../models/Cabin');
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireRole('PARTNER', 'ADMIN'));

const partnerCabinIds = async (userId) => {
  const cabins = await Cabin.find({ ownerId: userId }).select('_id');
  return cabins.map((c) => c._id);
};

router.get('/finances', async (req, res) => {
  try {
    const cabinIds = await partnerCabinIds(req.user._id);

    const totals = await Payment.aggregate([
      { $match: { partnerId: req.user._id, status: { $in: ['SUCCEEDED', 'PAID_OUT'] } } },
      {
        $group: {
          _id: null,
          gross: { $sum: '$amount' },
          fees: { $sum: '$platformFee' },
          net: { $sum: '$partnerPayout' },
          bookings: { $sum: 1 }
        }
      }
    ]);

    const recent = await Payment.find({ partnerId: req.user._id })
      .populate('cabinId', 'name')
      .populate('guestId', 'name email')
      .sort({ createdAt: -1 })
      .limit(20);

    const cabinCount = cabinIds.length;

    return res.json({
      success: true,
      finance: {
        gross: totals[0]?.gross || 0,
        fees: totals[0]?.fees || 0,
        net: totals[0]?.net || 0,
        bookings: totals[0]?.bookings || 0,
        cabinCount
      },
      recent
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/occupancy', async (req, res) => {
  try {
    const cabinIds = await partnerCabinIds(req.user._id);

    const cabins = await Cabin.find({ _id: { $in: cabinIds } })
      .populate({ path: 'ownerId', select: 'name email' });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const reservations = await Reservation.find({
      cabinId: { $in: cabinIds },
      startTime: { $lt: now },
      endTime: { $gt: monthStart },
      status: { $in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] }
    });

    let hoursBooked = 0;
    for (const r of reservations) {
      const start = Math.max(r.startTime.getTime(), monthStart.getTime());
      const end = Math.min(r.endTime.getTime(), now.getTime());
      if (end > start) hoursBooked += (end - start) / 3600000;
    }

    const hoursMonth = 24 * now.getDate();
    const occupancyRate = hoursMonth > 0 ? Math.min(100, Math.round((hoursBooked / (hoursMonth * cabinIds.length)) * 100)) : 0;

    const upcoming = await Reservation.find({
      cabinId: { $in: cabinIds },
      startTime: { $gt: now },
      status: 'CONFIRMED'
    })
      .populate('cabinId', 'name')
      .populate('userId', 'name')
      .sort({ startTime: 1 })
      .limit(10);

    return res.json({
      success: true,
      occupancy: {
        rate: occupancyRate,
        hoursBooked: Math.round(hoursBooked),
        occupiedNow: cabins.filter((c) => c.status === 'OCCUPIED_BY_GUEST').length,
        availableCount: cabins.filter((c) => c.status === 'AVAILABLE').length,
        cleaningCount: cabins.filter((c) => c.status === 'CLEANING_REQUIRED').length,
        totalCabins: cabins.length
      },
      cabins,
      upcoming
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/bookings', async (req, res) => {
  try {
    const cabinIds = await partnerCabinIds(req.user._id);

    const bookings = await Reservation.find({ cabinId: { $in: cabinIds } })
      .populate('cabinId', 'name serialNumber')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({ success: true, bookings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;