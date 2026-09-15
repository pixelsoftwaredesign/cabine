(function () {
  'use strict';

  const b64u = {
    bytesTo: (buf) => {
      const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    toBytes: (s) => {
      const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
  };

  const arrayBufferToB64 = (buf) => b64u.bytesTo(new Uint8Array(buf));
  const randomId = () => b64u.bytesTo(crypto.getRandomValues(new Uint8Array(24)));
  const SIM_KEY = (kind) => 'bio.sim.' + kind;

  const detectMode = async () => {
    if (window.isSecureContext && window.PublicKeyCredential) {
      try {
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (available) return 'webauthn';
      } catch (e) { /* ignore */ }
    }
    return 'sim';
  };

  const hasSim = (kind) => !!localStorage.getItem(SIM_KEY(kind));

  async function enroll(kind, getToken) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('WebCrypto indisponible dans ce navigateur');
    }
    if (!getToken || !getToken()) throw new Error('Connexion requise pour l’enregistrement');

    const headers = (json) => ({
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + getToken(),
      ...(json ? { body: JSON.stringify(json) } : {})
    });

    if ((await detectMode()) === 'webauthn') {
      try {
        const beg = await fetch('/api/biometrics/enroll/begin', {
          method: 'POST',
          headers: headers({ kind }).headers,
          body: JSON.stringify({ kind })
        }).then((r) => r.json());
        if (!beg.success) throw new Error(beg.message);

        const o = beg.options;
        const publicKey = {
          challenge: b64u.toBytes(o.challenge),
          rp: o.rp,
          user: { ...o.user, id: b64u.toBytes(o.user.id) },
          pubKeyCredParams: o.pubKeyCredParams,
          attestation: o.attestation,
          authenticatorSelection: o.authenticatorSelection,
          timeout: o.timeout
        };
        const cred = await navigator.credentials.create({ publicKey });
        return await fetch('/api/biometrics/enroll/complete', {
          method: 'POST',
          headers: headers().headers,
          body: JSON.stringify({
            kind,
            credential: {
              id: cred.id,
              rawId: arrayBufferToB64(cred.rawId),
              response: {
                clientDataJSON: arrayBufferToB64(cred.response.clientDataJSON),
                attestationObject: arrayBufferToB64(cred.response.attestationObject)
              }
            }
          })
        }).then((r) => r.json());
      } catch (e) {
        console.warn('WebAuthn échoué, bascule simulation:', e.message);
      }
    }

    // ── Mode simulation (bureau sans TEE) ──
    const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const privateJwk = await crypto.subtle.exportKey('jwk', key.privateKey);
    const publicJwk = await crypto.subtle.exportKey('jwk', key.publicKey);
    const credentialId = randomId();

    const done = await fetch('/api/biometrics/enroll/complete', {
      method: 'POST',
      headers: headers().headers,
      body: JSON.stringify({
        kind,
        mode: 'sim',
        credential: { credentialId, publicKeyJwk: publicJwk }
      })
    }).then((r) => r.json());

    if (done.success) localStorage.setItem(SIM_KEY(kind), JSON.stringify({ credentialId, privateKey: privateJwk }));
    return done;
  }

  async function verify() {
    if (!window.crypto || !window.crypto.subtle) throw new Error('WebCrypto indisponible');

    if ((await detectMode()) === 'webauthn') {
      try {
        const beg = await fetch('/api/biometrics/verify/begin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json());
        if (!beg.success) throw new Error(beg.message);
        const o = beg.options;
        const cred = await navigator.credentials.get({
          publicKey: {
            challenge: b64u.toBytes(o.challenge),
            rpId: o.rpId,
            timeout: o.timeout
          }
        });
        return await fetch('/api/biometrics/verify/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credential: {
              id: cred.id,
              response: {
                clientDataJSON: arrayBufferToB64(cred.response.clientDataJSON),
                authenticatorData: arrayBufferToB64(cred.response.authenticatorData),
                signature: arrayBufferToB64(cred.response.signature),
                userHandle: cred.response.userHandle ? arrayBufferToB64(cred.response.userHandle) : null
              }
            }
          })
        }).then((r) => r.json());
      } catch (e) {
        if (e instanceof DOMException && e.name !== 'NotAllowedError') throw e;
        console.warn('WebAuthn indisponible, bascule simulation:', e.message);
      }
    }

    // ── Mode simulation ──
    let lastErr = 'Aucune identité biométrique enregistrée';
    for (const kind of ['face', 'fingerprint']) {
      const rec = JSON.parse(localStorage.getItem(SIM_KEY(kind)) || 'null');
      if (!rec) continue;
      try {
        const beg = await fetch('/api/biometrics/verify/begin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json());
        const challenge = beg.options.challenge;
        const priv = await crypto.subtle.importKey('jwk', rec.privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
        const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, b64u.toBytes(challenge));
        const done = await fetch('/api/biometrics/verify/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'sim',
            challenge,
            credential: { credentialId: rec.credentialId, signature: arrayBufferToB64(signature) }
          })
        }).then((r) => r.json());
        if (done.success) return done;
        lastErr = done.message;
      } catch (e) {
        lastErr = e.message;
      }
    }
    const err = new Error(lastErr);
    throw err;
  }

  window.BioAuth = { enroll, verify, detectMode, hasSim };
})();