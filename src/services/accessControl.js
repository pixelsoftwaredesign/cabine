const Cabin = require('../models/Cabin');
const Reservation = require('../models/Reservation');

const canAccessCabin = async (userId, cabinId) => {
  const cabin = await Cabin.findById(cabinId);
  if (!cabin) return { authorized: false, reason: 'NOT_FOUND' };

  if (cabin.ownerId.toString() === userId.toString()) {
    return { authorized: true, role: 'OWNER', cabin };
  }

  const now = new Date();
  const active = await Reservation.findOne({
    cabinId,
    userId,
    startTime: { $lte: now },
    endTime: { $gte: now },
    status: { $in: ['CONFIRMED', 'IN_PROGRESS'] }
  });

  if (active) {
    return { authorized: true, role: 'GUEST', cabin, reservation: active };
  }

  return { authorized: false, reason: 'NO_ACCESS', cabin };
};

module.exports = { canAccessCabin };