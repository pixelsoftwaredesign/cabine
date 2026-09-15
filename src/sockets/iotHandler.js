const mqttClient = require('../config/mqtt');
const Cabin = require('../models/Cabin');
const { evaluateRulesForCabin } = require('../services/automationRules');
const { clampSetpoint } = require('../config/devices');

const handleTelemetry = async (topic, data) => {
  const parts = topic.split('/');
  const cabinSerial = parts[1];

  const cabin = await Cabin.findOne({ serialNumber: cabinSerial });
  if (!cabin) return;

  Object.assign(cabin.telemetry, {
    ...data,
    lastUpdate: new Date()
  });
  await cabin.save();

  await evaluateRulesForCabin({
    cabinSerial,
    cabinId: cabin._id,
    telemetry: cabin.telemetry
  });
};

module.exports = (io) => {
  mqttClient.on('message', async (topic, message) => {
    const payload = message.toString();

    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      data = payload;
    }

    console.log(`[MQTT] ${topic} : ${payload}`);

    try {
      if (topic.endsWith('/telemetry')) {
        await handleTelemetry(topic, data);
      } else if (topic.endsWith('/status')) {
        const cabinet = await Cabin.findOne({ serialNumber: topic.split('/')[1] });
        if (cabinet) {
          Object.assign(cabinet.telemetry, { ...(data || {}), lastUpdate: new Date() });
          await cabinet.save();
        }
      }
    } catch (err) {
      console.error('Erreur mise à jour cabine:', err.message);
    }

    io.emit('iot:telemetry', { topic, data });
  });

  io.on('connection', (socket) => {
    console.log(`Client connecté (ID Socket: ${socket.id})`);

    socket.on('iot:command', (command) => {
      let { cabinSerial, deviceId, action, value } = command;
      if (typeof value === 'number') value = clampSetpoint(deviceId, value);
      const topic = `cabine/${cabinSerial}/${deviceId}/cmd`;
      const payload = JSON.stringify({ action, value });

      mqttClient.publish(topic, payload);
      console.log(`[Commande Web] Publiée sur ${topic}:`, payload);
    });

    socket.on('iot:voice_command', (command) => {
      console.log(`[Commande Vocale] ${command.text}`);
      io.emit('iot:voice_command', command);
    });

    socket.on('disconnect', () => {
      console.log(`Client déconnecté: ${socket.id}`);
    });
  });
};