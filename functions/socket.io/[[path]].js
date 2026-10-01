/**
 * Proxy Socket.IO : /socket.io/* -> backend Node (Render).
 * Supporte le handshake polling ET l'upgrade WebSocket.
 */
const BACKEND = 'https://cabine-backend.onrender.com';
const BACKEND_HOST = new URL(BACKEND).host;

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer',
  'proxy-authorization', 'proxy-authenticate',
  'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
  'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-for',
  // voir functions/api/[[path]].js : l'Origin navigateur ne doit pas
  // être relayé, le backend verrait un appel cross-origin non autorisé.
  'origin', 'referer'
]);

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = BACKEND + url.pathname + url.search;
  const isWs = String(request.headers.get('Upgrade') || '').toLowerCase() === 'websocket';

  const headers = new Headers();
  for (const [k, v] of request.headers) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
  }
  headers.set('host', BACKEND_HOST);
  headers.set('x-forwarded-proto', 'https');

  // Upgrade WebSocket : la réponse 101 + webSocket est renvoyée telle quelle.
  if (isWs) {
    return fetch(target, { method: request.method, headers });
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const res = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual'
  });

  const STRIP = new Set(['content-encoding', 'content-length', 'etag', 'content-md5', 'accept-ranges']);
  const out = new Headers();
  for (const [k, v] of res.headers) {
    const key = k.toLowerCase();
    if (key === 'set-cookie' || STRIP.has(key)) continue;
    out.set(k, v);
  }
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (cookies.length) out.set('set-cookie', cookies);

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}