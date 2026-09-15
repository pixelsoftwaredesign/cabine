const cron = require('node-cron');
const Reservation = require('../models/Reservation');
const Cabin = require('../models/Cabin');
const { publishCommand, publishSystemConfig } = require('./mqttService');

const WARNING_MINUTES = 10;

const startAutomation = (io) => {
  cron.schedule('* * * * *', async () => {
    const now = new Date();

    await handleSessionStarts(now);
    await handleExpiringSessions(now, io);
    await handleSessionEnds(now, io);
  });
};

const handleSessionStarts = async (now) => {
  const due = await Reservation.find({
    startTime: { $lte: now },
    endTime: { $gt: now },
    status: 'CONFIRMED'
  }).populate('cabinId');

  for (const res of due) {
    res.status = 'IN_PROGRESS';
    await res.save();

    const cabin = res.cabinId;
    cabin.status = 'OCCUPIED_BY_GUEST';
    await cabin.save();

    publishCommand(cabin.serialNumber, 'power', { action: 'POWER_ON' });
    publishCommand(cabin.serialNumber, 'climate', { action: 'PRECONDITIONING' });
  }
};

const handleExpiringSessions = async (now, io) => {
  const warningAt = new Date(now.getTime() + WARNING_MINUTES * 60000);

  const expiring = await Reservation.find({
    endTime: { $lte: warningAt, $gt: now },
    status: 'IN_PROGRESS',
    warningSent: { $ne: true }
  });

  for (const res of expiring) {
    res.warningSent = true;
    await res.save();
    io.emit('cabine:warning', {
      reservationId: res._id,
      message: `Votre créneau se termine dans ${WARNING_MINUTES} minutes`,
      minutesLeft: WARNING_MINUTES
    });
  }
};

const handleSessionEnds = async (now, io) => {
  const expired = await Reservation.find({
    endTime: { $lte: now },
    status: { $in: ['IN_PROGRESS', 'CONFIRMED'] }
  }).populate('cabinId');

  for (const res of expired) {
    res.status = 'COMPLETED';
    await res.save();

    const cabin = res.cabinId;
    cabin.operatingMode === 'HOST_RENTAL'
      ? (cabin.status = 'CLEANING_REQUIRED')
      : (cabin.status = 'AVAILABLE');
    await cabin.save();

    publishCommand(cabin.serialNumber, 'lock', { action: 'LOCK' });
    publishCommand(cabin.serialNumber, 'power', { action: 'POWER_OFF' });
    publishSystemConfig(cabin.serialNumber, {
      event: 'SESSION_ENDED',
      reservationId: res._id
    });

    io.emit('cabine:session_ended', {
      reservationId: res._id,
      cabinSerial: cabin.serialNumber
    });
  }
};

module.exports = startAutomation;