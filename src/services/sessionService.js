const Cabin = require('../models/Cabin');
const Reservation = require('../models/Reservation');
const { publishCommand, publishSystemConfig } = require('./mqttService');

const findActiveReservationForUser = async (userId) => {
  const now = new Date();
  return Reservation.findOne({
    userId,
    startTime: { $lte: now },
    endTime: { $gte: now },
    status: { $in: ['CONFIRMED', 'IN_PROGRESS'] }
  }).populate('userId', 'name email');
};

const openGuestSession = async ({ userId }) => {
  const reservation = await findActiveReservationForUser(userId);
  if (!reservation) return null;

  const cabin = await Cabin.findById(reservation.cabinId);

  if (cabin && cabin.status !== 'OCCUPIED_BY_GUEST') {
    cabin.status = 'OCCUPIED_BY_GUEST';
    await cabin.save();
    publishCommand(cabin.serialNumber, 'lock', { action: 'UNLOCK' });
    publishCommand(cabin.serialNumber, 'power', { action: 'POWER_ON' });
    publishCommand(cabin.serialNumber, 'lighting', { action: 'SET', value: 'ON' });
    publishSystemConfig(cabin.serialNumber, {
      event: 'GUEST_ARRIVED',
      reservationId: reservation._id
    });
  }

  if (cabin && cabin.guestState !== 'INSIDE') {
    cabin.guestState = 'INSIDE';
    cabin.guestEnteredAt = new Date();
    await cabin.save();
  }

  return {
    id: reservation._id,
    cabinName: cabin?.name || null,
    cabinSerial: cabin?.serialNumber || null,
    clientName: reservation.userId?.name,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    minutesLeft: Math.round((reservation.endTime - Date.now()) / 60000)
  };
};

module.exports = { findActiveReservationForUser, openGuestSession };