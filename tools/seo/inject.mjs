/**
 * Injection SEO idempotente : <head> de chaque page + robots.txt + sitemap.xml + favicon.svg.
 *
 * Usage :
 *   npm run seo                 # (ré)injecte sur toutes les pages
 *   SEO_LASTMOD=2026-11-01 npm run seo   # en mettant à jour la date du sitemap
 *   SITE_URL=https://preprod.pages.dev npm run seo   # pour une préversion
 *
 * Le script est idempotent : le bloc est retiré puis réécrit à chaque exécution,
 * donc relancer `npm run seo` sur un site déjà à jour ne produit aucun diff.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  PUBLIC_DIR,
  BASE_URL,
  LANGS,
  OG_ALT_LOCALES,
  htmlPages,
  urlFor,
  ok,
  warn,
  fail
} from '../lib/paths.mjs';
import {
  PAGES,
  MARK,
  LASTMOD,
  OG_IMAGE_ALT,
  indexJsonLd,
  webPageJsonLd
} from './pages.mjs';

/** Bloc <head> complet pour une page. */
function seoBlock({ title, desc, route }) {
  const url = urlFor(route);
  const hreflang = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l.code}" href="${url}${l.suffix}">`
  ).join('\n');
  const ogLocaleAlt = OG_ALT_LOCALES.map(
    (l) => `<meta property="og:locale:alternate" content="${l}">`
  ).join('\n');
  const jsonLd = route === '/' ? indexJsonLd() : webPageJsonLd({ title, desc, route });

  return `${MARK}
<meta name="description" content="${desc}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
${hreflang}
<link rel="alternate" hreflang="x-default" href="${url}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Atlas Cabine">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE_URL}/og-image.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${OG_IMAGE_ALT}">
<meta property="og:locale" content="fr_FR">
${ogLocaleAlt}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${BASE_URL}/og-image.png">
<script type="application/ld+json">${jsonLd}</script>`;
}

/** robots.txt */
function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`;
}

/** sitemap.xml (avec alternates xhtml:link pour chaque langue). */
function sitemapXml() {
  const urls = Object.entries(PAGES)
    .map(([, cfg]) => {
      const url = urlFor(cfg.route);
      const alts = LANGS.map(
        (l) => `<xhtml:link rel="alternate" hreflang="${l.code}" href="${url}${l.suffix}"/>`
      ).join('');
      return `<url>
  <loc>${url}</loc>
  <lastmod>${LASTMOD}</lastmod>
  <changefreq>${cfg.changefreq}</changefreq>
  <priority>${cfg.priority}</priority>
  ${alts}
</url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

/** favicon.svg (marque : toit + porte orange sur fond sombre). */
function faviconSvg() {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="14" fill="#10161a"/>' +
    '<path d="M32 10 10 30h6v22h13V38h6v14h13V30h6z" fill="#f2a65a"/></svg>\n'
  );
}

function injectPage(file) {
  const cfg = PAGES[file];
  const fpath = path.join(PUBLIC_DIR, file);
  let html = fs.readFileSync(fpath, 'utf8');

  // Idempotence : on retire l'ancien bloc avant de le réécrire.
  if (html.includes(MARK)) {
    html = html.replace(/<!-- SEO Atlas Cabine -->[\s\S]*?<\/script>\r?\n?/, '');
  }

  // Le <title> de la page fait foi (titre FR par défaut).
  const tm = html.match(/<title[^>]*>([^<]+)<\/title>/);
  if (!tm) throw new Error(`${file} : aucun <title> trouvé`);
  const title = tm[1].trim();

  if (!/<\/title>\r?\n/.test(html)) {
    throw new Error(`${file} : le <title> doit être suivi d'un retour à la ligne`);
  }

  const block = seoBlock({ title, desc: cfg.desc, route: cfg.route }) + '\n';
  html = html.replace(/(<\/title>\r?\n)/, '$1' + block);
  fs.writeFileSync(fpath, html);
  return cfg.route;
}

function main() {
  const pages = htmlPages();
  const unknown = pages.filter((f) => !PAGES[f]);
  if (unknown.length) {
    fail(
      `pages HTML sans configuration SEO : ${unknown.join(', ')}\n` +
        `  → ajoute une entrée dans tools/seo/pages.mjs (route + desc).`
    );
    process.exitCode = 1;
  }

  let count = 0;
  for (const file of pages) {
    if (!PAGES[file]) continue;
    const route = injectPage(file);
    ok(`INJECT ${file} → ${route}`);
    count += 1;
  }

  fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), robotsTxt());
  ok('robots.txt');

  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemapXml());
  ok(`sitemap.xml (${Object.keys(PAGES).length} URLs, lastmod ${LASTMOD})`);

  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), faviconSvg());
  ok('favicon.svg');

  if (unknown.length) warn(`SEO incomplet : ${unknown.length} page(s) non couverte(s).`);
  console.log(`\n${count}/${pages.length} pages injectées — base ${BASE_URL}`);
}

main();
