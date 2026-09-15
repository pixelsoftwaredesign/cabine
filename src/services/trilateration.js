// Géolocalisation indoor par trilatération RSSI (balises iBeacon/Wi-Fi).
// Modèle de propagation IndoorITU simplifié : d = 10^((A0 - RSSI) / (10·n))
//   A0 : puissance reçue (dBm) à 1 mètre (calibrage point d'accès)
//   n  : coefficient d'atténuation en environnement intérieur

const A0 = -55;
const N = 2.2;

// RSSI (dBm) -> distance (unité du plan : px)
function rssiToDistance(rssi) {
  if (typeof rssi !== 'number' || isNaN(rssi)) return null;
  if (rssi >= -20) return 0.3;
  return Math.pow(10, (A0 - rssi) / (10 * N));
}

// Estimé la position [x, y] par moindres carrés linéarisés (référence = premier point).
// points : [{ x, y, d }] — au moins 3 mesures
function localize(points) {
  if (!Array.isArray(points) || points.length < 3) return null;

  const usable = points.filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.d === 'number');
  if (usable.length < 3) return null;

  const [ref, ...rest] = usable;
  const A = [];
  const b = [];
  for (const p of rest) {
    A.push([2 * (p.x - ref.x), 2 * (p.y - ref.y)]);
    b.push(ref.d * ref.d - p.d * p.d + p.x * p.x + p.y * p.y - ref.x * ref.x - ref.y * ref.y);
  }

  let a11 = 0, a12 = 0, a22 = 0, c1 = 0, c2 = 0;
  for (let i = 0; i < A.length; i++) {
    const u = A[i][0], v = A[i][1], w = b[i];
    a11 += u * u; a12 += u * v; a22 += v * v;
    c1 += u * w; c2 += v * w;
  }

  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-12) return null;

  const x = (c1 * a22 - c2 * a12) / det;
  const y = (a11 * c2 - a12 * c1) / det;
  return { x, y };
}

// Génère un RSSI réaliste pour une balise placée en (bx,by) depuis une position (x,y).
// Exposé pour la simulation cliente et les tests.
function simulateRssi(bx, by, x, y, noise = 2.5) {
  const d = Math.max(0.5, Math.hypot(bx - x, by - y));
  const rssi = A0 - 10 * N * Math.log10(d);
  if (noise <= 0) return Math.round(rssi * 10) / 10;
  return Math.round((rssi + (Math.random() * 2 - 1) * noise) * 10) / 10;
}

module.exports = { rssiToDistance, localize, simulateRssi, A0, N };