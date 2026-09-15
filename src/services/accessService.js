const crypto = require('crypto');
const Reservation = require('../models/Reservation');

const generateAccessCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const verifyAccessCode = async ({ pinCode, cabinId }) => {
  const now = new Date();
  const query = {
    accessCode: pinCode,
    startTime: { $lte: now },
    endTime: { $gte: now },
    status: { $in: ['CONFIRMED', 'IN_PROGRESS'] }
  };
  if (cabinId) query.cabinId = cabinId;

  const reservation = await Reservation.findOne(query).populate('userId', 'name email');

  return reservation;
};

module.exports = { generateAccessCode, verifyAccessCode };