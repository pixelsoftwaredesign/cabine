/* =========================================================
   Cabine — animations.js
   © pixelsoftwaredesign 2026
   Intelligent motion utilities for the kiosk, booking and
   partner apps: scroll reveals, data pulses, smooth numbers,
   ripples, toasts, countdown rings and ambient temperature
   shifts.
   ========================================================= */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function now() {
    return window.performance && performance.now ? performance.now() : Date.now();
  }

  function ease(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /* ---------- 1. Scroll reveal ---------- */
  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  function observeReveals(root) {
    (root || document).querySelectorAll('.reveal:not(.revealed)').forEach(function (el) {
      if (prefersReduced) { el.classList.add('revealed'); return; }
      revealObserver.observe(el);
    });
  }

  /* ---------- 2. Smooth number display ---------- */
  function smoothNumber(el, target, opts) {
    opts = opts || {};
    var duration = opts.duration || 700;
    var decimals = opts.decimals != null ? opts.decimals : getDecimals(el) || 0;
    var suffix = opts.suffix != null ? opts.suffix : (el.dataset.suffix != null ? el.dataset.suffix : '');
    var from = parseFloat(el.dataset.value != null ? el.dataset.value : 0) || 0;

    if (from === target) return;
    if (prefersReduced) { el.dataset.value = target; el.textContent = fmt(target, decimals, suffix); return; }

    el.classList.add('changing');
    var start = now();
    function frame() {
      var t = Math.min((now() - start) / duration, 1);
      var v = from + (target - from) * ease(t);
      el.textContent = fmt(v, decimals, suffix);
      if (t < 1) requestAnimationFrame(frame);
      else {
        el.dataset.value = target;
        el.classList.remove('changing');
      }
    }
    requestAnimationFrame(frame);
  }

  function fmt(v, decimals, suffix) {
    return v.toFixed(decimals) + suffix;
  }

  function getDecimals(el) {
    var dot = el.textContent.indexOf('.');
    return dot === -1 ? 0 : el.textContent.length - dot - 1;
  }

  function bindSmoothNumbers(root) {
    (root || document).querySelectorAll('[data-smooth]').forEach(function (el) {
      el.dataset.value = el.textContent;
    });
  }

  /* ---------- 3. Data arrival pulse ---------- */
  function pulseData(el) {
    if (!el) return;
    el.classList.remove('data-pulse');
    void el.offsetWidth;
    el.classList.add('data-pulse');
  }

  /* ---------- 4. Button ripple ---------- */
  var rippleWaves = [];
  function ripple(e) {
    var el = e.currentTarget;
    if (prefersReduced) return;
    var rect = el.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height) * 1.2;
    var wave = document.createElement('span');
    wave.className = 'ripple-wave';
    wave.style.width = wave.style.height = size + 'px';
    wave.style.left = (e.clientX - rect.left - size / 2) + 'px';
    wave.style.top = (e.clientY - rect.top - size / 2) + 'px';
    el.appendChild(wave);
    rippleWaves.push(wave);
    setTimeout(function () {
      if (wave.parentNode) wave.parentNode.removeChild(wave);
    }, 550);
  }

  function bindRipples(root) {
    (root || document).querySelectorAll('.btn, .key, .device, .slot.available')
      .forEach(function (el) { el.addEventListener('pointerdown', ripple); });
  }

  /* ---------- 5. Toast helper ---------- */
  function toast(elOrMsg, opts) {
    opts = opts || {};
    var el = elOrMsg;
    if (typeof elOrMsg === 'string') {
      el = document.createElement('div');
      el.className = 'toast pop-in';
      el.textContent = elOrMsg;
      document.body.appendChild(el);
    } else {
      el.classList.add('show');
    }
    var duration = opts.duration || 2600;
    setTimeout(function () {
      el.classList.remove('show');
      el.classList.add('hiding');
      el.addEventListener('animationend', function (e) {
        if (e.animationName === 'notifSlideOut' && el.parentNode) el.parentNode.removeChild(el);
      });
    }, duration);
    return el;
  }

  /* ---------- 6. Countdown ring ---------- */
  function countdownRing(ringEl, pct) {
    pct = Math.max(0, Math.min(1, pct));
    var circle = ringEl.querySelector('circle');
    if (!circle) return;
    var r = parseFloat(circle.getAttribute('r'));
    var circ = 2 * Math.PI * r;
    circle.style.strokeDasharray = circ;
    circle.style.strokeDashoffset = circ * (1 - pct);
  }

  /* ---------- 7. Ambient temperature shift ---------- */
  function setAmbient(tempC) {
    if (tempC == null) return;
    var body = document.body;
    body.classList.toggle('ambient-warm', tempC >= 22);
    body.classList.toggle('ambient-cool', tempC < 22);
  }

  /* ---------- 8. View transition ---------- */
  function showScreen(screens, name) {
    var els = screens, from, to;
    if (Array.isArray(screens)) { from = null; }
    var current = document.querySelector('.screen:not(.hidden)');
    var next = typeof name === 'string' ? document.getElementById(name) : name;
    if (!next || next === current) return;
    if (current) {
      current.classList.add('hidden');
      current.classList.remove('view-enter');
    }
    next.classList.remove('hidden');
    next.classList.add('view-enter');
    next.addEventListener('animationend', function h() {
      next.classList.remove('view-enter');
      next.removeEventListener('animationend', h);
    });
  }

  /* ---------- Public API ---------- */
  window.CabinMotion = {
    observeReveals: observeReveals,
    smoothNumber: smoothNumber,
    bindSmoothNumbers: bindSmoothNumbers,
    pulseData: pulseData,
    bindRipples: bindRipples,
    ripple: ripple,
    toast: toast,
    countdownRing: countdownRing,
    setAmbient: setAmbient,
    showScreen: showScreen,
    prefersReduced: prefersReduced,
    init: function (root) {
      bindSmoothNumbers(root);
      observeReveals(root);
      bindRipples(root);
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    window.CabinMotion.init(document);
  });
})();