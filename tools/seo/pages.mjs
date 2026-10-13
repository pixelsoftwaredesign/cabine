/**
 * Configuration SEO du site : une entrée par page publiée.
 *
 * Ajouter une page = ajouter une entrée ici. `npm run seo:check` échoue si une
 * page HTML existe sans entrée, ce qui garantit que « toutes les pages » sont
 * référencées automatiquement (aucune page ne peut être oubliée).
 *
 * Le <title> n'est pas dupliqué ici : il est lu depuis le <title> de la page
 * (source de vérité), puis repris dans og:title / twitter:title / JSON-LD.
 */
import { BASE_URL, urlFor } from '../lib/paths.mjs';

const SITE_NAME = 'Atlas Cabine';
const SITE_DESCRIPTION =
  'Atlas Cabine — plateforme internationale de cabines à la séance : réservation, carte temps réel, kiosque, franchise et production.';

export const MARK = '<!-- SEO Atlas Cabine -->';
export const OG_IMAGE_ALT = 'Atlas Cabine — réseau international de cabines à la séance';

/** Date <lastmod> du sitemap. Surchargée via SEO_LASTMOD=AAAA-MM-JJ. */
export const LASTMOD = process.env.SEO_LASTMOD || '2026-10-12';

/**
 * file -> { route, desc, changefreq, priority }
 * `route` est l'URL propre (sans .html) servie par Cloudflare Pages.
 */
export const PAGES = {
  'index.html': {
    route: '/',
    changefreq: 'weekly',
    priority: '1.0',
    desc: "Atlas Cabine — le portail de l'écosystème de cabines à la séance : réservation, carte en temps réel, kiosque, franchise internationale et suivi de production."
  },
  'map.html': {
    route: '/map',
    changefreq: 'weekly',
    priority: '0.9',
    desc: 'Carte interactive des cabines Atlas Cabine : statut en temps réel, disponibilité, mode location et réservation directe par ville.'
  },
  'book.html': {
    route: '/book',
    changefreq: 'monthly',
    priority: '0.9',
    desc: "Réservez une cabine Atlas Cabine à la séance : choix de la cabine, du créneau et de la durée, paiement et code d'accès pour le kiosque."
  },
  'kiosk.html': {
    route: '/kiosk',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Kiosque de la cabine Atlas Cabine : ouverture par code de réservation ou biométrie, climatisation, éclairage, audio et suivi de session.'
  },
  'franchise.html': {
    route: '/franchise',
    changefreq: 'weekly',
    priority: '0.7',
    desc: 'Franchise Atlas Cabine en Afrique : ouvrez le premier réseau local de cabines Atlas Cabine avec une répartition des revenus 65/15/12/8.'
  },
  'franchise-europe.html': {
    route: '/franchise-europe',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Franchise Atlas Cabine en Europe : ouvrez un réseau local de cabines Atlas Cabine sur un territoire européen.'
  },
  'franchise-america.html': {
    route: '/franchise-america',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Franchise Atlas Cabine en Amérique : ouvrez un réseau local de cabines Atlas Cabine sur un territoire américain.'
  },
  'contrat-franchise.html': {
    route: '/contrat-franchise',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Contrat de franchise Atlas Cabine imprimable : fabrication après financement, location avec engagement 12/24/36 mois et répartition des revenus.'
  },
  'contrat-location.html': {
    route: '/contrat-location',
    changefreq: 'monthly',
    priority: '0.7',
    desc: "Contrat de location de cabine Atlas Cabine : conditions d'exploitation, engagement 12/24/36 mois et répartition 65/15/12/8."
  },
  'usine.html': {
    route: '/usine',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Suivi de fabrication des cabines Atlas Cabine : assemblage, contrôle qualité, flotte et expéditions.'
  },
  'install.html': {
    route: '/install',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Installation des cabines Atlas Cabine : réception sur site, équipements, tests et mise en service.'
  },
  'demo.html': {
    route: '/demo',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Démo interactive Atlas Cabine : parcours de production, replay des étapes et indicateurs de performance.'
  },
  'maintenance.html': {
    route: '/maintenance',
    changefreq: 'monthly',
    priority: '0.7',
    desc: "Maintenance des cabines Atlas Cabine : planification des interventions et suivi de l'état de la flotte."
  },
  'logistics.html': {
    route: '/logistics',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Logistique Atlas Cabine : routes, transport, GPS et suivi des livraisons de cabines.'
  },
  'workforce.html': {
    route: '/workforce',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Équipes Atlas Cabine : effectifs, compétences et affectation sur les chantiers.'
  },
  'partner.html': {
    route: '/partner',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Portail partenaire Atlas Cabine : revenus, commissions et suivi commercial.'
  },
  'editor.html': {
    route: '/editor',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Éditeur BIM Atlas Cabine : conception et modélisation des cabines.'
  },
  'viewer.html': {
    route: '/viewer',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Visualisation BIM Atlas Cabine : plans et maquettes numériques des cabines.'
  },
  'bim.html': {
    route: '/bim',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'BIM Atlas Cabine : maquette numérique et coordination des cabines.'
  },
  'plan.html': {
    route: '/plan',
    changefreq: 'monthly',
    priority: '0.7',
    desc: 'Plan des cabines Atlas Cabine : tracés et installations techniques.'
  }
};

/** JSON-LD de la page d'accueil : le site dans son ensemble. */
export function indexJsonLd() {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: BASE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: ['fr', 'en', 'ar', 'it'],
    publisher: { '@type': 'Organization', name: SITE_NAME, url: BASE_URL }
  });
}

/** JSON-LD des pages internes : une WebPage rattachée au WebSite. */
export function webPageJsonLd({ title, desc, route }) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: desc,
    url: urlFor(route),
    inLanguage: ['fr', 'en', 'ar', 'it'],
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: BASE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: BASE_URL }
  });
}
