const mongoose = require('mongoose');

const RuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cabinId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cabin' },

    condition: {
      field: { type: String, required: true },
      operator: {
        type: String,
        enum: ['>', '<', '>=' ,'<=' , '=', '!='],
        default: '>'
      },
      threshold: { type: Number, required: true }
    },

    action: {
      device: { type: String, required: true },
      value: { type: String, default: 'ON' }
    },

    resetAction: {
      device: { type: String },
      value: { type: String }
    },

    enabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Rule', RuleSchema);