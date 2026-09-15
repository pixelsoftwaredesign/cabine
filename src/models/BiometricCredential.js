const mongoose = require('mongoose');

const BiometricCredentialSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['face', 'fingerprint'], required: true },
    mode: { type: String, enum: ['webauthn', 'sim'], default: 'webauthn' },
    credId: { type: String, required: true },
    userHandle: { type: String },
    publicKeyJwk: { type: Object },
    signCount: { type: Number, default: 0 },
    label: { type: String, default: '' }
  },
  { timestamps: true }
);

BiometricCredentialSchema.index({ userId: 1, kind: 1 }, { unique: true });

module.exports = mongoose.model('BiometricCredential', BiometricCredentialSchema);