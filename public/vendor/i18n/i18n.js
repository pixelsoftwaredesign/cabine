/* i18n — Atlas Cabine
 * Lightweight internationalization for the static Pages site.
 * Languages: fr (default), en, ar (RTL), it.
 * Usage:
 *   <script src="/vendor/i18n/translations.js"></script>
 *   <script src="/vendor/i18n/pages/<page>.js"></script>   (optional per-page dict)
 *   <script src="/vendor/i18n/i18n.js"></script>
 *   <script>I18N.init();</script>
 * Elements: [data-i18n] text, [data-i18n-html] innerHTML, [data-i18n-ph] placeholder,
 *           [data-i18n-title] title, [data-i18n-aria] aria-label.
 * Switcher: any container marked [data-i18n-switcher] is filled with FR EN AR IT buttons.
 */
(function () {
  'use strict';

  const LANGS = [
    { code: 'fr', label: 'FR', name: 'Français' },
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'ar', label: 'ع', name: 'العربية', rtl: true },
    { code: 'it', label: 'IT', name: 'Italiano' }
  ];
  const STORE_KEY = 'atlas_cabine_lang';

  const I18N = {
    LANGS,
    dicts: (window.I18N_DICTS && window.I18N_DICTS) || {},
    lang: 'fr',
    extra: {},

    /* Merge page-scoped dictionary entries: I18N.add('en', { 'map.search': '...' }) */
    add(lang, entries) {
      if (!this.extra[lang]) this.extra[lang] = {};
      Object.assign(this.extra[lang], entries);
    },
    register(entriesByLang) {
      Object.keys(entriesByLang || {}).forEach((l) => this.add(l, entriesByLang[l]));
    },

    dict(lang) {
      const base = this.dicts[lang] || this.dicts.fr || {};
      const extra = this.extra[lang] || {};
      return Object.assign({}, this.dicts.fr || {}, base, extra);
    },

    t(key, vars) {
      if (!key) return '';
      const d = this._cache[this.lang] || this.dict(this.lang);
      let s = d[key];
      if (s === undefined) s = (this.dicts.fr || {})[key] || key;
      if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
      return s;
    },

    get locale() {
      return this.lang === 'ar' ? 'ar' : this.lang === 'it' ? 'it-IT' : this.lang === 'en' ? 'en-GB' : 'fr-FR';
    },

    setLang(code) {
      if (!LANGS.some((l) => l.code === code)) code = 'fr';
      this.lang = code;
      this._cache = {};
      try { localStorage.setItem(STORE_KEY, code); } catch (e) { /* privé */ }
      const html = document.documentElement;
      html.lang = code;
      html.dir = LANGS.find((l) => l.code === code).rtl ? 'rtl' : 'ltr';
      this.apply();
      window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: code } }));
    },

    init(opts) {
      opts = opts || {};
      let saved = 'fr';
      try { saved = localStorage.getItem(STORE_KEY) || 'fr'; } catch (e) { /* privé */ }
      const qs = new URLSearchParams(window.location.search);
      if (qs.get('lang')) saved = qs.get('lang');
      if (opts.lang) saved = opts.lang;
      this._cache = {};
      this.setLang(saved);
      this.mountSwitchers();
      window.addEventListener('storage', (e) => {
        if (e.key === STORE_KEY && e.newValue && e.newValue !== this.lang) { this.setLang(e.newValue); this.mountSwitchers(); }
      });
    },

    apply(scope) {
      const root = scope || document;
      const d = this._cache[this.lang] || this.dict(this.lang);
      root.querySelectorAll('[data-i18n]').forEach((el) => {
        const k = el.getAttribute('data-i18n');
        const v = d[k];
        if (v !== undefined && el.textContent.trim() !== v) el.textContent = v;
      });
      root.querySelectorAll('[data-i18n-html]').forEach((el) => {
        const k = el.getAttribute('data-i18n-html');
        const v = d[k];
        if (v !== undefined) el.innerHTML = v;
      });
      root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        const k = el.getAttribute('data-i18n-ph');
        if (d[k] !== undefined) el.setAttribute('placeholder', d[k]);
      });
      root.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const k = el.getAttribute('data-i18n-title');
        if (d[k] !== undefined) el.setAttribute('title', d[k]);
      });
      root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
        const k = el.getAttribute('data-i18n-aria');
        if (d[k] !== undefined) el.setAttribute('aria-label', d[k]);
      });
    },

    mountSwitchers() {
      document.querySelectorAll('[data-i18n-switcher]').forEach((host) => {
        if (host.dataset.mounted) return;
        host.dataset.mounted = '1';
        host.innerHTML = this.switcherHTML();
        host.querySelectorAll('[data-lang]').forEach((b) => {
          b.onclick = () => { this.setLang(b.dataset.lang); this.mountSwitchers(); };
        });
      });
    },

    switcherHTML() {
      const cur = this.lang;
      const items = LANGS.map((l) => {
        const active = l.code === cur ? ' active' : '';
        return '<button type="button" class="lang-btn' + active + '" data-lang="' + l.code + '" title="' + l.name + '" aria-label="' + l.name + '">' + l.label + '</button>';
      }).join('');
      return '<div class="lang-switcher" role="group" aria-label="Langue / Language / اللغة / Lingua">' + items + '</div>';
    }
  };

  /* Inject minimal switcher styles once */
  const css = document.createElement('style');
  css.textContent =
    '.lang-switcher{display:inline-flex;gap:2px;border:1px solid var(--border,#2a343a);border-radius:99px;padding:2px;background:var(--surface-2,rgba(255,255,255,.05))}' +
    '.lang-switcher .lang-btn{background:transparent;border:none;border-radius:99px;color:var(--muted,#8fa1ab);font-size:.72rem;font-weight:600;padding:4px 9px;cursor:pointer;font-family:inherit}' +
    '.lang-switcher .lang-btn:hover{color:var(--ember,#f2a65a)}' +
    '.lang-switcher .lang-btn.active{background:linear-gradient(155deg,var(--ember,#f2a65a),var(--ember-dim,#c9752f));color:#241202}' +
    '[dir="rtl"] .site-links{flex-direction:row-reverse}' +
    '[dir="rtl"] .lang-switcher{direction:ltr}';
  document.head.appendChild(css);

  window.I18N = I18N;
})();