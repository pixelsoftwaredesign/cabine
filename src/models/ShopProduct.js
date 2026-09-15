const mongoose = require('mongoose');

const ShopProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    image: { type: String },
    price: { type: Number, required: true },
    currency: { type: String, default: 'eur' },

    specs: {
      surfaceM2: { type: Number },
      capacity: { type: Number, default: 2 },
      connected: { type: Boolean, default: true },
      voiceControl: { type: Boolean, default: true },
      rooms: { type: [String], default: [] }
    },

    defaultRentalPricePerHour: { type: Number, default: 12 },
    stock: { type: Number, default: 999 },
    available: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShopProduct', ShopProductSchema);