const mongoose = require('mongoose');

const CabinElementSchema = new mongoose.Schema(
  {
    cabinId: { type: String, default: '' },
    code: { type: String, default: '' },
    type: { type: String, default: 'CABIN_SOLO' },
    title: { type: String, default: '' },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      rotation: { type: Number, default: 0 },
      unit: { type: String, default: 'm' }
    },
    dimension: { w: { type: Number, default: 1 }, h: { type: Number, default: 1 } },
    status: { type: String, default: 'AVAILABLE' },
    iot: { type: Boolean, default: false }
  },
  { _id: false }
);

const IndoorLayoutSchema = new mongoose.Schema(
  {
    floorId: { type: String, required: true, unique: true, index: true },
    engine: { type: String, default: 'PixMaps Editor v2.0' },
    plan: {
      width: { type: Number, default: 40 },
      height: { type: Number, default: 30 },
      unit: { type: String, default: 'm' },
      grid: { type: Number, default: 0.5 }
    },
    walls: [
      {
        start: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 } },
        end: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 } }
      }
    ],
    cabins: { type: [CabinElementSchema], default: [] },
    savedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('IndoorLayout', IndoorLayoutSchema);