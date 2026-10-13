/* Per-page i18n — viewer.html */
(function () {
  const fr = {
    'viewer.titleTag': 'Viewer 3D — Atlas Cabine',
    'viewer.logoSub': 'VIEWER 3D · LECTURE SEULE',
    'viewer.nav.map': '🗺️ Carte',
    'viewer.nav.editor': '📐 Éditeur Indoor',
    'viewer.api.online': 'API · en ligne',
    'viewer.level': 'Niveau',
    'viewer.btn.load': '⟳ Charger',
    'viewer.stat.cabins': 'Cabines',
    'viewer.stat.collisions': 'Collisions',
    'viewer.stat.sqm': 'm²',
    'viewer.glNote': '⚠️ Viewer 3D indisponible — WebGL est désactivé par votre navigateur.',
    'viewer.glNote.soft': '🔧 Rendu 3D logiciel actif (WebGL indisponible) — qualité visuelle réduite.',
    'viewer.toast.loaded': 'Plan chargé : {floor} ({n} cabines)',
    'viewer.toast.fallback': 'Serveur indisponible — plan restauré du navigateur',
    'viewer.toast.error': 'Échec : {msg}',
    'viewer.err.canvas2d': 'Canvas 2D indisponible',
    'viewer.aria.canvas': 'Zone de rendu 3D du plan',
    'viewer.foot': '© pixelsoftwaredesign 2026 · Viewer 3D — Atlas Cabine'
  };
  const en = {
    'viewer.titleTag': '3D viewer — Atlas Cabine',
    'viewer.logoSub': '3D VIEWER · READ ONLY',
    'viewer.nav.map': '🗺️ Map',
    'viewer.nav.editor': '📐 Indoor Editor',
    'viewer.api.online': 'API · online',
    'viewer.level': 'Level',
    'viewer.btn.load': '⟳ Load',
    'viewer.stat.cabins': 'Cabins',
    'viewer.stat.collisions': 'Collisions',
    'viewer.stat.sqm': 'm²',
    'viewer.glNote': '⚠️ 3D viewer unavailable — WebGL is disabled by your browser.',
    'viewer.glNote.soft': '🔧 Software 3D rendering active (WebGL unavailable) — reduced visual quality.',
    'viewer.toast.loaded': 'Layout loaded: {floor} ({n} cabins)',
    'viewer.toast.fallback': 'Server unavailable — layout restored from the browser',
    'viewer.toast.error': 'Failed: {msg}',
    'viewer.err.canvas2d': 'Canvas 2D unavailable',
    'viewer.aria.canvas': 'Plan 3D render area',
    'viewer.foot': '© pixelsoftwaredesign 2026 · 3D Viewer — Atlas Cabine'
  };
  const ar = {
    'viewer.titleTag': 'عارض ثلاثي الأبعاد — Atlas Cabine',
    'viewer.logoSub': 'عارض ثلاثي الأبعاد · قراءة فقط',
    'viewer.nav.map': '🗺️ الخريطة',
    'viewer.nav.editor': '📐 محرر داخلي',
    'viewer.api.online': 'API · متصل',
    'viewer.level': 'المستوى',
    'viewer.btn.load': '⟳ تحميل',
    'viewer.stat.cabins': 'الكبائن',
    'viewer.stat.collisions': 'التصادمات',
    'viewer.stat.sqm': 'م²',
    'viewer.glNote': '⚠️ العارض ثلاثي الأبعاد غير متاح — تم تعطيل WebGL من متصفحك.',
    'viewer.glNote.soft': '🔧 العرض ثلاثي الأبعاد البرمجي مفعّل (WebGL غير متاح) — جودة بصرية منخفضة.',
    'viewer.toast.loaded': 'تم تحميل المخطط: {floor} ({n} كابينة)',
    'viewer.toast.fallback': 'الخادم غير متاح — تمت استعادة المخطط من المتصفح',
    'viewer.toast.error': 'فشل: {msg}',
    'viewer.err.canvas2d': 'Canvas 2D غير متاح',
    'viewer.aria.canvas': 'منطقة عرض المخطط ثلاثي الأبعاد',
    'viewer.foot': '© pixelsoftwaredesign 2026 · عارض ثلاثي الأبعاد — Atlas Cabine'
  };
  const it = {
    'viewer.titleTag': 'Visualizzatore 3D — Atlas Cabine',
    'viewer.logoSub': 'VISUALIZZATORE 3D · SOLA LETTURA',
    'viewer.nav.map': '🗺️ Mappa',
    'viewer.nav.editor': '📐 Editor indoor',
    'viewer.api.online': 'API · online',
    'viewer.level': 'Livello',
    'viewer.btn.load': '⟳ Carica',
    'viewer.stat.cabins': 'Cabine',
    'viewer.stat.collisions': 'Collisioni',
    'viewer.stat.sqm': 'm²',
    'viewer.glNote': '⚠️ Visualizzatore 3D non disponibile — WebGL è disattivato dal tuo browser.',
    'viewer.glNote.soft': '🔧 Rendering 3D software attivo (WebGL non disponibile) — qualità visiva ridotta.',
    'viewer.toast.loaded': 'Pianta caricata: {floor} ({n} cabine)',
    'viewer.toast.fallback': 'Server non disponibile — pianta ripristinata dal browser',
    'viewer.toast.error': 'Errore: {msg}',
    'viewer.err.canvas2d': 'Canvas 2D non disponibile',
    'viewer.aria.canvas': 'Area di rendering 3D della pianta',
    'viewer.foot': '© pixelsoftwaredesign 2026 · Visualizzatore 3D — Atlas Cabine'
  };
  window.I18N && I18N.register && I18N.register({ fr, en, ar, it });
})();
