const mongoose = require('mongoose');

const ComponentStockSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    stock: { type: Number, default: 0 },
    unit: { type: String, default: 'u' },
    minWarning: { type: Number, default: 5 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComponentStock', ComponentStockSchema);