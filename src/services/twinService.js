const mqttClient = require('../config/mqtt');

const DEFAULT_ELEMENTS = (serial) => [
  { guid: `${serial}_ESP32_CORE`, name: 'Contrôleur ESP32', type: 'ESP32', floor: 'RDC', zone: 'Armoire',
    pos: { x: 0, y: 0.6, z: 0 }, status: 'ONLINE', value: { uptime: 0, fw: 'v1.0' } },
  { guid: `${serial}_POWER_METER`, name: 'Compteur d’énergie', type: 'POWER', floor: 'RDC', zone: 'Armoire',
    pos: { x: 0.2, y: 0.6, z: 0.1 }, status: 'OK', value: { watts: 0, kwh: 0 } },
  { guid: `${serial}_LOCK_ENTRY`, name: 'Serrure porte d’entrée', type: 'LOCK', floor: 'RDC', zone: 'Entrée',
    pos: { x: 2.2, y: 0.8, z: 0.4 }, status: 'CLOSED', value: { state: 'locked' } },
  { guid: `${serial}_RELAY_HEATING`, name: 'Relais chauffage', type: 'RELAY', floor: 'RDC', zone: 'Climatisation',
    pos: { x: 0.1, y: 0.7, z: 1.1 }, status: 'OFF', value: { state: 0 } },
  { guid: `${serial}_RELAY_COOLING`, name: 'Relais climatisation', type: 'RELAY', floor: 'RDC', zone: 'Climatisation',
    pos: { x: 0.1, y: 0.7, z: 1.3 }, status: 'OFF', value: { state: 0 } },
  { guid: `${serial}_RELAY_LIGHTING`, name: 'Relais éclairage', type: 'RELAY', floor: 'RDC', zone: 'Plafond',
    pos: { x: 1.2, y: 1.9, z: 0.8 }, status: 'OFF', value: { state: 0 } },
  { guid: `${serial}_SENSOR_TEMP`, name: 'Capteur température', type: 'SENSOR', floor: 'RDC', zone: 'Salon',
    pos: { x: 1.5, y: 1.2, z: 1.2 }, status: 'OK', value: { temperature: 22, humidity: 45 } },
  { guid: `${serial}_SENSOR_PRESENCE`, name: 'Capteur de présence', type: 'SENSOR', floor: 'RDC', zone: 'Entrée',
    pos: { x: 2.0, y: 1.5, z: 0.3 }, status: 'IDLE', value: { present: false } },
  { guid: `${serial}_DOOR_STATE`, name: 'Télécommande porte', type: 'DOOR', floor: 'RDC', zone: 'Entrée',
    pos: { x: 2.4, y: 0.9, z: 0.4 }, status: 'CLOSED', value: { door: 'closed' } }
];

const STATUS_COLOR = {
  OK: '#5fb27f', ONLINE: '#5fb27f', IDLE: '#94a3b8', OFF: '#94a3b8',
  ON: '#f2a65a', ACTIVE: '#f2a65a', OPEN: '#7dd3fc', CLOSED: '#94a3b8',
  ALARM: '#fb7185'
};

const STATUS_BADGE = {
  OK: 'ok', ONLINE: 'ok', IDLE: 'muted', OFF: 'muted',
  ON: 'warn', ACTIVE: 'warn', OPEN: 'blue', CLOSED: 'muted',
  ALARM: 'red'
};

module.exports = { DEFAULT_ELEMENTS, STATUS_COLOR, STATUS_BADGE };