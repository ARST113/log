(function () {
  'use strict';

  /**
   * VR3D Overlay Player v6.1 (Android-friendly fullscreen + seek bar)
   * ----------------------------------------------------------------
   * Главное отличие от v6:
   * 1) FULL теперь пытается включать fullscreen "как в Lampa" (через методы/клик по кнопке),
   *    НЕ через browser Fullscreen API (который на Android пересоздаёт video и сбрасывает overlay).
   * 2) В HUD добавлен таймбар (seek) — мотание работает независимо от нативных контролов.
   *
   * Детект 3D:
   * - meta-only из Lampa.Player.play(data): в первую очередь по filename из data.url/play/stream
   *
   * Режимы:
   * - 2d / sbs / tab(ou)
   *
   * FIT:
   * - contain / cover / height
   *
   * Fixes:
   * - TAB halfOU fix: виртуально удваиваем высоту половинки (auto/on/off)
   * - SBS 3840x1078 fix: виртуально нормализуем высоту к 1080 (auto/on/off)
   *
   * Hotkeys (если есть клавиатура):
   * - BACK/ESC: выключить overlay
   * - LEFT/RIGHT: ipd -/+
   * - UP/DOWN: zoom +/-
   * - ENTER: cycle mode 2d->sbs->tab
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

    function error(msg, obj) {
      if (!enabled) return;
      if (obj !== undefined) _log(fmt('ERROR', msg), obj);
      else _log(fmt('ERROR', msg));
    }

    return {
      info: info,
      warn: warn,
      error: error,
      setEnabled: function (v) { enabled = !!v; },
      setVerbose: function (v) { verbose = !!v; },
      getState: function () { return { enabled: enabled, verbose: verbose }; }
    };
  })();

  // =========================
  // Storage
  // =========================
  var Storage = (function () {
    var STORE_KEY = 'vr3d_overlay_settings_v61';

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

    function save() {
      Storage.save(s);
      applyLogger();
    }

    function set(partial) {
      if (!partial) return;
      for (var k in partial) s[k] = partial[k];
      save();
    }

    applyLogger();
    return { get: get, save: save, set: set };
  })();

  // =========================
  // Meta
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

  // =========================
  // Detector
  // =========================
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
      // 1) методы Lampa (если есть)
      try {
        if (window.Lampa && Lampa.Player) {
          if (typeof Lampa.Player.fullscreen === 'function') {
            Logger.info('Fullscreen: Lampa.Player.fullscreen()');
            return Lampa.Player.fullscreen();
          }
          if (typeof Lampa.Player.toggle_fullscreen === 'function') {
            Logger.info('Fullscreen: Lampa.Player.toggle_fullscreen()');
            return Lampa.Player.toggle_fullscreen();
          }
        }
      } catch (e) {}

      // 2) клик по кнопке fullscreen в интерфейсе Lampa
      var btn =
        document.querySelector('.player-panel__fullscreen') ||
        document.querySelector('.player-panel [data-action="fullscreen"]') ||
        document.querySelector('[data-player-fullscreen]') ||
        document.querySelector('.player .fullscreen') ||
        document.querySelector('.player-panel__button.fullscreen') ||
        document.querySelector('.player-panel__right .icon-fullscreen');

      if (btn) {
        Logger.info('Fullscreen: click UI button');
        btn.click();
        return;
      }

      // 3) fallback: НЕ делаем browser fullscreen (на Android это ломает video/overlay)
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
        if (v) {
          clearInterval(t);
          cb(v);
          return;
        }
        if (Date.now() - start > (timeoutMs || 15000)) {
          clearInterval(t);
          cb(null);
        }
      }, 100);
    }
    return { findSoon: findSoon };
  })();

  // =========================
  // Overlay
  // =========================
  var Overlay = (function () {
    var state = {
      active: false,
      video: null,
      canvas: null,
      ctx: null,
      raf: 0,
      mo: null,
      hud: null,
      hud_seek: null,
      hud_time: null,
      seeking: false,
      lastMetaHint: '' // filename hint to help auto fixes
    };

    function enable(videoEl, metaHint) {
      if (!videoEl) {
        Logger.warn('Overlay.enable: no videoEl');
        return;
      }
      if (state.active) disable();

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

      if (Settings.get().hud) createHUD();

      state.mo = new MutationObserver(function () {
        if (!state.video || !document.contains(state.video)) {
          Logger.warn('Overlay: video removed from DOM -> disable');
          disable();
        }
      });
      state.mo.observe(document.body, { childList: true, subtree: true });

      document.addEventListener('keydown', onKeyDown, true);

      // Чтобы таймбар обновлялся корректно
      try {
        state.video.addEventListener('timeupdate', onTimeUpdate, { passive: true });
        state.video.addEventListener('durationchange', onTimeUpdate, { passive: true });
      } catch (e) {}

      state.active = true;
      Logger.info('Overlay enabled', snapshotSettings());
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

      document.removeEventListener('keydown', onKeyDown, true);

      try {
        if (state.video) {
          state.video.removeEventListener('timeupdate', onTimeUpdate);
          state.video.removeEventListener('durationchange', onTimeUpdate);
        }
      } catch (e2) {}

      if (state.hud && state.hud.parentNode) state.hud.parentNode.removeChild(state.hud);
      state.hud = null;
      state.hud_seek = null;
      state.hud_time = null;
      state.seeking = false;

      if (state.canvas && state.canvas.parentNode) state.canvas.parentNode.removeChild(state.canvas);
      state.canvas = null;
      state.ctx = null;
      state.video = null;

      Logger.info('Overlay disabled');
    }

    function snapshotSettings() {
      var s = Settings.get();
      return {
        mode: s.mode,
        fit: s.fit,
        zoom: s.zoom,
        ipd: s.ipd,
        fix_half_ou: s.fix_half_ou,
        fix_sbs_height: s.fix_sbs_height
      };
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

      // half OU часто в контейнере 1080
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
        leftSrc  = { sx: 0,     sy: 0, sw: vw / 2, sh: vh };
        rightSrc = { sx: vw/2,  sy: 0, sw: vw / 2, sh: vh };
      } else if (mode === 'tab') {
        leftSrc  = { sx: 0, sy: 0,     sw: vw, sh: vh / 2 };
        rightSrc = { sx: 0, sy: vh/2,  sw: vw, sh: vh / 2 };
      } else {
        leftSrc = rightSrc = { sx: 0, sy: 0, sw: vw, sh: vh };
      }

      drawEye(leftSrc, 0, false);
      drawEye(rightSrc, cw / 2, true);

      // separator
      ctx.fillStyle = '#000';
      ctx.fillRect(cw / 2 - 1, 0, 2, ch);

      updateHUD(vw, vh);

      state.raf = requestAnimationFrame(loop);
    }

    function createHUD() {
      var s = Settings.get();

      var hud = document.createElement('div');
      hud.className = 'vr3d_overlay_hud';
      hud.style.position = 'fixed';
      hud.style.left = '10px';
      hud.style.bottom = '10px';
      hud.style.zIndex = '1000000';
      hud.style.padding = '8px 10px';
      hud.style.borderRadius = '10px';
      hud.style.background = 'rgba(0,0,0,0.55)';
      hud.style.color = '#fff';
      hud.style.fontSize = '14px';
      hud.style.pointerEvents = 'auto';
      hud.style.userSelect = 'none';
      hud.style.maxWidth = 'calc(100vw - 20px)';

      var fsBtn = s.hud_fullscreen
        ? '<button data-act="fs" style="background:#111;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px 12px;cursor:pointer">FULL</button>'
        : '';

      hud.innerHTML =
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<strong>VR3D</strong>' +
          '<select data-k="mode" style="background:#111;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px 10px">' +
            '<option value="2d">2D</option>' +
            '<option value="sbs">SBS</option>' +
            '<option value="tab">OU/TAB</option>' +
          '</select>' +
          '<select data-k="fit" style="background:#111;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px 10px">' +
            '<option value="contain">contain</option>' +
            '<option value="cover">cover</option>' +
            '<option value="height">height</option>' +
          '</select>' +
          '<label style="display:flex;gap:6px;align-items:center">zoom' +
            '<input data-k="zoom" type="range" min="1" max="2" step="0.01" style="width:160px" />' +
          '</label>' +
          '<label style="display:flex;gap:6px;align-items:center">ipd' +
            '<input data-k="ipd" type="range" min="-0.12" max="0.12" step="0.001" style="width:160px" />' +
          '</label>' +
          fsBtn +
          '<button data-act="close" style="background:#111;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px 12px;cursor:pointer">ВЫКЛ</button>' +
        '</div>' +
        '<div style="margin-top:8px;display:flex;gap:10px;align-items:center">' +
          '<span data-time style="font-size:12px;opacity:.85;min-width:110px">00:00 / 00:00</span>' +
          '<input data-k="seek" type="range" min="0" max="1000" step="1" value="0" style="flex:1" />' +
        '</div>' +
        '<div data-info style="margin-top:6px;opacity:.8;font-size:12px"></div>';

      document.body.appendChild(hud);
      state.hud = hud;

      hud.querySelector('[data-k="mode"]').value = s.mode;
      hud.querySelector('[data-k="fit"]').value = s.fit;
      hud.querySelector('[data-k="zoom"]').value = String(s.zoom);
      hud.querySelector('[data-k="ipd"]').value = String(s.ipd);

      state.hud_seek = hud.querySelector('[data-k="seek"]');
      state.hud_time = hud.querySelector('[data-time]');

      // Seek handling (touch friendly)
      if (state.hud_seek) {
        state.hud_seek.addEventListener('pointerdown', function () { state.seeking = true; }, { passive: true });
        state.hud_seek.addEventListener('pointerup', function () { state.seeking = false; }, { passive: true });
        state.hud_seek.addEventListener('pointercancel', function () { state.seeking = false; }, { passive: true });

        state.hud_seek.addEventListener('input', function () {
          if (!state.video) return;
          var v = state.video;
          var dur = v.duration || 0;
          if (!dur || !isFinite(dur)) return;

          var val = parseFloat(state.hud_seek.value) || 0;
          var nextTime = (val / 1000) * dur;
          try { v.currentTime = nextTime; } catch (e) {}
          onTimeUpdate(); // обновим текст сразу
        });
      }

      hud.addEventListener('input', function (e) {
        var t = e.target;
        if (!t || !t.getAttribute) return;
        var k = t.getAttribute('data-k');
        if (!k) return;

        var cur = Settings.get();

        if (k === 'mode') cur.mode = t.value;
        if (k === 'fit') cur.fit = t.value;
        if (k === 'zoom') cur.zoom = Utils.clamp(parseFloat(t.value) || 1, 1, 2.0);
        if (k === 'ipd') cur.ipd = Utils.clamp(parseFloat(t.value) || 0, -0.12, 0.12);

        Settings.save();
        Logger.info('HUD change', snapshotSettings());
      });

      hud.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.getAttribute) return;

        var act = t.getAttribute('data-act');
        if (act === 'close') disable();

        if (act === 'fs') {
          Fullscreen.toggle();
        }
      });
    }

    function updateHUD(vw, vh) {
      if (!state.hud) return;
      var info = state.hud.querySelector('[data-info]');
      if (!info) return;
      var s = Settings.get();

      info.textContent =
        'mode=' + s.mode +
        ' | fit=' + s.fit +
        ' | zoom=' + s.zoom.toFixed(2) +
        ' | ipd=' + s.ipd.toFixed(3) +
        ' | src=' + vw + 'x' + vh +
        ' | BACK/ESC=выкл, arrows=zoom/ipd, ENTER=mode';
    }

    function onTimeUpdate() {
      if (!state.video) return;
      if (!state.hud_time || !state.hud_seek) return;

      var v = state.video;
      var cur = v.currentTime || 0;
      var dur = v.duration || 0;

      if (!dur || !isFinite(dur)) {
        state.hud_time.textContent = Utils.fmtTime(cur) + ' / --:--';
        return;
      }

      state.hud_time.textContent = Utils.fmtTime(cur) + ' / ' + Utils.fmtTime(dur);

      // если пользователь прямо двигает — не перетираем положение бегунка
      if (!state.seeking) {
        var p = dur ? (cur / dur) : 0;
        p = Math.max(0, Math.min(1, p));
        state.hud_seek.value = String(Math.round(p * 1000));
      }
    }

    function cycleMode() {
      var s = Settings.get();
      var order = ['2d', 'sbs', 'tab'];
      var idx = order.indexOf(s.mode);
      s.mode = order[(idx + 1) % order.length];
      Settings.save();
      Logger.info('Mode cycle -> ' + s.mode);

      if (state.hud) {
        var sel = state.hud.querySelector('[data-k="mode"]');
        if (sel) sel.value = s.mode;
      }
    }

    function onKeyDown(e) {
      if (!state.active) return;
      var code = e.keyCode || e.which;

      if (code === 27) { e.preventDefault(); disable(); return; } // ESC
      if (code === 8 || code === 461 || code === 10009) { e.preventDefault(); disable(); return; } // BACK
      if (code === 13) { e.preventDefault(); cycleMode(); return; } // ENTER

      var s = Settings.get();

      if (code === 37) { // LEFT ipd-
        e.preventDefault();
        s.ipd = Utils.clamp(s.ipd - 0.002, -0.12, 0.12);
        Settings.save();
        if (state.hud) state.hud.querySelector('[data-k="ipd"]').value = String(s.ipd);
        return;
      }
      if (code === 39) { // RIGHT ipd+
        e.preventDefault();
        s.ipd = Utils.clamp(s.ipd + 0.002, -0.12, 0.12);
        Settings.save();
        if (state.hud) state.hud.querySelector('[data-k="ipd"]').value = String(s.ipd);
        return;
      }
      if (code === 38) { // UP zoom+
        e.preventDefault();
        s.zoom = Utils.clamp(s.zoom + 0.01, 1, 2.0);
        Settings.save();
        if (state.hud) state.hud.querySelector('[data-k="zoom"]').value = String(s.zoom);
        return;
      }
      if (code === 40) { // DOWN zoom-
        e.preventDefault();
        s.zoom = Utils.clamp(s.zoom - 0.01, 1, 2.0);
        Settings.save();
        if (state.hud) state.hud.querySelector('[data-k="zoom"]').value = String(s.zoom);
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

        Logger.info('Player.play intercepted', {
          url: Utils.getPlayUrl(data),
          title: data && (data.title || data.name) || null,
          auto: s.auto,
          manualVR3D: !!(data && data.vr3d)
        });

        var manual = !!(data && data.vr3d);
        var forcedMode = null;

        // manual overrides
        if (manual) {
          if (typeof data.vr3d === 'string') forcedMode = data.vr3d;
          else if (data.vr3d && data.vr3d.mode) forcedMode = data.vr3d.mode;

          var patchSet = {};
          if (data.vr3d && data.vr3d.fit) patchSet.fit = data.vr3d.fit;
          if (data.vr3d && typeof data.vr3d.zoom === 'number') patchSet.zoom = Utils.clamp(data.vr3d.zoom, 1, 2.0);
          if (data.vr3d && typeof data.vr3d.ipd === 'number') patchSet.ipd = Utils.clamp(data.vr3d.ipd, -0.12, 0.12);
          if (data.vr3d && typeof data.vr3d.hud === 'boolean') patchSet.hud = data.vr3d.hud;
          if (data.vr3d && typeof data.vr3d.hud_fullscreen === 'boolean') patchSet.hud_fullscreen = data.vr3d.hud_fullscreen;

          if (data.vr3d && typeof data.vr3d.fix_half_ou === 'string') patchSet.fix_half_ou = data.vr3d.fix_half_ou;
          if (data.vr3d && typeof data.vr3d.fix_sbs_height === 'string') patchSet.fix_sbs_height = data.vr3d.fix_sbs_height;

          if (forcedMode) patchSet.mode = forcedMode;

          Settings.set(patchSet);
          Logger.info('Manual vr3d applied', { forcedMode: forcedMode, patchSet: patchSet });
        }

        // auto detect
        var detect = Detector.detectFromPlayData(data);

        Logger.info('Detect result (meta-only)', {
          mode: detect.mode,
          source: detect.source,
          usedTextSample: detect.text ? String(detect.text).slice(0, 180) : null,
          candidates: detect.all ? detect.all.map(function (x) { return x.src; }) : []
        });

        var autoMode = null;
        if (!manual && s.auto && detect.mode) {
          autoMode = detect.mode;
          Settings.set({ mode: autoMode });

          // мягкий дефолт: SBS часто лучше height
          var cur = Settings.get();
          if (autoMode === 'sbs' && cur.fit === 'contain') Settings.set({ fit: 'height' });

          Logger.info('Auto mode applied', { mode: autoMode, source: detect.source, fit: Settings.get().fit });
        }

        // call original
        var res = originalPlay.apply(this, arguments);

        var needOverlay = manual || !!autoMode;

        Logger.info('Overlay decision', {
          needOverlay: needOverlay,
          manual: manual,
          forcedMode: forcedMode,
          autoMode: autoMode
        });

        // IMPORTANT: на Android/HLS иногда идёт второй play(main.m3u8),
        // где детект.mode=null (filename уже нет). Мы сохраняем предыдущий mode в Settings,
        // и если видео уже в 3D, можно включить overlay по текущему settings.mode,
        // но только если manual был или autoMode был на прошлом шаге.
        // Тут: если needOverlay=false, но settings.mode уже sbs/tab и auto включён — можно попытаться включить.
        if (!needOverlay && Settings.get().auto) {
          var curS = Settings.get();
          if (curS.mode === 'sbs' || curS.mode === 'tab') {
            // если текущий URL похож на транскодерный main.m3u8, то вероятно это продолжение того же запуска
            var u = Utils.getPlayUrl(data) || '';
            if (/\/transcoding\//i.test(u) || /\.m3u8/i.test(u)) {
              needOverlay = true;
              Logger.warn('Overlay fallback: enabling by remembered mode for transcoded/HLS url', { url: u, mode: curS.mode });
            }
          }
        }

        if (needOverlay) {
          Overlay.disable();

          // meta hint для фиксов (halfOU/HOU)
          var hint = (detect && detect.text) ? String(detect.text) : (Utils.extractFilenameFromUrl(Utils.getPlayUrl(data)) || '');

          VideoFinder.findSoon(function (videoEl) {
            if (!videoEl) {
              Logger.warn('VideoFinder: no <video> found -> overlay not enabled');
              return;
            }

            var cur = Settings.get();
            if (forcedMode) cur.mode = forcedMode;
            else if (autoMode) cur.mode = autoMode;
            Settings.save();

            Logger.info('Enabling overlay now', {
              mode: cur.mode, fit: cur.fit, zoom: cur.zoom, ipd: cur.ipd,
              fix_half_ou: cur.fix_half_ou, fix_sbs_height: cur.fix_sbs_height,
              hint: hint
            });

            Overlay.enable(videoEl, hint);
          }, 15000);
        }

        return res;
      };

      if (typeof originalStop === 'function') {
        Lampa.Player.stop = function () {
          Logger.info('Player.stop intercepted -> disable overlay');
          try { Overlay.disable(); } catch (e) {}
          return originalStop.apply(this, arguments);
        };
      }

      patched = true;
      Logger.info('Player patch applied', { auto: Settings.get().auto });
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
      enable_now: function (mode) {
        var v = document.querySelector('video');
        if (!v) return Logger.warn('enable_now: no <video> found');
        if (mode) Settings.set({ mode: mode });
        Overlay.enable(v, '');
      },
      disable_now: function () { Overlay.disable(); },
      full: function () { Fullscreen.toggle(); }
    };
  }

  boot();

})();
