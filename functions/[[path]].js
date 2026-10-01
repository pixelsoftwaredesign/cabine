/**
 * Catch-all Pages Function.
 *
 * Cloudflare Pages applique par défaut une canonicalisation "pretty URLs"
 * qui produit une boucle 308 (-> /map) sur les URLs propres sans .html.
 * On sert donc nous-mêmes les fichiers statiques + les URLs propres,
 * ce qui reproduit exactement le comportement de server.js (CLEAN_URLS).
 */
const CLEAN_URLS = new Set([
  '/map', '/book', '/bim', '/editor', '/viewer', '/demo', '/kiosk',
  '/install', '/logistics', '/maintenance', '/partner', '/plan',
  '/usine', '/workforce'
]);

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Fichier statique exact
  let res = await env.ASSETS.fetch(request);
  if (res.status === 200) return res;

  // 2. URL propre -> <route>.html (sans boucle de redirection)
  if (CLEAN_URLS.has(url.pathname)) {
    const target = new URL(`${url.pathname}.html${url.search}`, url);
    const htmlRes = await env.ASSETS.fetch(new Request(target.toString(), request));
    if (htmlRes.status === 200) return htmlRes;
  }

  // 3. Fallback portail (comportement historique)
  const fallback = await env.ASSETS.fetch(new Request(new URL('/index.html', url).toString(), request));
  if (fallback.status === 200) return fallback;

  return res;
}