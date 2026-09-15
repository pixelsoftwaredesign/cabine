const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String },
    role: {
      type: String,
      enum: [
        'GUEST',
        'PARTNER',
        'ADMIN',
        'MANAGER',
        'TECHNICIAN',
        'HOUSEKEEPER',
        'HOUSEKEEPER_GOVERNANT',
        'MAINTENANCE_CONTROLLER',
        'DEVELOPER',
        'IOT_AGENT',
        'SALES',
        'AFTER_SALES',
        'SALES_AGENT'
      ],
      default: 'GUEST'
    },
    skills: { type: [String], default: [] },
    assignedZone: {
      city: { type: String, default: '' },
      region: { type: String, default: '' }
    },
    workforceStatus: {
      type: String,
      enum: ['AVAILABLE', 'ON_MISSION', 'OFF_DUTY'],
      default: 'AVAILABLE'
    },
    lastKnownLocation: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
      updatedAt: { type: Date }
    },
    stripeAccountId: { type: String },
    stripeAccountStatus: {
      type: String,
      enum: ['NONE', 'PENDING', 'ACTIVE'],
      default: 'NONE'
    }
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', UserSchema);