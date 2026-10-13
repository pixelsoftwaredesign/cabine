/**
 * Chemins et constantes partagés par les outils.
 * Toutes les E/S sont relatives au dépôt, jamais au cwd : les scripts
 * fonctionnent donc aussi bien en local qu'en CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Racine du dépôt (…/home). */
export const ROOT = path.resolve(HERE, '..', '..');
/** Dossier publié par Cloudflare Pages. */
export const PUBLIC_DIR = path.join(ROOT, 'public');

/** Domaine canonique (surchargeable via SITE_URL pour les préversions). */
export const BASE_URL = (process.env.SITE_URL || 'https://mycabine.pages.dev').replace(/\/+$/, '');

/** Langues du site : fr = base, les autres passent par ?lang=. */
export const LANGS = [
  { code: 'fr', suffix: '' },
  { code: 'en', suffix: '?lang=en' },
  { code: 'ar', suffix: '?lang=ar' },
  { code: 'it', suffix: '?lang=it' }
];

/** Locales OpenGraph alternatives (hors fr_FR, la locale par défaut). */
export const OG_ALT_LOCALES = ['en_US', 'ar_AR', 'it_IT'];

/** URL absolue d'une route (`/` ou `/map`). */
export function urlFor(route) {
  return BASE_URL + (route === '/' ? '/' : route);
}

/** Liste triée des pages HTML publiées. */
export function htmlPages() {
  return fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html')).sort();
}

/** Petits helpers d'affichage. */
export const ok = (msg) => console.log(`\u001b[32m✓\u001b[0m ${msg}`);
export const warn = (msg) => console.log(`\u001b[33m!\u001b[0m ${msg}`);
export const fail = (msg) => console.log(`\u001b[31m✗\u001b[0m ${msg}`);
