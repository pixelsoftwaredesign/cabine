/**
 * Vérification i18n : chaque clé utilisée dans une page (data-i18n* / T('…'))
 * existe dans les 4 langues, et chaque dict de page est équilibré fr=en=ar=it.
 *
 * Usage : npm run i18n:check
 *
 * Note : install.html construit certaines clés dynamiquement
 * (`T(t.labelKey`) — ce faux positif connu est filtré par la détection `+'`.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { PUBLIC_DIR, ok, fail } from './lib/paths.mjs';

const LANGS = ['fr', 'en', 'ar', 'it'];
const I18N_DIR = path.join(PUBLIC_DIR, 'vendor', 'i18n');

/** Stub DOM minimal : i18n.js injecte des styles RTL au chargement. */
function elStub() {
  return {
    style: {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    appendChild() {},
    textContent: '',
    innerHTML: ''
  };
}

function makeSandbox(extra) {
  const sandbox = {
    window: extra || {},
    console,
    document: {
      createElement: elStub,
      body: { appendChild() {} },
      head: { appendChild() {} },
      documentElement: { setAttribute() {}, style: {} },
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return null;
      }
    }
  };
  vm.createContext(sandbox);
  return sandbox;
}

function main() {
  const baseSrc = fs.readFileSync(path.join(I18N_DIR, 'translations.js'), 'utf8');
  const engineSrc = fs.readFileSync(path.join(I18N_DIR, 'i18n.js'), 'utf8');

  const sandbox = makeSandbox();
  vm.runInContext(baseSrc, sandbox, { filename: 'translations.js' });
  vm.runInContext(engineSrc, sandbox, { filename: 'i18n.js' });
  const I18N = sandbox.window.I18N;

  const pagesDir = path.join(I18N_DIR, 'pages');
  const dictFiles = fs
    .readdirSync(pagesDir)
    .filter((f) => f.endsWith('.js'))
    .sort();

  // Charge chaque dict de page et relève le nombre de clés par langue.
  const dicts = {};
  const problems = [];
  for (const df of dictFiles) {
    const page = df.replace('.js', '');
    const s2 = makeSandbox({ I18N });
    s2.I18N = I18N;
    try {
      vm.runInContext(fs.readFileSync(path.join(pagesDir, df), 'utf8'), s2, { filename: df });
      dicts[page] = {};
      for (const lang of LANGS) dicts[page][lang] = new Set(Object.keys(I18N.dict(lang)));
    } catch (e) {
      dicts[page] = { error: e.message };
    }
  }

  const baseKeys = new Set(Object.keys(I18N.dict('fr')));
  const mergedSet = (page) => {
    const s = new Set(baseKeys);
    if (dicts[page] && !dicts[page].error) for (const k of dicts[page].fr) s.add(k);
    return s;
  };

  const pageFiles = fs
    .readdirSync(PUBLIC_DIR)
    .filter((f) => f.endsWith('.html'))
    .sort();

  for (const pf of pageFiles) {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, pf), 'utf8');
    if (!html.includes('vendor/i18n/i18n.js')) continue;

    let page = pf.replace('.html', '');
    if (page === 'contrat-franchise' || page === 'contrat-location') page = 'contrats';
    if (page.startsWith('franchise')) page = 'franchise';

    const merged = mergedSet(page);
    const missing = [];

    for (const m of html.matchAll(/data-i18n(?:-html|-ph|-title|-aria)?="([^"]+)"/g)) {
      const key = m[1].trim();
      // Clés construites dynamiquement dans une chaîne JS
      // (ex. install.html : data-i18n="'+p.labelKey+'") : non vérifiables statiquement.
      if (key.includes('+') || key.includes('${') || key.startsWith("'")) continue;
      if (!merged.has(key)) missing.push(key);
    }

    if (pf === 'map.html' || pf === 'book.html' || pf === 'kiosk.html') {
      for (const t of html.matchAll(/T\('([^']+)'/g)) {
        const key = t[1];
        if (key.includes('.') && !key.includes('+') && !merged.has(key)) missing.push(`${key} (T)`);
      }
    }

    if (missing.length) problems.push(`${pf}: ${[...new Set(missing)].join(', ')}`);
  }

  for (const df of dictFiles) {
    const page = df.replace('.js', '');
    const d = dicts[page];
    if (!d || d.error) {
      problems.push(`${df}: ${(d && d.error) || 'dict illisible'}`);
      continue;
    }
    const counts = LANGS.map((l) => d[l].size);
    if (new Set(counts).size > 1) {
      problems.push(`${df}: nombre de clés inégal ${JSON.stringify(counts)}`);
    }
  }

  if (problems.length) {
    fail(`${problems.length} problème(s) i18n :`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
    return;
  }

  ok(`i18n conforme — ${pageFiles.length} pages, ${dictFiles.length} dicts de page (fr=en=ar=it)`);
  console.log(`  clés de base : ${baseKeys.size} · langues : ${LANGS.join('/')}`);
}

main();
