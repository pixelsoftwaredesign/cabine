/**
 * Vérification SEO — échoue si une page publiée n'est pas correctement référencée.
 *
 * Usage : npm run seo:check
 * Sortie : code 0 si tout est conforme, 1 sinon (utilisable en CI / pre-commit).
 */
import fs from 'node:fs';
import path from 'node:path';

import { PUBLIC_DIR, LANGS, OG_ALT_LOCALES, htmlPages, urlFor, BASE_URL, ok, fail } from '../lib/paths.mjs';
import { PAGES, MARK, OG_IMAGE_ALT } from './pages.mjs';

const problems = [];
const complain = (file, msg) => problems.push(`${file}: ${msg}`);

function attr(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

function checkPage(file) {
  const cfg = PAGES[file];
  const html = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
  const route = cfg.route;
  const url = urlFor(route);

  if (!html.includes(MARK)) complain(file, 'bloc SEO absent (lancer npm run seo)');
  if (!/^<!DOCTYPE html>/i.test(html)) complain(file, 'DOCTYPE manquant');

  const title = attr(html, /<title[^>]*>([^<]+)<\/title>/);

  const desc = attr(html, /<meta name="description" content="([^"]*)">/);
  if (!desc) complain(file, 'meta description manquante');
  else if (desc !== cfg.desc) complain(file, 'meta description désynchronisée de tools/seo/pages.mjs');

  if (attr(html, /<meta name="robots" content="([^"]*)">/) !== 'index, follow')
    complain(file, 'meta robots ≠ index, follow');

  if (attr(html, /<link rel="canonical" href="([^"]*)">/) !== url)
    complain(file, `canonical ≠ ${url}`);

  for (const l of LANGS) {
    const want = url + l.suffix;
    const re = new RegExp(`<link rel="alternate" hreflang="${l.code}" href="([^"]*)">`);
    if (attr(html, re) !== want) complain(file, `hreflang ${l.code} ≠ ${want}`);
  }
  if (attr(html, /<link rel="alternate" hreflang="x-default" href="([^"]*)">/) !== url)
    complain(file, 'hreflang x-default manquant/incorrect');

  if (!html.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'))
    complain(file, 'favicon manquant');
  if (!html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">'))
    complain(file, 'apple-touch-icon manquant');
  if (!html.includes('<link rel="manifest" href="/manifest.webmanifest">'))
    complain(file, 'manifest PWA manquant');

  if (attr(html, /<meta property="og:title" content="([^"]*)">/) !== title)
    complain(file, 'og:title ≠ <title>');
  if (attr(html, /<meta property="og:description" content="([^"]*)">/) !== cfg.desc)
    complain(file, 'og:description ≠ description');
  if (attr(html, /<meta property="og:url" content="([^"]*)">/) !== url)
    complain(file, `og:url ≠ ${url}`);
  if (attr(html, /<meta property="og:image" content="([^"]*)">/) !== `${BASE_URL}/og-image.png`)
    complain(file, 'og:image incorrect');
  if (attr(html, /<meta property="og:image:alt" content="([^"]*)">/) !== OG_IMAGE_ALT)
    complain(file, 'og:image:alt incorrect');
  if (attr(html, /<meta property="og:site_name" content="([^"]*)">/) !== 'Atlas Cabine')
    complain(file, 'og:site_name incorrect');

  for (const l of OG_ALT_LOCALES) {
    if (!html.includes(`<meta property="og:locale:alternate" content="${l}">`))
      complain(file, `og:locale:alternate ${l} manquant`);
  }

  if (attr(html, /<meta name="twitter:card" content="([^"]*)">/) !== 'summary_large_image')
    complain(file, 'twitter:card ≠ summary_large_image');
  if (!html.includes(`<meta name="twitter:image" content="${BASE_URL}/og-image.png">`))
    complain(file, 'twitter:image incorrect');

  // JSON-LD : doit être présent, valide, et cohérent.
  const ld = attr(html, /<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (!ld) {
    complain(file, 'JSON-LD absent');
  } else {
    try {
      const data = JSON.parse(ld);
      const expected = route === '/' ? 'WebSite' : 'WebPage';
      if (data['@type'] !== expected) complain(file, `JSON-LD @type ≠ ${expected}`);
      if (route !== '/' && data.url !== url) complain(file, `JSON-LD url ≠ ${url}`);
      if (route !== '/' && data.name !== title) complain(file, 'JSON-LD name ≠ <title>');
    } catch (e) {
      complain(file, `JSON-LD invalide (${e.message})`);
    }
  }
}

function checkSitemap() {
  const file = 'sitemap.xml';
  const xml = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const expected = Object.values(PAGES).map((c) => urlFor(c.route));

  for (const url of expected) {
    const n = locs.filter((l) => l === url).length;
    if (n !== 1) complain(file, `${url} présent ${n} fois (attendu 1)`);
  }
  for (const l of locs) if (!expected.includes(l)) complain(file, `<loc> inattendu : ${l}`);
  if (!xml.includes('xmlns:xhtml')) complain(file, 'namespace xhtml manquant');
  for (const url of expected) {
    for (const l of LANGS) {
      if (!xml.includes(`hreflang="${l.code}" href="${url}${l.suffix}"`))
        complain(file, `alternate ${l.code} manquant pour ${url}`);
    }
  }
}

function checkRobotsFavicon() {
  const robots = fs.readFileSync(path.join(PUBLIC_DIR, 'robots.txt'), 'utf8');
  if (!/^User-agent: \*$/m.test(robots)) complain('robots.txt', 'User-agent manquant');
  if (!/^Allow: \/$/m.test(robots)) complain('robots.txt', 'Allow: / manquant');
  if (!robots.includes(`Sitemap: ${BASE_URL}/sitemap.xml`))
    complain('robots.txt', 'ligne Sitemap manquante/incorrecte');

  const fav = path.join(PUBLIC_DIR, 'favicon.svg');
  if (!fs.existsSync(fav)) complain('favicon.svg', 'fichier absent');
  if (!fs.existsSync(path.join(PUBLIC_DIR, 'og-image.png')))
    complain('og-image.png', 'fichier absent');
  if (!fs.existsSync(path.join(PUBLIC_DIR, 'manifest.webmanifest')))
    complain('manifest.webmanifest', 'fichier absent');
}

function main() {
  const pages = htmlPages();

  // Couverture : toute page publiée doit avoir une config, et inversement.
  const unknown = pages.filter((f) => !PAGES[f]);
  const orphans = Object.keys(PAGES).filter((f) => !pages.includes(f));
  for (const f of unknown) complain(f, 'aucune entrée dans tools/seo/pages.mjs');
  for (const f of orphans) complain('tools/seo/pages.mjs', `entrée sans fichier public/${f}`);

  for (const file of pages) if (PAGES[file]) checkPage(file);

  checkSitemap();
  checkRobotsFavicon();

  if (problems.length) {
    fail(`${problems.length} problème(s) SEO :\n` + problems.map((p) => `  - ${p}`).join('\n'));
    process.exitCode = 1;
    return;
  }

  ok(`SEO conforme — ${Object.keys(PAGES).length} pages`);
  console.log('  canonical + hreflang fr/en/ar/it/x-default · OG + Twitter · JSON-LD · sitemap · robots.txt');
  console.log(`  base : ${BASE_URL}`);
}

main();
