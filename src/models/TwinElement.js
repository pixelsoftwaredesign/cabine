const mongoose = require('mongoose');

const TwinElementSchema = new mongoose.Schema({
  guid: { type: String, required: true, unique: true },
  cabinSerial: { type: String, index: true, default: '' },
  name: { type: String, default: '' },
  type: {
    type: String,
    enum: ['ESP32', 'RELAY', 'SENSOR', 'DOOR', 'LOCK', 'POWER', 'LIGHT'],
    default: 'SENSOR'
  },
  floor: { type: String, default: 'RDC' },
  zone: { type: String, default: '' },
  pos: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 }, z: { type: Number, default: 0 } },
  status: { type: String, default: 'OK' },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  topic: { type: String, default: '' },
  kind: { type: String, default: 'DEVICE' },
  history: [
    {
      ts: { type: Date, default: Date.now },
      status: { type: String },
      value: { type: mongoose.Schema.Types.Mixed }
    }
  ]
}, { timestamps: true });

TwinElementSchema.index({ cabinSerial: 1, type: 1 });

module.exports = mongoose.model('TwinElement', TwinElementSchema);