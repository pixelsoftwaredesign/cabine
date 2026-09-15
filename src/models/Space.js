const mongoose = require('mongoose');

const LevelSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: '' },
    planImage: { type: String, default: '' },
    width: { type: Number, default: 1000 },
    height: { type: Number, default: 800 }
  },
  { _id: true }
);

const BeaconsSchema = new mongoose.Schema(
  {
    uuid: { type: String, default: '' },
    code: { type: String, default: '' },
    label: { type: String, default: '' },
    level: { type: String, default: '' },
    major: { type: Number, default: 0 },
    minor: { type: Number, default: 0 },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 }
  },
  { _id: true }
);

const SpaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['BUILDING', 'MALL', 'AIRPORT', 'FACTORY', 'HOTEL', 'PRIVATE'],
      default: 'BUILDING'
    },
    address: { type: String, default: '' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    levels: { type: [LevelSchema], default: [] },
    beacons: { type: [BeaconsSchema], default: [] }
  },
  { timestamps: true }
);

SpaceSchema.index({ ownerId: 1 });

module.exports = mongoose.model('Space', SpaceSchema);