# Outillage du dépôt (`tools/`)

Scripts Node (ESM, sans dépendance externe) qui automatisent le référencement
et garantissent la cohérence du site statique publié sur Cloudflare Pages.

## Scripts npm

| Commande | Rôle |
| --- | --- |
| `npm run seo` | (Ré)injecte le bloc SEO dans le `<head>` des 20 pages + réécrit `robots.txt`, `sitemap.xml` et `favicon.svg`. **Idempotent.** |
| `npm run seo:check` | Vérifie que **chaque** page publiée est correctement référencée. Échoue (code 1) sinon. |
| `npm run seo:indexnow` | Soumet toutes les URLs à IndexNow (Bing, Yandex, Seznam, Naver…). |
| `npm run i18n:check` | Vérifie que chaque clé utilisée existe dans les 4 langues et que les dicts sont équilibrés. |
| `npm run html:check` | Équilibre des balises, JSON-LD valide, liens internes non cassés. |
| `npm run verify` | Enchaîne `seo:check` + `i18n:check` + `html:check`. |

## Ajouter une page

1. Créer `public/ma-page.html` avec un `<title>…</title>` suivi d'un retour à la ligne.
2. Ajouter une entrée dans `tools/seo/pages.mjs` (`route`, `desc`, `changefreq`, `priority`).
3. `npm run seo && npm run verify`.

`npm run seo:check` échoue tant que l'étape 2 n'est pas faite : **aucune page ne
peut être oubliée**. C'est la garantie « SEO automatique sur toutes les pages ».

## Ce que l'injection pose sur chaque page

- `<meta name="description">` (issue de `pages.mjs`)
- `<meta name="robots" content="index, follow">`
- `<link rel="canonical">` (URL propre, sans `.html`)
- `hreflang` `fr` / `en` / `ar` / `it` + `x-default`
- favicon, apple-touch-icon, manifeste PWA
- Open Graph + Twitter (`summary_large_image`) + `og:image` 1200×630
- JSON-LD `WebSite` (accueil) / `WebPage` (pages internes)

## Notes

- Langue : `fr` est la base, les autres passent par `?lang=en|ar|it` (mécanisme
  du site, repris à l'identique dans `hreflang` et le sitemap).
- La date `<lastmod>` du sitemap est par défaut le jour d'exécution de
  `npm run seo`. Pour une date reproductible (CI), fixer : `SEO_LASTMOD=2026-11-01 npm run seo`.
- Autre domaine (préversion) : `SITE_URL=https://xxx.pages.dev npm run seo`.
- La clé IndexNow est publique par conception ; le fichier `public/<clé>.txt`
  doit être déployé pour la vérification.
