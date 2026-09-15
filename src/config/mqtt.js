require('dotenv').config();
const mqtt = require('mqtt');

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://127.0.0.1:1883';
const mqttClient = mqtt.connect(MQTT_BROKER, {
  connectTimeout: 10000,
  reconnectPeriod: 5000,
  clean: true
});

mqttClient.on('connect', () => {
  console.log(`Connecté au broker MQTT ${MQTT_BROKER}`);
  mqttClient.subscribe('cabine/+/status');
  mqttClient.subscribe('cabine/+/telemetry');
  mqttClient.subscribe('cabine/+/twin/#');
});

mqttClient.on('reconnect', () => console.log('MQTT reconnection...'));

mqttClient.on('error', (err) => {
  console.error('Erreur MQTT:', err.message);
});

module.exports = mqttClient;