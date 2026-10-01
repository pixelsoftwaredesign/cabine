/**
 * Proxy HTTP : /api/* -> backend Node (Render).
 * Le front utilise `location.origin`, donc sur Cloudflare Pages il faut
 * relayer /api vers le backend pour que le site fonctionne en statique.
 */
const BACKEND = 'https://cabine-backend.onrender.com';
const BACKEND_HOST = new URL(BACKEND).host;

const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'upgrade', 'te', 'trailer', 'proxy-authorization', 'proxy-authenticate',
  'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
  'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-for',
  // Le navigateur envoie l'Origin de mycabine.pages.dev ; côté backend
  // l'appel est same-origin, donc on ne le relaie pas (sinon rejet CORS).
  'origin', 'referer'
]);

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const headers = new Headers();
  for (const [k, v] of request.headers) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
  }
  headers.set('host', BACKEND_HOST);
  headers.set('x-forwarded-proto', 'https');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const res = await fetch(BACKEND + url.pathname + url.search, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual'
  });

  // Workers décode déjà le corps : on ne doit pas laisser passer
  // content-encoding / content-length / etag de la version compressée.
  const STRIP = new Set(['content-encoding', 'content-length', 'etag', 'content-md5', 'accept-ranges']);
  const out = new Headers();
  for (const [k, v] of res.headers) {
    const key = k.toLowerCase();
    if (key === 'set-cookie' || STRIP.has(key)) continue;
    out.set(k, v);
  }
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (cookies.length) out.set('set-cookie', cookies);

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out
  });
}