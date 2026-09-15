const crypto = require('crypto');

const b64url = {
  encode: (buf) => Buffer.from(buf).toString('base64url'),
  decode: (s) => Buffer.from(s, 'base64url')
};

const generateChallenge = (bytes = 32) => b64url.encode(crypto.randomBytes(bytes));

// ─── CBOR minimal decoder pour attestationObject & COSE key ───
class CborReader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }
  _int() {
    const ib = this.buf[this.pos++];
    const mt = ib >> 5;
    const ai = ib & 0x1f;
    if (ai < 24) return [mt, ai];
    if (ai === 24) return [mt, this.buf.readUInt8(this.pos++)];
    if (ai === 25) return [mt, this.buf.readUInt16BE((this.pos += 2) - 2)];
    if (ai === 26) return [mt, this.buf.readUInt32BE((this.pos += 4) - 4)];
    throw new Error('CBOR: int trop grand');
  }
  read() {
    const [mt, n] = this._int();
    if (mt === 0) return n;
    if (mt === 1) return -1 - n;
    if (mt === 2) { const b = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return b; }
    if (mt === 3) { const s = this.buf.subarray(this.pos, this.pos + n).toString('utf8'); this.pos += n; return s; }
    if (mt === 4) { const a = []; for (let i = 0; i < n; i++) a.push(this.read()); return a; }
    if (mt === 5) { const m = new Map(); for (let i = 0; i < n; i++) m.set(this.read(), this.read()); return m; }
    if (mt === 6) return this.read();
    if (mt === 7) return null;
    throw new Error('CBOR: type non supporté mt=' + mt);
  }
}

const coseMapToObj = (map) => {
  const out = {};
  for (const [k, v] of map.entries()) out[k] = v;
  return out;
};

const coseToJwk = (cose) => {
  const k = coseMapToObj(cose);
  const kty = k[1];
  const alg = k[3];
  const crv = k[-1];
  if (kty !== 2 || alg !== -7 || crv !== 1) {
    throw new Error('COSE: seule la clé EC2 P-256 ES256 est supportée');
  }
  const x = b64url.encode(k[-2]);
  const y = b64url.encode(k[-3]);
  return { kty: 'EC', crv: 'P-256', x, y, alg: 'ECDSA', ext: true };
};

// Parse attestationObject (CBOR) → { credentialId, publicKeyJwk }
const parseAttestationObject = (attestationObjectB64) => {
  const buf = b64url.decode(attestationObjectB64);
  const reader = new CborReader(buf);
  const top = reader.read();
  if (!(top instanceof Map)) throw new Error('attestationObject invalide');
  const ao = coseMapToObj(top);
  const authData = ao[1];
  if (!Buffer.isBuffer(authData)) throw new Error('authData manquant');

  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  const signCount = authData.readUInt32BE(33);

  let off = 37;
  const aaguid = authData.subarray(off, off + 16); off += 16;
  const credIdLen = authData.readUInt16BE(off); off += 2;
  const credentialId = authData.subarray(off, off + credIdLen); off += credIdLen;

  const coseReader = new CborReader(authData.subarray(off));
  const cose = coseReader.read();
  if (!(cose instanceof Map)) throw new Error('COSE key invalide');

  const publicKeyJwk = coseToJwk(cose);
  return {
    authData,
    rpIdHash,
    flags,
    signCount,
    aaguid,
    credentialId: b64url.encode(credentialId),
    publicKeyJwk
  };
};

// ─── Signature DER → raw r||s (P-256) ───
const derToRaw = (der) => {
  const buf = Buffer.isBuffer(der) ? der : b64url.decode(der);
  let off = 0;
  if (buf[off++] !== 0x30) throw new Error('Signature invalide');
  const seqLen = buf[off++];
  if (buf[off++] !== 0x02) throw new Error('Signature invalide');
  const rLen = buf[off++];
  let r = buf.subarray(off, off + rLen); off += rLen;
  if (buf[off++] !== 0x02) throw new Error('Signature invalide');
  const sLen = buf[off++];
  let s = buf.subarray(off, off + sLen); off += sLen;

  const norm = (bin) => {
    while (bin.length > 32 && bin[0] === 0) bin = bin.subarray(1);
    if (bin.length > 32) throw new Error('Signature trop longue');
    const pad = Buffer.alloc(32 - bin.length);
    return Buffer.concat([pad, bin]);
  };

  return Buffer.concat([norm(r), norm(s)]);
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest();

// Vérifie une assertion WebAuthn complète
const verifyAssertion = async ({
  credential,
  stored,
  expectedChallenge,
  origin,
  rpId
}) => {
  const clientData = JSON.parse(b64url.decode(credential.response.clientDataJSON).toString('utf8'));
  if (clientData.type !== 'webauthn.get') throw new Error('Type assertion invalide');
  if (clientData.challenge !== expectedChallenge) throw new Error('Challenge invalide');
  if (!clientData.origin || !clientData.origin.startsWith(origin)) throw new Error('Origine invalide');

  const authenticatorData = b64url.decode(credential.response.authenticatorData);
  const rpIdHash = authenticatorData.subarray(0, 32);
  const expectedHash = sha256(Buffer.from(rpId));
  if (!rpIdHash.equals(expectedHash)) throw new Error('RP ID invalide');

  const clientDataHash = sha256(b64url.decode(credential.response.clientDataJSON));
  const verifyData = Buffer.concat([authenticatorData, clientDataHash]);

  const key = await crypto.webcrypto.subtle.importKey(
    'jwk',
    stored.publicKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );

  const signature = derToRaw(b64url.decode(credential.response.signature));
  const ok = await crypto.webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature,
    verifyData
  );
  if (!ok) throw new Error('Signature biométrique invalide');

  const signCount = authenticatorData.readUInt32BE(33);
  return { signCount, userHandle: credential.response.userHandle ? b64url.decode(credential.response.userHandle).toString('utf8') : null };
};

module.exports = { generateChallenge, b64url, parseAttestationObject, verifyAssertion };