const THERMOSTATS = {
  climate: {
    label: 'Climatisation',
    icon: '🌡️',
    kind: 'cooling',
    min: 18,
    max: 30,
    unit: '°C',
    default: 22
  },
  heater: {
    label: 'Chauffage',
    icon: '🔥',
    kind: 'heating',
    min: 30,
    max: 40,
    unit: '°C',
    default: 34
  },
  waterHeater: {
    label: 'Chauffe-eau',
    icon: '♨️',
    kind: 'water',
    min: 30,
    max: 60,
    unit: '°C',
    default: 45
  },
  lightTemp: {
    label: 'Lumière chaude/froide',
    icon: '💡',
    kind: 'light',
    min: 2700,
    max: 6500,
    step: 100,
    unit: 'K',
    default: 3500
  },
  lightSat: {
    label: 'Saturation rouge',
    icon: '❤️',
    kind: 'light',
    min: 0,
    max: 100,
    step: 5,
    unit: '%',
    default: 0
  }
};

const TOGGLE_DEVICES = {
  lighting: { label: 'Éclairage', icon: '💡' },
  ventilation: { label: 'Ventilation', icon: '🌀' },
  speaker: { label: 'Audio', icon: '🔊' },
  lock: { label: 'Serrure', icon: '🔒' }
};

const DEVICE_CATALOG = {
  ...TOGGLE_DEVICES,
  ...Object.fromEntries(
    Object.entries(THERMOSTATS).map(([k, v]) => [k, { label: v.label, icon: v.icon }])
  )
};

const getThermostatConfig = () =>
  Object.fromEntries(
    Object.entries(THERMOSTATS).map(([k, v]) => [
      k,
      { label: v.label, icon: v.icon, kind: v.kind, min: v.min, max: v.max, unit: v.unit, default: v.default }
    ])
  );

const clampSetpoint = (deviceId, value) => {
  const t = THERMOSTATS[deviceId];
  if (!t) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return t.default;
  return Math.min(t.max, Math.max(t.min, Math.round(n)));
};

module.exports = { THERMOSTATS, TOGGLE_DEVICES, DEVICE_CATALOG, getThermostatConfig, clampSetpoint };