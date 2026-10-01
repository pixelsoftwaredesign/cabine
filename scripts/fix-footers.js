const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public');

// Libelle d'origine de chaque page, conserve dans le pied de page.
const LABELS = {
  'index.html': null, // portail : pas de libelle de page
  'map.html': 'Carte',
  'book.html': 'Réservation',
  'partner.html': 'Partenaire',
  'kiosk.html': 'Cabine Intelligente',
  'install.html': 'Installation',
  'maintenance.html': 'Management &amp; Housekeeping',
  'usine.html': 'Usine',
  'bim.html': 'BIM',
  'demo.html': 'Démo',
  'plan.html': 'Plan',
  'logistics.html': 'Logistique',
  'editor.html': 'Éditeur indoor',
  'viewer.html': 'Viewer 3D',
  'workforce.html': 'Workforce'
};

const LINKS =
  '<a href="/">Accueil</a>' +
  '<a href="https://pixelsoftwaredesign.xyz" target="_blank" rel="noopener">pixelsoftwaredesign.xyz</a>' +
  '<a href="https://atlascabine.pages.dev" target="_blank" rel="noopener">atlascabine.pages.dev</a>';

const RE_SITE_LINKS = /\s*<div class="site-links">[\s\S]*?<\/div>/g;
const RE_APP_FOOTER = /\s*<footer class="app-footer">[\s\S]*?<\/footer>/g;
const RE_FOOT = /\s*<footer class="foot">[\s\S]*?<\/footer>/g;
const RE_FOOTNOTE = /(<div class="footnote">)[\s\S]*?(<\/div>)/g;

for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.html'))) {
  const p = path.join(DIR, f);
  const label = LABELS[f];
  let s = fs.readFileSync(p, 'utf8');
  const before = s;

  // Nettoyer toutes les variantes de pied de page deja presentes
  s = s.replace(RE_APP_FOOTER, '');
  s = s.replace(RE_FOOT, '');
  s = s.replace(RE_SITE_LINKS, '');
  // workforce : on ne garde que le <div class="footnote"> vide
  s = s.replace(RE_FOOTNOTE, '$1$2');

  const credit = label
    ? `&copy; pixelsoftwaredesign 2026 &middot; ${label} &mdash; Cabines Intelligentes`
    : '&copy; pixelsoftwaredesign 2026 &mdash; Plateforme cabines intelligentes';

  if (f === 'workforce.html') {
    s = s.replace(
      '<div class="footnote"></div>',
      `<div class="footnote">&copy; pixelsoftwaredesign 2026\n    <div class="site-links">${LINKS}</div>\n  </div>`
    );
  } else if (f === 'index.html') {
    s = s.replace(
      '</body>',
      `<footer class="foot">\n  <div class="dotts">&middot;&middot;</div>\n  ${credit}\n  <div class="site-links">${LINKS}</div>\n</footer>\n</body>`
    );
  } else {
    s = s.replace(
      '</body>',
      `<footer class="app-footer">${credit}\n  <div class="site-links">${LINKS}</div>\n</footer>\n</body>`
    );
  }

  // Footer app-footer : la classe .foot de index a ete supprimee, on la remet
  if (f === 'index.html' && !/\.foot\s*\{/.test(s)) {
    s = s.replace('</style>', '  .foot{text-align:center;color:var(--muted);font-size:.72rem;letter-spacing:.4px;opacity:.75;padding:18px 8px calc(10px + env(safe-area-inset-bottom))}\n  .foot .site-links{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:6px}\n  .foot .site-links a{color:var(--muted);text-decoration:none;border-bottom:1px solid transparent;transition:color .2s var(--ease-out),border-color .2s var(--ease-out)}\n  .foot .site-links a:hover{color:var(--ember);border-bottom-color:var(--ember-dim)}\n</style>');
  }

  if (s !== before) {
    fs.writeFileSync(p, s);
    console.log('ok :', f, label ? '(' + label + ')' : '(portail)');
  }
}