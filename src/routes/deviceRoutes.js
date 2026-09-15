const express = require('express');
const { getThermostatConfig, TOGGLE_DEVICES } = require('../config/devices');

const router = express.Router();

router.get('/iot/devices', (req, res) => {
  res.json({
    success: true,
    thermostats: getThermostatConfig(),
    toggles: TOGGLE_DEVICES
  });
});

module.exports = router;