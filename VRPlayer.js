(function () {
  'use strict';

  /**
   * VR3D Overlay Player v6.3
   * --------------------------------------------------------
   * - UI как сейчас (наш HUD), но:
   *   1) Только Ч/Б + стекло (no white dropdowns)
   *   2) НЕТ <select> (заменено на кнопки-группы)
   *   3) HUD auto-hide (по умолчанию 3.5s)
   * - FULL: Android-friendly (Lampa method/button), без requestFullscreen()
   * - Seek bar встроен, мотание работает
   * - Detected 3D по filename в url (meta-only)
   */

  // =========================
  // Logger
  // =========================
  var Logger = (function () {
    var PREFIX = '[vr3d_overlay_player]';
    var enabled = true;
    var verbose = true;
    var counter = 0;

    function ts() {
      var d = new Date();
      return (
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0') + ':' +
        String(d.getSeconds()).padStart(2, '0') + '.' +
        String(d.getMilliseconds()).padStart(3, '0')
      );
    }

    function fmt(level, msg) {
      counter++;
      return PREFIX + ' #' + counter + ' ' + ts() + ' ' + level + ' ' + msg;
    }

    function _log() {
      try { console.log.apply(console, arguments); } catch (e) {}
    }

    function info(msg, obj) {
      if (!enabled) return;
      if (verbose && obj !== undefined) _log(fmt('INFO ', msg), obj);
      else _log(fmt('INFO ', msg));
    }

    function warn(msg, obj) {
      if (!enabled) return;
      if (obj !== undefined) _log(fmt('WARN ', msg), obj);
      else _log(fmt('WARN ', msg));
    }

    return {
      info: info,
      warn: warn,
      setEnabled: function (v) { enabled = !!v; },
      setVerbose: function (v) { verbose = !!v; },
      getState: function () { return { enabled: enabled, verbose: verbose }; }
    };
  })();

  // =========================
  // Storage
  // =========================
  var Storage = (function () {
    var STORE_KEY = 'vr3d_overlay_settings_v63';

    function safeParse(json, def) {
      try { return JSON.parse(json); } catch (e) { return def; }
    }

    function getRaw() {
      try {
        if (window.Lampa && Lampa.Storage && Lampa.Storage.get) return Lampa.Storage.get(STORE_KEY, '{}');
      } catch (e) {}
      try { return localStorage.getItem(STORE_KEY) || '{}'; } catch (e2) {}
      return '{}';
    }

    function setRaw(val) {
      try {
        if (window.Lampa && Lampa.Storage && Lampa.Storage.set) return Lampa.Storage.set(STORE_KEY, val);
      } catch (e) {}
      try { localStorage.setItem(STORE_KEY, val); } catch (e2) {}
    }

    function load() {
      var s = safeParse(getRaw(), {}) || {};

      if (typeof s.auto !== 'boolean') s.auto = true;

      if (typeof s.hud !== 'boolean') s.hud = true;
      if (typeof s.hud_fullscreen !== 'boolean') s.hud_fullscreen = true;

      // auto-hide HUD
      if (typeof s.hud_autohide !== 'boolean') s.hud_autohide = true;
      if (typeof s.hud_autohide_ms !== 'number') s.hud_autohide_ms = 3500;

      if (typeof s.fit !== 'string') s.fit = 'contain'; // contain|cover|height
      if (typeof s.mode !== 'string') s.mode = 'sbs';   // 2d|sbs|tab
      if (typeof s.zoom !== 'number') s.zoom = 1.05;    // 1..2
      if (typeof s.ipd !== 'number') s.ipd = 0.01;      // -0.12..0.12

      if (typeof s.log !== 'boolean') s.log = true;
      if (typeof s.verbose !== 'boolean') s.verbose = true;

      // FIXES
      if (typeof s.fix_half_ou !== 'string') s.fix_half_ou = 'auto'; // auto|on|off
      if (typeof s.fix_sbs_height !== 'string') s.fix_sbs_height = 'auto'; // auto|on|off
      if (typeof s.sbs_height_eps !== 'number') s.sbs_height_eps = 8;

      return s;
    }

    function save(obj) { setRaw(JSON.stringify(obj || {})); }

    return { load: load, save: save };
  })();

  // =========================
  // Utils
  // =========================
  var Utils = (function () {
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function decodeSafe(s) {
      try { return decodeURIComponent(String(s)); } catch (e) { return String(s); }
    }

    function parseUrl(u) {
      try { return new URL(u, location.href); } catch (e) { return null; }
    }

    function getPlayUrl(data) {
      if (!data) return null;
      return data.url || data.play || data.stream || null;
    }

    function extractFilenameFromUrl(url) {
      if (!url) return null;
      var u = parseUrl(url);
      if (!u) return null;
      var parts = (u.pathname || '').split('/').filter(Boolean);
      if (!parts.length) return null;
      return decodeSafe(parts[parts.length - 1]);
    }

    function fitRect(srcW, srcH, dstW, dstH, fit) {
      var srcAR = srcW / srcH;
      var dstAR = dstW / dstH;
      var drawW, drawH;

      if (fit === 'height') {
        drawH = dstH;
        drawW = dstH * srcAR;
      } else if (fit === 'cover') {
        if (dstAR > srcAR) { drawW = dstW; drawH = dstW / srcAR; }
        else { drawH = dstH; drawW = dstH * srcAR; }
      } else { // contain
        if (dstAR > srcAR) { drawH = dstH; drawW = dstH * srcAR; }
        else { drawW = dstW; drawH = dstW / srcAR; }
      }

      return { x: (dstW - drawW) / 2, y: (dstH - drawH) / 2, w: drawW, h: drawH };
    }

    function fmtTime(sec) {
      sec = Math.max(0, (sec || 0));
      if (!isFinite(sec)) sec = 0;
      var s = Math.floor(sec % 60);
      var m = Math.floor((sec / 60) % 60);
      var h = Math.floor(sec / 3600);
      if (h > 0) return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    return {
      clamp: clamp,
      getPlayUrl: getPlayUrl,
      extractFilenameFromUrl: extractFilenameFromUrl,
      fitRect: fitRect,
      fmtTime: fmtTime
    };
  })();

  // =========================
  // Settings wrapper
  // =========================
  var Settings = (function () {
    var s = Storage.load();

    function applyLogger() {
      Logger.setEnabled(!!s.log);
      Logger.setVerbose(!!s.verbose);
    }

    function get() { return s; }
    function save() { Storage.save(s); applyLogger(); }

    function set(partial) {
      if (!partial) return;
      for (var k in partial) s[k] = partial[k];
      save();
    }

    applyLogger();
    return { get: get, save: save, set: set };
  })();

  // =========================
  // CSS (mono glass, no white)
  // =========================
  function injectCSS() {
    if (document.getElementById('vr3d_css_v63')) return;

    var css = `
      .vr3d-ui{
        position:fixed; left:16px; right:16px; bottom:16px;
        z-index:1000000;
        font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
        transition:opacity .25s ease, transform .25s ease;
      }
      .vr3d-ui.vr3d-hidden{ opacity:0; transform:translateY(10px); pointer-events:none; }
      .vr3d-panel{
        background: rgba(0,0,0,.55);
        border:1px solid rgba(255,255,255,.10);
        border-radius: 16px;
        padding: 10px 12px;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 10px 28px rgba(0,0,0,.45);
        color:#fff;
      }
      .vr3d-row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .vr3d-badge{
        font-weight:700;
        font-size:13px;
        padding:6px 10px;
        border-radius:12px;
        background: rgba(255,255,255,.08);
        border:1px solid rgba(255,255,255,.10);
      }

      .vr3d-group{
        display:flex;
        gap:6px;
        padding:4px;
        border-radius:14px;
        background: rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.10);
      }
      .vr3d-chip{
        height:30px;
        padding:0 10px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.25);
        color:#fff;
        font-size:12px;
        cursor:pointer;
        user-select:none;
      }
      .vr3d-chip.vr3d-active{
        background: rgba(255,255,255,.14);
        border-color: rgba(255,255,255,.18);
      }

      .vr3d-btn{
        height:34px;
        padding:0 12px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color:#fff;
        font-size:13px;
        cursor:pointer;
        user-select:none;
      }
      .vr3d-btn:active{ transform:scale(.98); }

      .vr3d-lbl{ display:flex; gap:8px; align-items:center; font-size:12px; opacity:.9; }
      .vr3d-range{ width:160px; accent-color:#ffffff; } /* Ч/Б */

      .vr3d-seek-row{ margin-top:10px; display:flex; gap:12px; align-items:center; }
      .vr3d-time{ font-size:12px; opacity:.85; min-width:120px; }
      .vr3d-seek{ flex:1; accent-color:#ffffff; }

      .vr3d-status{ margin-top:8px; font-size:11px; opacity:.65; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

      /* никакой "белой простыни" от селектов — их нет */
    `;

    var style = document.createElement('style');
    style.id = 'vr3d_css_v63';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // =========================
  // Meta / Detector
  // =========================
  var Meta = (function () {
    function collectCandidates(data) {
      var url = Utils.getPlayUrl(data);
      var filename = Utils.extractFilenameFromUrl(url);

      var arr = [];
      if (filename) arr.push({ src: 'url.filename', text: filename });
      if (data && data.quality_title) arr.push({ src: 'data.quality_title', text: data.quality_title });
      if (data && data.name) arr.push({ src: 'data.name', text: data.name });
      if (data && data.title) arr.push({ src: 'data.title', text: data.title });
      return arr;
    }
    return { collectCandidates: collectCandidates };
  })();

  var Detector = (function () {
    function detect3DFromText(text) {
      text = String(text || '').toLowerCase();
      var has3D = /\b3d\b/.test(text);
      var isSBS = /(^|[^a-z0-9])(sbs|hsbs|h[-\s]?sbs|half[-\s]?sbs|side[-\s]?by[-\s]?side)([^a-z0-9]|$)/i.test(text);
      var isTAB = /(^|[^a-z0-9])(ou|hou|halfou|half[-\s]?ou|h[-\s]?ou|tab|top[-\s]?and[-\s]?bottom|over[-\s]?under)([^a-z0-9]|$)/i.test(text);

      if (!has3D && !isSBS && !isTAB) return null;
      if (isTAB && !isSBS) return 'tab';
      if (isSBS && !isTAB) return 'sbs';
      return 'sbs';
    }

    function detectFromPlayData(data) {
      var candidates = Meta.collectCandidates(data);
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        var mode = detect3DFromText(c.text);
        if (mode) return { mode: mode, source: c.src, text: c.text, all: candidates };
      }
      return { mode: null, source: null, text: null, all: candidates };
    }

    return { detectFromPlayData: detectFromPlayData };
  })();

  // =========================
  // Fullscreen (Android-friendly)
  // =========================
  var Fullscreen = (function () {
    function toggle() {
      try {
        if (window.Lampa && Lampa.Player) {
          if (typeof Lampa.Player.fullscreen === 'function') return Lampa.Player.fullscreen();
          if (typeof Lampa.Player.toggle_fullscreen === 'function') return Lampa.Player.toggle_fullscreen();
        }
      } catch (e) {}

      var btn =
        document.querySelector('.player-panel__fullscreen') ||
        document.querySelector('.player-panel [data-action="fullscreen"]') ||
        document.querySelector('[data-player-fullscreen]') ||
        document.querySelector('.player .fullscreen') ||
        document.querySelector('.player-panel__button.fullscreen') ||
        document.querySelector('.player-panel__right .icon-fullscreen');

      if (btn) return btn.click();

      Logger.warn('Fullscreen: no Lampa method/button found, skip to avoid Android reset');
    }

    return { toggle: toggle };
  })();

  // =========================
  // VideoFinder
  // =========================
  var VideoFinder = (function () {
    function findSoon(cb, timeoutMs) {
      var start = Date.now();
      var t = setInterval(function () {
        var v = document.querySelector('video');
        if (v) { clearInterval(t); cb(v); return; }
        if (Date.now() - start > (timeoutMs || 15000)) { clearInterval(t); cb(null); }
      }, 100);
    }
    return { findSoon: findSoon };
  })();

  // =========================
  // Overlay (canvas + mono glass HUD)
  // =========================
  var Overlay = (function () {
    var state = {
      active: false,
      video: null,
      canvas: null,
      ctx: null,
      raf: 0,
      mo: null,

      ui: null,
      ui_panel: null,
      ui_seek: null,
      ui_time: null,
      ui_status: null,

      seeking: false,
      lastMetaHint: '',

      hideTimer: 0
    };

    function clearHideTimer() {
      if (state.hideTimer) clearTimeout(state.hideTimer);
      state.hideTimer = 0;
    }

    function showHUD(visible) {
      if (!state.ui) return;
      if (visible) state.ui.classList.remove('vr3d-hidden');
      else state.ui.classList.add('vr3d-hidden');
    }

    function scheduleHide() {
      var s = Settings.get();
      if (!s.hud_autohide) return;

      clearHideTimer();
      state.hideTimer = setTimeout(function () {
        if (state.seeking) return scheduleHide();
        showHUD(false);
      }, Math.max(800, s.hud_autohide_ms || 3500));
    }

    function activity() {
      if (!state.active) return;
      showHUD(true);
      scheduleHide();
    }

    function enable(videoEl, metaHint) {
      if (!videoEl) return;
      if (state.active) disable();

      injectCSS();

      state.video = videoEl;
      state.lastMetaHint = metaHint || '';

      var canvas = document.createElement('canvas');
      canvas.className = 'vr3d_overlay_canvas';
      canvas.style.position = 'fixed';
      canvas.style.left = '0';
      canvas.style.top = '0';
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      canvas.style.zIndex = '999999';
      canvas.style.pointerEvents = 'none';
      canvas.style.background = '#000';

      state.ctx = canvas.getContext('2d', { alpha: false });
      state.canvas = canvas;
      document.body.appendChild(canvas);

      if (Settings.get().hud) createUI();

      state.mo = new MutationObserver(function () {
        if (!state.video || !document.contains(state.video)) disable();
      });
      state.mo.observe(document.body, { childList: true, subtree: true });

      document.addEventListener('pointermove', activity, { passive: true });
      document.addEventListener('pointerdown', activity, { passive: true });
      document.addEventListener('touchstart', activity, { passive: true });
      document.addEventListener('keydown', onKeyDown, true);

      try {
        state.video.addEventListener('timeupdate', onTimeUpdate, { passive: true });
        state.video.addEventListener('durationchange', onTimeUpdate, { passive: true });
      } catch (e) {}

      state.active = true;

      showHUD(true);
      scheduleHide();

      loop();
      onTimeUpdate();
    }

    function disable() {
      if (!state.active) return;
      state.active = false;

      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;

      if (state.mo) { try { state.mo.disconnect(); } catch (e) {} }
      state.mo = null;

      clearHideTimer();

      document.removeEventListener('pointermove', activity);
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('touchstart', activity);
      document.removeEventListener('keydown', onKeyDown, true);

      try {
        if (state.video) {
          state.video.removeEventListener('timeupdate', onTimeUpdate);
          state.video.removeEventListener('durationchange', onTimeUpdate);
        }
      } catch (e2) {}

      if (state.ui && state.ui.parentNode) state.ui.parentNode.removeChild(state.ui);
      state.ui = null;
      state.ui_panel = null;
      state.ui_seek = null;
      state.ui_time = null;
      state.ui_status = null;
      state.seeking = false;

      if (state.canvas && state.canvas.parentNode) state.canvas.parentNode.removeChild(state.canvas);
      state.canvas = null;
      state.ctx = null;
      state.video = null;
      state.lastMetaHint = '';
    }

    function resize() {
      if (!state.canvas) return;
      var dpr = Math.max(1, window.devicePixelRatio || 1);
      var w = Math.floor(window.innerWidth * dpr);
      var h = Math.floor(window.innerHeight * dpr);
      if (state.canvas.width !== w || state.canvas.height !== h) {
        state.canvas.width = w;
        state.canvas.height = h;
      }
    }

    function shouldHalfOUFix(vh) {
      var s = Settings.get();
      if (s.fix_half_ou === 'off') return false;
      if (s.fix_half_ou === 'on') return true;

      var hint = String(state.lastMetaHint || '').toLowerCase();
      if (/(halfou|hou|half[-\s]?ou|h[-\s]?ou)/i.test(hint)) return true;
      if (vh && vh <= 1100) return true;
      return false;
    }

    function normalizedSbsHeight(vh) {
      var s = Settings.get();
      if (s.fix_sbs_height === 'off') return vh;
      if (s.fix_sbs_height === 'on') return 1080;

      if (!vh) return vh;
      if (Math.abs(vh - 1080) <= (s.sbs_height_eps || 8)) return 1080;
      return vh;
    }

    function loop() {
      if (!state.active || !state.video || !state.ctx || !state.canvas) return;

      resize();

      var s = Settings.get();
      var v = state.video;

      var vw = v.videoWidth || 0;
      var vh = v.videoHeight || 0;

      if (!vw || !vh) {
        state.raf = requestAnimationFrame(loop);
        return;
      }

      var ctx = state.ctx;
      var cw = state.canvas.width;
      var ch = state.canvas.height;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cw, ch);

      var mode = s.mode;
      var fit = s.fit;
      var zoom = Utils.clamp(s.zoom, 1, 2.0);
      var ipd = Utils.clamp(s.ipd, -0.12, 0.12);

      var eyeW = cw / 2;
      var eyeH = ch;

      function drawEye(src, dstX0, isRightEye) {
        var virtW = src.sw;
        var virtH = src.sh;

        if (mode === 'tab') {
          if (shouldHalfOUFix(vh)) virtH = src.sh * 2;
        }
        if (mode === 'sbs') {
          virtH = normalizedSbsHeight(virtH);
        }

        var r = Utils.fitRect(virtW, virtH, eyeW, eyeH, fit);

        var zw = r.w * zoom;
        var zh = r.h * zoom;

        var zx = dstX0 + (eyeW - zw) / 2;
        var zy = (eyeH - zh) / 2;

        var shift = eyeW * ipd;
        var eyeShift = isRightEye ? shift : -shift;

        ctx.drawImage(v, src.sx, src.sy, src.sw, src.sh, zx + eyeShift, zy, zw, zh);
      }

      var leftSrc, rightSrc;
      if (mode === 'sbs') {
        leftSrc  = { sx: 0,    sy: 0, sw: vw / 2, sh: vh };
        rightSrc = { sx: vw/2, sy: 0, sw: vw / 2, sh: vh };
      } else if (mode === 'tab') {
        leftSrc  = { sx: 0, sy: 0,    sw: vw, sh: vh / 2 };
        rightSrc = { sx: 0, sy: vh/2, sw: vw, sh: vh / 2 };
      } else {
        leftSrc = rightSrc = { sx: 0, sy: 0, sw: vw, sh: vh };
      }

      drawEye(leftSrc, 0, false);
      drawEye(rightSrc, cw / 2, true);

      // separator
      ctx.fillStyle = '#000';
      ctx.fillRect(cw / 2 - 1, 0, 2, ch);

      updateStatus(vw, vh);

      state.raf = requestAnimationFrame(loop);
    }

    function setMode(mode) {
      var cur = Settings.get();
      cur.mode = mode;
      Settings.save();
      syncActiveChips();
    }

    function setFit(fit) {
      var cur = Settings.get();
      cur.fit = fit;
      Settings.save();
      syncActiveChips();
    }

    function syncActiveChips() {
      if (!state.ui_panel) return;
      var s = Settings.get();

      // mode group
      var modeBtns = state.ui_panel.querySelectorAll('[data-g="mode"]');
      for (var i = 0; i < modeBtns.length; i++) {
        var b = modeBtns[i];
        var v = b.getAttribute('data-v');
        if (v === s.mode) b.classList.add('vr3d-active');
        else b.classList.remove('vr3d-active');
      }

      // fit group
      var fitBtns = state.ui_panel.querySelectorAll('[data-g="fit"]');
      for (var j = 0; j < fitBtns.length; j++) {
        var f = fitBtns[j];
        var fv = f.getAttribute('data-v');
        if (fv === s.fit) f.classList.add('vr3d-active');
        else f.classList.remove('vr3d-active');
      }

      // sliders
      var z = state.ui_panel.querySelector('[data-k="zoom"]');
      var p = state.ui_panel.querySelector('[data-k="ipd"]');
      if (z) z.value = String(s.zoom);
      if (p) p.value = String(s.ipd);
    }

    function createUI() {
      var s = Settings.get();

      var ui = document.createElement('div');
      ui.className = 'vr3d-ui';
      ui.innerHTML =
        '<div class="vr3d-panel">' +
          '<div class="vr3d-row">' +
            '<span class="vr3d-badge">VR3D</span>' +

            '<div class="vr3d-group" aria-label="mode">' +
              '<button class="vr3d-chip" data-g="mode" data-v="2d">2D</button>' +
              '<button class="vr3d-chip" data-g="mode" data-v="sbs">SBS</button>' +
              '<button class="vr3d-chip" data-g="mode" data-v="tab">OU</button>' +
            '</div>' +

            '<div class="vr3d-group" aria-label="fit">' +
              '<button class="vr3d-chip" data-g="fit" data-v="contain">contain</button>' +
              '<button class="vr3d-chip" data-g="fit" data-v="cover">cover</button>' +
              '<button class="vr3d-chip" data-g="fit" data-v="height">height</button>' +
            '</div>' +

            '<span class="vr3d-lbl">zoom <input class="vr3d-range" data-k="zoom" type="range" min="1" max="2" step="0.01"/></span>' +
            '<span class="vr3d-lbl">ipd <input class="vr3d-range" data-k="ipd" type="range" min="-0.12" max="0.12" step="0.001"/></span>' +

            (s.hud_fullscreen ? '<button class="vr3d-btn" data-act="fs">FULL</button>' : '') +
            '<button class="vr3d-btn" data-act="close">ВЫКЛ</button>' +
          '</div>' +

          '<div class="vr3d-seek-row">' +
            '<span class="vr3d-time" data-time>00:00 / 00:00</span>' +
            '<input class="vr3d-seek" data-k="seek" type="range" min="0" max="1000" step="1" value="0"/>' +
          '</div>' +

          '<div class="vr3d-status" data-status></div>' +
        '</div>';

      document.body.appendChild(ui);

      state.ui = ui;
      state.ui_panel = ui.querySelector('.vr3d-panel');
      state.ui_seek = ui.querySelector('[data-k="seek"]');
      state.ui_time = ui.querySelector('[data-time]');
      state.ui_status = ui.querySelector('[data-status]');

      syncActiveChips();

      // keep visible while touching panel
      state.ui_panel.addEventListener('pointerdown', activity, { passive: true });
      state.ui_panel.addEventListener('pointermove', activity, { passive: true });

      // group buttons
      state.ui_panel.addEventListener('click', function (e) {
        activity();
        var t = e.target;
        if (!t || !t.getAttribute) return;

        var g = t.getAttribute('data-g');
        var v = t.getAttribute('data-v');
        var act = t.getAttribute('data-act');

        if (g === 'mode') setMode(v);
        if (g === 'fit') setFit(v);

        if (act === 'close') disable();
        if (act === 'fs') Fullscreen.toggle();
      });

      // sliders
      state.ui_panel.addEventListener('input', function (e) {
        activity();
        var t = e.target;
        if (!t || !t.getAttribute) return;
        var k = t.getAttribute('data-k');
        if (!k) return;

        var cur = Settings.get();
        if (k === 'zoom') cur.zoom = Utils.clamp(parseFloat(t.value) || 1, 1, 2.0);
        if (k === 'ipd') cur.ipd = Utils.clamp(parseFloat(t.value) || 0, -0.12, 0.12);
        Settings.save();
      });

      // seek handling
      if (state.ui_seek) {
        state.ui_seek.addEventListener('pointerdown', function () { state.seeking = true; activity(); }, { passive: true });
        state.ui_seek.addEventListener('pointerup', function () { state.seeking = false; activity(); scheduleHide(); }, { passive: true });
        state.ui_seek.addEventListener('pointercancel', function () { state.seeking = false; activity(); scheduleHide(); }, { passive: true });

        state.ui_seek.addEventListener('input', function () {
          activity();
          if (!state.video) return;
          var v = state.video;
          var dur = v.duration || 0;
          if (!dur || !isFinite(dur)) return;

          var val = parseFloat(state.ui_seek.value) || 0;
          var nextTime = (val / 1000) * dur;
          try { v.currentTime = nextTime; } catch (e) {}
          onTimeUpdate();
        });
      }
    }

    function updateStatus(vw, vh) {
      if (!state.ui_status) return;
      var s = Settings.get();
      state.ui_status.textContent =
        'mode=' + s.mode +
        ' | fit=' + s.fit +
        ' | zoom=' + s.zoom.toFixed(2) +
        ' | ipd=' + s.ipd.toFixed(3) +
        ' | src=' + vw + 'x' + vh;
    }

    function onTimeUpdate() {
      if (!state.video || !state.ui_time || !state.ui_seek) return;

      var v = state.video;
      var cur = v.currentTime || 0;
      var dur = v.duration || 0;

      if (!dur || !isFinite(dur)) {
        state.ui_time.textContent = Utils.fmtTime(cur) + ' / --:--';
        return;
      }

      state.ui_time.textContent = Utils.fmtTime(cur) + ' / ' + Utils.fmtTime(dur);

      if (!state.seeking) {
        var p = dur ? (cur / dur) : 0;
        p = Math.max(0, Math.min(1, p));
        state.ui_seek.value = String(Math.round(p * 1000));
      }
    }

    function onKeyDown(e) {
      if (!state.active) return;
      activity();

      var code = e.keyCode || e.which;

      // ESC / BACK
      if (code === 27) { e.preventDefault(); disable(); return; }
      if (code === 8 || code === 461 || code === 10009) { e.preventDefault(); disable(); return; }

      // ENTER cycle mode
      if (code === 13) {
        e.preventDefault();
        var s = Settings.get();
        var order = ['2d', 'sbs', 'tab'];
        var idx = order.indexOf(s.mode);
        s.mode = order[(idx + 1) % order.length];
        Settings.save();
        syncActiveChips();
        return;
      }

      // arrows
      var st = Settings.get();

      if (code === 37) { // LEFT ipd-
        e.preventDefault();
        st.ipd = Utils.clamp(st.ipd - 0.002, -0.12, 0.12);
        Settings.save();
        syncActiveChips();
        return;
      }
      if (code === 39) { // RIGHT ipd+
        e.preventDefault();
        st.ipd = Utils.clamp(st.ipd + 0.002, -0.12, 0.12);
        Settings.save();
        syncActiveChips();
        return;
      }
      if (code === 38) { // UP zoom+
        e.preventDefault();
        st.zoom = Utils.clamp(st.zoom + 0.01, 1, 2.0);
        Settings.save();
        syncActiveChips();
        return;
      }
      if (code === 40) { // DOWN zoom-
        e.preventDefault();
        st.zoom = Utils.clamp(st.zoom - 0.01, 1, 2.0);
        Settings.save();
        syncActiveChips();
        return;
      }
    }

    return { enable: enable, disable: disable, isActive: function () { return state.active; } };
  })();

  // =========================
  // PlayerPatch
  // =========================
  var PlayerPatch = (function () {
    var patched = false;

    function patch() {
      if (patched) return true;
      if (!window.Lampa || !Lampa.Player || !Lampa.Player.play) return false;

      var originalPlay = Lampa.Player.play;
      var originalStop = Lampa.Player.stop;

      Lampa.Player.play = function (data) {
        var s = Settings.get();

        var detect = Detector.detectFromPlayData(data);

        Logger.info('Player.play', {
          url: Utils.getPlayUrl(data),
          title: data && (data.title || data.name) || null,
          detect_mode: detect.mode,
          detect_src: detect.source
        });

        var manual = !!(data && data.vr3d);
        var forcedMode = null;

        if (manual) {
          if (typeof data.vr3d === 'string') forcedMode = data.vr3d;
          else if (data.vr3d && data.vr3d.mode) forcedMode = data.vr3d.mode;

          var patchSet = {};
          if (forcedMode) patchSet.mode = forcedMode;
          if (data.vr3d && data.vr3d.fit) patchSet.fit = data.vr3d.fit;
          if (data.vr3d && typeof data.vr3d.zoom === 'number') patchSet.zoom = Utils.clamp(data.vr3d.zoom, 1, 2.0);
          if (data.vr3d && typeof data.vr3d.ipd === 'number') patchSet.ipd = Utils.clamp(data.vr3d.ipd, -0.12, 0.12);

          Settings.set(patchSet);
        }

        var autoMode = null;
        if (!manual && s.auto && detect.mode) {
          autoMode = detect.mode;
          Settings.set({ mode: autoMode });

          // мягкий дефолт
          var cur = Settings.get();
          if (autoMode === 'sbs' && cur.fit === 'contain') Settings.set({ fit: 'height' });
        }

        var res = originalPlay.apply(this, arguments);

        var needOverlay = manual || !!autoMode;

        // fallback для HLS/transcoding второго play
        if (!needOverlay && Settings.get().auto) {
          var curS = Settings.get();
          if (curS.mode === 'sbs' || curS.mode === 'tab') {
            var u = Utils.getPlayUrl(data) || '';
            if (/\/transcoding\//i.test(u) || /\.m3u8/i.test(u)) needOverlay = true;
          }
        }

        if (needOverlay) {
          Overlay.disable();

          var hint = (detect && detect.text) ? String(detect.text) : (Utils.extractFilenameFromUrl(Utils.getPlayUrl(data)) || '');

          VideoFinder.findSoon(function (videoEl) {
            if (!videoEl) return;

            var cur = Settings.get();
            if (forcedMode) cur.mode = forcedMode;
            else if (autoMode) cur.mode = autoMode;
            Settings.save();

            Overlay.enable(videoEl, hint);
          }, 15000);
        }

        return res;
      };

      if (typeof originalStop === 'function') {
        Lampa.Player.stop = function () {
          try { Overlay.disable(); } catch (e) {}
          return originalStop.apply(this, arguments);
        };
      }

      patched = true;
      Logger.info('Patched Player.play', { auto: Settings.get().auto });
      return true;
    }

    return { patch: patch };
  })();

  // =========================
  // Boot
  // =========================
  function boot() {
    Logger.info('Boot', { logger: Logger.getState(), settings: Settings.get() });

    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (PlayerPatch.patch() || tries > 120) clearInterval(t);
    }, 250);

    window.vr3d_overlay_player = {
      settings: function () { return JSON.parse(JSON.stringify(Settings.get())); },
      set: function (obj) { Settings.set(obj); },
      disable_now: function () { Overlay.disable(); }
    };
  }

  boot();

})();
