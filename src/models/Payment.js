const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation' },
    cabinId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cabin' },
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    stripePaymentIntentId: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'eur' },

    platformFee: { type: Number, default: 0 },
    partnerPayout: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'PAID_OUT'],
      default: 'PENDING'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', PaymentSchema);