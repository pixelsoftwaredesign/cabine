/**
 * Auto-indexation IndexNow (Bing, Yandex, Seznam, Naver…).
 *
 * IndexNow exige une clé hébergée sur le site : le fichier public/<clé>.txt
 * doit contenir la clé. Le script la détecte automatiquement, ou la crée :
 *
 *   npm run seo:indexnow -- --init     # génère la clé + public/<clé>.txt
 *   npm run seo:indexnow               # soumet toutes les URLs du site
 *   npm run seo:indexnow -- --dry      # affiche l'URL soumise sans POST
 *
 * La clé n'est pas un secret (elle est publique par conception) ; seul le
 * fichier la contenant doit être déployé.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { PUBLIC_DIR, BASE_URL, urlFor, ok, warn, fail } from '../lib/paths.mjs';
import { PAGES } from './pages.mjs';

const HOST = new URL(BASE_URL).host;

/** Retrouve la clé : env, sinon fichier public/<32hex>.txt. */
function findKey() {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY.trim();
  const candidates = fs
    .readdirSync(PUBLIC_DIR)
    .filter((f) => /^[a-f0-9]{8,128}\.txt$/.test(f));
  for (const f of candidates) {
    const key = f.replace(/\.txt$/, '');
    if (fs.readFileSync(path.join(PUBLIC_DIR, f), 'utf8').trim() === key) return key;
  }
  return null;
}

/** Crée une clé et son fichier public/<clé>.txt. */
function initKey() {
  const existing = findKey();
  if (existing) {
    ok(`clé IndexNow déjà présente : ${existing}`);
    return existing;
  }
  const key = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(PUBLIC_DIR, `${key}.txt`), key);
  ok(`clé IndexNow créée : public/${key}.txt`);
  warn('commit ce fichier puis redéploie pour qu’IndexNow puisse le vérifier.');
  return key;
}

async function submit(key, { dry }) {
  const keyLocation = `${BASE_URL}/${key}.txt`;
  const urlList = Object.values(PAGES).map((c) => urlFor(c.route));
  const body = { host: HOST, key, keyLocation, urlList };

  console.log(`IndexNow → ${HOST} (${urlList.length} URLs)`);
  console.log(`  clé : ${keyLocation}`);
  for (const u of urlList) console.log(`    ${u}`);

  if (dry) {
    warn('--dry : aucun POST envoyé.');
    return;
  }

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body)
    });
    if (res.status === 200 || res.status === 202) ok(`soumission acceptée (HTTP ${res.status})`);
    else fail(`IndexNow a répondu HTTP ${res.status} : ${await res.text().catch(() => '')}`);
  } catch (e) {
    fail(`soumission impossible (réseau) : ${e.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');

  let key = args.includes('--init') ? initKey() : findKey();
  if (!key) {
    fail(`aucune clé IndexNow trouvée.\n  → lance : npm run seo:indexnow -- --init`);
    process.exitCode = 1;
    return;
  }

  if (args.includes('--init') && !args.includes('--submit')) return;
  await submit(key, { dry });
}

main();
