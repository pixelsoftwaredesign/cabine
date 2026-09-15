/**
 * Config devises du module « Maps » — moteur de conversion autonome.
 * Taux statiques internes (aucune dépendance externe) — rapport EUR.
 * © pixelsoftwaredesign 2026
 */

const RATES_TO_EUR = {
  EUR: 1.0,
  TND: 0.298,
  USD: 0.926,
  GBP: 1.176,
  MAD: 0.093,
  DZD: 0.0068
};

const RATES_UPDATED_AT = new Date('2026-01-01T00:00:00.000Z');

const CURRENCIES = Object.keys(RATES_TO_EUR);

const SYMBOLS = {
  EUR: '€',
  TND: 'TND',
  USD: '$',
  GBP: '£',
  MAD: 'MAD',
  DZD: 'DA'
};

const LABELS = {
  EUR: 'Euro',
  TND: 'Dinar tunisien',
  USD: 'Dollar US',
  GBP: 'Livre sterling',
  MAD: 'Dirham marocain',
  DZD: 'Dinar algérien'
};

function validCurrency(c) {
  return c && CURRENCIES.includes(String(c).toUpperCase());
}

/**
 * Convertit `amount` de la devise `from` vers `to`.
 * amount → EUR : amount × rate[from] ; EUR → to : EUR ÷ rate[to]
 */
function convert(amount, from, to) {
  const eur = amount * (RATES_TO_EUR[from] || 1);
  const rateTo = RATES_TO_EUR[to] || 1;
  return {
    value: eur / rateTo,
    rate: (RATES_TO_EUR[from] || 1) / rateTo
  };
}

module.exports = {
  RATES_TO_EUR,
  RATES_UPDATED_AT,
  CURRENCIES,
  SYMBOLS,
  LABELS,
  validCurrency,
  convert
};