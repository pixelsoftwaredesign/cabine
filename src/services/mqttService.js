const mqttClient = require('../config/mqtt');

const publishCommand = (cabinSerial, device, payload) => {
  const topic = `cabine/${cabinSerial}/${device}/cmd`;
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  mqttClient.publish(topic, message, { retain: false });
  console.log(`[MQTT] → ${topic} : ${message}`);
};

const publishSystemConfig = (cabinSerial, payload) => {
  const topic = `cabine/${cabinSerial}/system/config`;
  mqttClient.publish(topic, JSON.stringify(payload), { retain: true });
  console.log(`[MQTT] → ${topic} :`, JSON.stringify(payload));
};

module.exports = { publishCommand, publishSystemConfig };