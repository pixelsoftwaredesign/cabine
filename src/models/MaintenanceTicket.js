const mongoose = require('mongoose');

const MaintenanceTicketSchema = new mongoose.Schema(
  {
    cabinId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cabin', required: true },
    cabinSerial: { type: String, default: '' },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reporterName: { type: String, default: '' },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'MAINTENANCE', 'RESOLVED', 'REJECTED'],
      default: 'OPEN'
    },
    resolution: { type: String, default: '' },
    resolvedBy: { type: String, default: '' },
    resolvedAt: { type: Date },
    assignedTechId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    technician: { type: String, default: '' },
    qualityScore: { type: Number, min: 0, max: 5 },
    controlledBy: { type: String, default: '' },
    controlledAt: { type: Date },
    approved: { type: Boolean }
  },
  { timestamps: true }
);

module.exports = mongoose.model('MaintenanceTicket', MaintenanceTicketSchema);