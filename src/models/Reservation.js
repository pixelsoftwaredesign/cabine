const mongoose = require('mongoose');

const ReservationSchema = new mongoose.Schema(
  {
    cabinId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cabin', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },

    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    totalPrice: { type: Number, required: true },
    currency: { type: String, default: 'eur' },

    accessCode: { type: String },
    accessCodeExpiresAt: { type: Date },

    status: {
      type: String,
      enum: ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'PENDING_PAYMENT'
    },

    warningSent: { type: Boolean, default: false }
  },
  { timestamps: true }
);

ReservationSchema.index({ cabinId: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.model('Reservation', ReservationSchema);