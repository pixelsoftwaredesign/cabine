const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopProduct', required: true },
    cabinId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cabin' },

    price: { type: Number, required: true },
    currency: { type: String, default: 'eur' },
    serialNumber: { type: String },

    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'FULFILLED', 'CANCELLED'],
      default: 'PAID'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', OrderSchema);