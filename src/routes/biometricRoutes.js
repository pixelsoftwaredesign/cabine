const express = require('express');
const crypto = require('crypto');
const BiometricCredential = require('../models/BiometricCredential');
const { authMiddleware } = require('../middleware/auth');
const { generateChallenge, b64url, parseAttestationObject, verifyAssertion } = require('../services/webauthn');
const { openGuestSession } = require('../services/sessionService');

const router = express.Router();

const CHALLENGE_TTL = 120000;
const challenges = new Map();
const storeChallenge = (challenge, data) => {
  challenges.set(challenge, { ...data, expires: Date.now() + CHALLENGE_TTL });
  setTimeout(() => challenges.delete(challenge), CHALLENGE_TTL);
};
const takeChallenge = (challenge, type) => {
  const c = challenges.get(challenge);
  if (!c) return null;
  challenges.delete(challenge);
  if (c.type !== type) return null;
  if (Date.now() > c.expires) return null;
  return c;
};

// ─── Début enregistrement (identifié) : options WebAuthn ───
router.post('/enroll/begin', authMiddleware, async (req, res) => {
  try {
    const { kind } = req.body || {};
    if (!kind || !['face', 'fingerprint'].includes(kind)) {
      return res.status(400).json({ success: false, message: 'kind invalide (face|fingerprint)' });
    }
    const rpId = req.hostname || 'localhost';
    const challenge = generateChallenge();
    const userHandle = String(req.user._id);

    storeChallenge(challenge, { type: 'create', kind, userId: userHandle });

    return res.json({
      success: true,
      options: {
        challenge,
        rp: { name: 'Cabine IoT', id: rpId },
        user: {
          id: b64url.encode(userHandle),
          name: (req.user.name || req.user.email).slice(0, 64),
          displayName: (req.user.name || req.user.email).slice(0, 64)
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'preferred'
        },
        timeout: 60000
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Début vérification (kiosk public) ───
router.post('/verify/begin', async (req, res) => {
  try {
    const rpId = req.hostname || 'localhost';
    const origin = `${req.protocol}://${req.get('host')}`;
    const challenge = generateChallenge();
    storeChallenge(challenge, { type: 'get' });
    return res.json({ success: true, options: { challenge, rpId, origin, timeout: 60000 } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Fin enregistrement ───
router.post('/enroll/complete', authMiddleware, async (req, res) => {
  try {
    const { kind, credential, mode } = req.body || {};
    if (!kind || !['face', 'fingerprint'].includes(kind)) {
      return res.status(400).json({ success: false, message: 'kind invalide (face|fingerprint)' });
    }
    if (!credential) return res.status(400).json({ success: false, message: 'credential manquant' });

    let credId, publicKeyJwk, signCount = 0, userHandle = String(req.user._id), m = 'webauthn';

    if (mode === 'sim') {
      if (!credential.credentialId || !credential.publicKeyJwk) {
        return res.status(400).json({ success: false, message: 'identité simulée incomplète' });
      }
      m = 'sim';
      credId = credential.credentialId;
      publicKeyJwk = credential.publicKeyJwk;
    } else {
      const reqChallenge = credential.clientDataJSON
        ? JSON.parse(b64url.decode(credential.clientDataJSON).toString('utf8')).challenge
        : null;
      const c = takeChallenge(reqChallenge, 'create');
      if (!c || c.userId !== userHandle) {
        return res.status(400).json({ success: false, message: 'Challenge invalide ou expiré' });
      }
      const parsed = parseAttestationObject(credential.response.attestationObject);
      credId = parsed.credentialId;
      publicKeyJwk = parsed.publicKeyJwk;
      signCount = parsed.signCount;
    }

    const doc = await BiometricCredential.findOneAndUpdate(
      { userId: req.user._id, kind },
      {
        userId: req.user._id,
        kind,
        mode: m,
        credId,
        userHandle,
        publicKeyJwk,
        signCount,
        label: kind === 'face' ? 'Visage' : 'Empreinte digitale'
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      message: `${kind === 'face' ? 'Visage' : 'Empreinte'} enregistré(e) (${m === 'sim' ? 'simulation' : 'TEE/puce du terminal'})`,
      kind,
      mode: doc.mode
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Fin vérification (kiosk public) ───
router.post('/verify/complete', async (req, res) => {
  try {
    const { credential, challenge, mode } = req.body || {};
    if (!credential) return res.status(400).json({ success: false, message: 'credential manquant' });

    let stored, userId, signCount = 0;

    if (mode === 'sim') {
      const c = takeChallenge(challenge, 'get');
      if (!c) return res.status(400).json({ success: false, message: 'Challenge invalide ou expiré' });

      stored = await BiometricCredential.findOne({ credId: credential.credentialId, mode: 'sim' });
      if (!stored) {
        return res.status(404).json({ success: false, message: 'Aucune identité biométrique enregistrée' });
      }

      const key = await crypto.webcrypto.subtle.importKey(
        'jwk',
        stored.publicKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const signature = b64url.decode(credential.signature);
      const ok = await crypto.webcrypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        signature,
        b64url.decode(challenge)
      );
      if (!ok) return res.status(401).json({ success: false, message: 'Reconnaissance échouée' });
      userId = stored.userId;
    } else {
      const clientData = JSON.parse(b64url.decode(credential.response.clientDataJSON).toString('utf8'));
      const c = takeChallenge(clientData.challenge, 'get');
      if (!c) return res.status(400).json({ success: false, message: 'Challenge invalide ou expiré' });

      stored = await BiometricCredential.findOne({ credId: credential.id });
      if (!stored) {
        return res.status(404).json({ success: false, message: 'Aucune identité biométrique enregistrée' });
      }
      if (stored.mode !== 'webauthn') {
        return res.status(400).json({ success: false, message: 'Identité stockée en mode simulation' });
      }

      const rpId = req.hostname || 'localhost';
      const origin = `${req.protocol}://${req.get('host')}`;
      const result = await verifyAssertion({
        credential,
        stored,
        expectedChallenge: clientData.challenge,
        origin,
        rpId
      });

      if (result.signCount > 0 && stored.signCount >= result.signCount) {
        return res.status(401).json({ success: false, message: 'Réponse réutilisée (clonage détecté)' });
      }
      if (result.userHandle && stored.userHandle && result.userHandle !== stored.userHandle) {
        return res.status(401).json({ success: false, message: 'Identité incohérente' });
      }
      signCount = result.signCount;
      userId = stored.userId;
    }

    if (signCount > stored.signCount) {
      stored.signCount = signCount;
      await stored.save();
    }

    const reservation = await openGuestSession({ userId });
    if (!reservation) {
      return res.status(401).json({ success: false, message: 'Aucune réservation active pour cette identité' });
    }

    return res.json({ success: true, message: 'Bienvenue !', method: 'biometric', reservation });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;