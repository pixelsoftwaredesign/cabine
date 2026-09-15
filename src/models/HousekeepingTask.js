const mongoose = require('mongoose');

const HousekeepingTaskSchema = new mongoose.Schema(
  {
    cabinId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cabin', required: true },
    cabinSerial: { type: String, default: '' },
    assignedAgent: { type: String, default: '' },
    agentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    qualityScore: { type: Number, min: 0, max: 5 },
    completedBy: { type: String, default: '' },
    reviewedBy: { type: String, default: '' },
    reviewedAt: { type: Date },
    approved: { type: Boolean },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'],
      default: 'PENDING'
    },
    accessCode: { type: String, default: '' },
    scheduledAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    checklist: [
      {
        key: { type: String },
        label: { type: String },
        done: { type: Boolean, default: false }
      }
    ],
    photos: { type: [String], default: [] },
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

HousekeepingTaskSchema.index({ status: 1, createdAt: -1 });
HousekeepingTaskSchema.index({ cabinId: 1 });

module.exports = mongoose.model('HousekeepingTask', HousekeepingTaskSchema);