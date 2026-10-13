/**
 * Vérification HTML : équilibre des balises, JSON-LD valide, et intégrité des
 * liens internes (aucune page ni asset manquant).
 *
 * Usage : npm run html:check
 */
import fs from 'node:fs';
import path from 'node:path';

import { PUBLIC_DIR, htmlPages, ok, fail } from './lib/paths.mjs';

const TAGS = ['html', 'head', 'body', 'div', 'section', 'article', 'ul', 'ol', 'li', 'span', 'main', 'header', 'footer', 'nav', 'p', 'a', 'b', 'script', 'style', 'form', 'table', 'tr', 'td', 'button', 'svg'];
const problems = [];

/** Résout un href interne vers un fichier de public/, ou null. */
function resolveInternal(href) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean.startsWith('/') || clean.startsWith('//')) return null;
  const rel = clean.replace(/^\/+/, '');
  const candidates = rel === '' ? ['index.html'] : [rel, `${rel}.html`, path.join(rel, 'index.html')];
  for (const c of candidates) {
    const p = path.join(PUBLIC_DIR, c);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return c;
  }
  return { missing: clean };
}

/** Chemins servis à l'exécution (proxy Pages → backend) : pas des fichiers statiques. */
const RUNTIME_PREFIXES = ['/api/', '/socket.io/'];

/** Un href n'est vérifiable statiquement que s'il est littéral (pas de concaténation JS). */
function isStaticHref(href) {
  if (RUNTIME_PREFIXES.some((p) => href.startsWith(p))) return false;
  if (/['"+$`{}\\]/.test(href)) return false; // chaîne construite dynamiquement
  return true;
}

function checkPage(file) {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');

  // 1. Équilibre des balises (hors balises auto-fermantes et void).
  for (const tag of TAGS) {
    const open = (html.match(new RegExp(`<${tag}(?=[\\s/>])`, 'gi')) || []).length;
    const selfClose = (html.match(new RegExp(`<${tag}\\b[^>]*/>`, 'gi')) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    if (open - selfClose !== close) {
      problems.push(`${file}: balise <${tag}> déséquilibrée (${open} ouvertes / ${close} fermées)`);
    }
  }

  // 2. JSON-LD valide.
  const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (ld) {
    try {
      JSON.parse(ld[1]);
    } catch (e) {
      problems.push(`${file}: JSON-LD invalide (${e.message})`);
    }
  }

  // 3. Liens internes résolus.
  const seen = new Set();
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    if (!isStaticHref(href)) continue;
    const r = resolveInternal(href);
    if (r && r.missing) problems.push(`${file}: lien interne cassé → ${r.missing}`);
  }
}

function main() {
  const pages = htmlPages();
  for (const f of pages) checkPage(f);

  if (problems.length) {
    fail(`${problems.length} problème(s) HTML :`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
    return;
  }
  ok(`HTML conforme — ${pages.length} pages (balises, JSON-LD, liens internes)`);
}

main();
