(function () {
  'use strict';

  /**
   * VR3D Overlay Player v7 (Canvas + WebXR VR mode)
   * ----------------------------------------------
   * - Non-VR: canvas overlay (двойное -> в два глаза на экране) + HUD + seek + FULL
   * - VR: WebXR immersive-vr, рендер в каждый глаз (без Pico Video Settings), правильный экран, без "квадрата"
   * - No <select>: кнопки-группы (без белых выпадашек)
   */

  // =========================
  // Logger (минимальный)
  // =========================
  var Log = {
    on: true,
    v: true,
    i: function () { if (this.on) try { console.log.apply(console, arguments); } catch (e) {} },
    w: function () { if (this.on) try { console.warn.apply(console, arguments); } catch (e) {} }
  };

  // =========================
  // Storage / Settings
  // =========================
  var STORE_KEY = 'vr3d_overlay_settings_v7';

  function safeParse(j, def) { try { return JSON.parse(j); } catch (e) { return def; } }

  function storageGet() {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) return Lampa.Storage.get(STORE_KEY, '{}'); } catch (e) {}
    try { return localStorage.getItem(STORE_KEY) || '{}'; } catch (e2) {}
    return '{}';
  }

  function storageSet(val) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) return Lampa.Storage.set(STORE_KEY, val); } catch (e) {}
    try { localStorage.setItem(STORE_KEY, val); } catch (e2) {}
  }

  var S = (function () {
    var s = safeParse(storageGet(), {}) || {};

    // auto 3D detect
    if (typeof s.auto !== 'boolean') s.auto = true;

    // UI
    if (typeof s.hud !== 'boolean') s.hud = true;
    if (typeof s.hud_fullscreen !== 'boolean') s.hud_fullscreen = true;
    if (typeof s.hud_vr !== 'boolean') s.hud_vr = true;

    if (typeof s.hud_autohide !== 'boolean') s.hud_autohide = true;
    if (typeof s.hud_autohide_ms !== 'number') s.hud_autohide_ms = 3500;

    // Render settings
    if (typeof s.mode !== 'string') s.mode = 'sbs';           // 2d|sbs|tab
    if (typeof s.fit !== 'string') s.fit = 'contain';         // contain|cover|height
    if (typeof s.zoom !== 'number') s.zoom = 1.05;            // 1..2
    if (typeof s.ipd !== 'number') s.ipd = 0.01;              // -0.12..0.12

    // Fixes by name
    if (typeof s.fix_half_ou !== 'string') s.fix_half_ou = 'auto';   // auto|on|off
    if (typeof s.fix_half_sbs !== 'string') s.fix_half_sbs = 'auto'; // auto|on|off

    // Logs
    if (typeof s.log !== 'boolean') s.log = true;
    if (typeof s.verbose !== 'boolean') s.verbose = true;

    function save() { storageSet(JSON.stringify(s)); Log.on = !!s.log; Log.v = !!s.verbose; }
    save();

    return {
      get: function () { return s; },
      save: save
    };
  })();

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // =========================
  // Utils: url/filename + detector
  // =========================
  function getPlayUrl(data) {
    return data ? (data.url || data.play || data.stream || null) : null;
  }

  function extractFilenameFromUrl(url) {
    if (!url) return '';
    try {
      var u = new URL(url, location.href);
      var parts = (u.pathname || '').split('/').filter(Boolean);
      var last = parts[parts.length - 1] || '';
      try { return decodeURIComponent(last); } catch (e) { return last; }
    } catch (e2) {
      return '';
    }
  }

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

  function isHalfOU(hint) {
    hint = String(hint || '').toLowerCase();
    return /(halfou|hou|half[-\s]?ou|h[-\s]?ou)/i.test(hint);
  }

  function isHalfSBS(hint) {
    hint = String(hint || '').toLowerCase();
    return /(hsbs|half[-\s]?sbs|h[-\s]?sbs)/i.test(hint);
  }

  // =========================
  // Fullscreen (Android-friendly)
  // =========================
  function fullscreenToggle() {
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
    Log.w('[VR3D] fullscreen: no lampa button found');
  }

  // =========================
  // CSS: mono glass + no select
  // =========================
  function injectCSS() {
    if (document.getElementById('vr3d_css_v7')) return;

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
      .vr3d-range{ width:160px; accent-color:#ffffff; }
      .vr3d-seek-row{ margin-top:10px; display:flex; gap:12px; align-items:center; }
      .vr3d-time{ font-size:12px; opacity:.85; min-width:120px; }
      .vr3d-seek{ flex:1; accent-color:#ffffff; }
      .vr3d-status{ margin-top:8px; font-size:11px; opacity:.65; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    `;

    var style = document.createElement('style');
    style.id = 'vr3d_css_v7';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // =========================
  // Canvas Overlay (flat mode)
  // =========================
  var CanvasOverlay = (function () {
    var st = {
      active: false,
      video: null,
      hint: '',
      canvas: null,
      ctx: null,
      raf: 0
    };

    function resize() {
      if (!st.canvas) return;
      var dpr = Math.max(1, window.devicePixelRatio || 1);
      var w = Math.floor(window.innerWidth * dpr);
      var h = Math.floor(window.innerHeight * dpr);
      if (st.canvas.width !== w || st.canvas.height !== h) {
        st.canvas.width = w;
        st.canvas.height = h;
      }
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
      } else {
        if (dstAR > srcAR) { drawH = dstH; drawW = dstH * srcAR; }
        else { drawW = dstW; drawH = dstW / srcAR; }
      }
      return { x: (dstW - drawW) / 2, y: (dstH - drawH) / 2, w: drawW, h: drawH };
    }

    function shouldFixHalfOU() {
      var s = S.get();
      if (s.fix_half_ou === 'off') return false;
      if (s.fix_half_ou === 'on') return true;
      return isHalfOU(st.hint);
    }

    function shouldFixHalfSBS() {
      var s = S.get();
      if (s.fix_half_sbs === 'off') return false;
      if (s.fix_half_sbs === 'on') return true;
      return isHalfSBS(st.hint);
    }

    function loop() {
      if (!st.active || !st.video || !st.ctx || !st.canvas) return;
      resize();

      var v = st.video;
      var vw = v.videoWidth || 0;
      var vh = v.videoHeight || 0;
      if (!vw || !vh) {
        st.raf = requestAnimationFrame(loop);
        return;
      }

      var s = S.get();
      var mode = s.mode;
      var fit = s.fit;
      var zoom = clamp(s.zoom, 1, 2);
      var ipd = clamp(s.ipd, -0.12, 0.12);

      var ctx = st.ctx;
      var cw = st.canvas.width;
      var ch = st.canvas.height;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cw, ch);

      var eyeW = cw / 2;
      var eyeH = ch;

      function drawEye(src, dstX0, isRight) {
        var virtW = src.sw;
        var virtH = src.sh;

        if (mode === 'tab' && shouldFixHalfOU()) virtH = src.sh * 2;
        if (mode === 'sbs' && shouldFixHalfSBS()) virtW = src.sw * 2;

        var r = fitRect(virtW, virtH, eyeW, eyeH, fit);
        var zw = r.w * zoom;
        var zh = r.h * zoom;
        var zx = dstX0 + (eyeW - zw) / 2;
        var zy = (eyeH - zh) / 2;

        var shift = eyeW * ipd;
        var eyeShift = isRight ? shift : -shift;

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

      ctx.fillStyle = '#000';
      ctx.fillRect(cw / 2 - 1, 0, 2, ch);

      st.raf = requestAnimationFrame(loop);
    }

    function enable(videoEl, hint) {
      disable();
      st.video = videoEl;
      st.hint = hint || '';

      var c = document.createElement('canvas');
      c.style.position = 'fixed';
      c.style.left = '0';
      c.style.top = '0';
      c.style.width = '100vw';
      c.style.height = '100vh';
      c.style.zIndex = '999999';
      c.style.pointerEvents = 'none';
      c.style.background = '#000';

      st.canvas = c;
      st.ctx = c.getContext('2d', { alpha: false });
      document.body.appendChild(c);

      st.active = true;
      loop();
    }

    function disable() {
      st.active = false;
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = 0;
      if (st.canvas && st.canvas.parentNode) st.canvas.parentNode.removeChild(st.canvas);
      st.canvas = null;
      st.ctx = null;
      st.video = null;
      st.hint = '';
    }

    return { enable: enable, disable: disable, isActive: function () { return st.active; } };
  })();

  // =========================
  // WebXR VR mode (the real fix for Pico)
  // =========================
  var WebXR = (function () {
    var st = {
      running: false,
      session: null,
      gl: null,
      refSpace: null,
      xrCanvas: null,
      prog: null,
      vbo: null,
      tex: null,
      video: null,
      hint: '',
      lastW: 0,
      lastH: 0
    };

    function glCompile(gl, type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
      }
      return sh;
    }

    function glProgram(gl, vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, glCompile(gl, gl.VERTEX_SHADER, vs));
      gl.attachShader(p, glCompile(gl, gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(p) || 'program link failed');
      }
      return p;
    }

    function shouldFixHalfOU() {
      var s = S.get();
      if (s.fix_half_ou === 'off') return false;
      if (s.fix_half_ou === 'on') return true;
      return isHalfOU(st.hint);
    }

    function shouldFixHalfSBS() {
      var s = S.get();
      if (s.fix_half_sbs === 'off') return false;
      if (s.fix_half_sbs === 'on') return true;
      return isHalfSBS(st.hint);
    }

    // vertex draws a plane in clip space; we use simple MVP from XR view-projection in JS
    var VS = `
      attribute vec2 aPos;
      attribute vec2 aUV;
      uniform mat4 uMVP;
      varying vec2 vUV;
      void main(){
        vUV = aUV;
        gl_Position = uMVP * vec4(aPos.xy, 0.0, 1.0);
      }
    `;

    // Fragment: pick correct half depending on eye + mode
    var FS = `
      precision mediump float;
      varying vec2 vUV;
      uniform sampler2D uTex;
      uniform int uMode;     // 0=2d 1=sbs 2=tab
      uniform int uEye;      // 0=left 1=right
      void main(){
        vec2 uv = vUV;

        if(uMode==1){
          // SBS
          if(uEye==0) uv.x = uv.x * 0.5;
          else        uv.x = 0.5 + uv.x * 0.5;
        } else if(uMode==2){
          // TAB
          if(uEye==0) uv.y = uv.y * 0.5;
          else        uv.y = 0.5 + uv.y * 0.5;
        }

        gl_FragColor = texture2D(uTex, uv);
      }
    `;

    // Build MVP: XR gives viewProjection already in view.projectionMatrix and view.transform
    // We'll place the quad in front at fixed distance using a simple model matrix.
    function matMul(a, b) {
      var o = new Float32Array(16);
      for (var r = 0; r < 4; r++) {
        for (var c = 0; c < 4; c++) {
          o[r*4+c] =
            a[r*4+0]*b[0*4+c] +
            a[r*4+1]*b[1*4+c] +
            a[r*4+2]*b[2*4+c] +
            a[r*4+3]*b[3*4+c];
        }
      }
      return o;
    }

    function matIdentity() {
      var m = new Float32Array(16);
      m[0]=1;m[5]=1;m[10]=1;m[15]=1;
      return m;
    }

    function matTranslate(z) {
      var m = matIdentity();
      m[14] = z;
      return m;
    }

    function matScale(x, y) {
      var m = matIdentity();
      m[0] = x;
      m[5] = y;
      return m;
    }

    function matFromXRRigidTransform(t) {
      // XRView.transform.matrix is column-major 4x4; WebGL expects column-major too.
      // We'll use inverse (view matrix) is already provided by XRView.transform.inverse.matrix in some APIs,
      // but not always. We can use t.inverse.matrix if exists.
      return new Float32Array(t.matrix);
    }

    function invertRigid(t) {
      // XR gives t.inverse in most browsers
      if (t.inverse && t.inverse.matrix) return new Float32Array(t.inverse.matrix);
      // fallback: assume matrix already view? (rare) — but better than crash
      return new Float32Array(t.matrix);
    }

    function start(video, hint) {
      if (!navigator.xr) {
        alert('WebXR не поддерживается этим браузером.');
        return;
      }
      if (st.running) return;

      st.video = video;
      st.hint = hint || '';

      navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] }).then(function (session) {
        st.session = session;

        // XR WebGL canvas
        var canvas = document.createElement('canvas');
        canvas.style.position = 'fixed';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.opacity = '0'; // не мешаем DOM, XR использует как render target
        canvas.style.pointerEvents = 'none';
        document.body.appendChild(canvas);
        st.xrCanvas = canvas;

        var gl = canvas.getContext('webgl', { xrCompatible: true, alpha: false, antialias: true });
        st.gl = gl;

        session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

        session.requestReferenceSpace('local-floor').then(function (refSpace) {
          st.refSpace = refSpace;

          // program
          st.prog = glProgram(gl, VS, FS);

          // quad geometry: aPos in [-1..1] but we'll scale in MVP
          // Two triangles: (x,y,u,v)
          var verts = new Float32Array([
            -1,-1, 0,0,
             1,-1, 1,0,
            -1, 1, 0,1,
            -1, 1, 0,1,
             1,-1, 1,0,
             1, 1, 1,1
          ]);

          st.vbo = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, st.vbo);
          gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

          // video texture
          st.tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, st.tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

          st.running = true;

          session.addEventListener('end', function () {
            stop();
          });

          session.requestAnimationFrame(onXRFrame);
        });
      }).catch(function (e) {
        alert('Не удалось войти в VR: ' + (e && e.message ? e.message : e));
      });
    }

    function stop() {
      st.running = false;

      try { if (st.session) st.session.end(); } catch (e) {}
      st.session = null;

      if (st.xrCanvas && st.xrCanvas.parentNode) st.xrCanvas.parentNode.removeChild(st.xrCanvas);
      st.xrCanvas = null;

      st.gl = null;
      st.refSpace = null;
      st.prog = null;
      st.vbo = null;
      st.tex = null;
      st.video = null;
      st.hint = '';
    }

    function getModeInt() {
      var mode = S.get().mode;
      if (mode === 'sbs') return 1;
      if (mode === 'tab') return 2;
      return 0;
    }

    function computePlaneScale(vw, vh) {
      // Size in meters: base height 1.2m, width by aspect
      // But need correct aspect PER EYE including half-fixes.
      var s = S.get();
      var mode = s.mode;

      var aspectEye;

      if (mode === 'sbs') {
        // eye width = vw/2; if halfSBS -> treat virtual width doubled
        if (shouldFixHalfSBS()) aspectEye = (vw / vh);              // virtW = vw
        else aspectEye = ( (vw/2) / vh );
      } else if (mode === 'tab') {
        // eye height = vh/2; if halfOU -> treat virtual height doubled => eye aspect = vw/vh
        if (shouldFixHalfOU()) aspectEye = (vw / vh);
        else aspectEye = ( vw / (vh/2) );
      } else {
        aspectEye = vw / vh;
      }

      // base size with zoom
      var zoom = clamp(s.zoom, 1, 2);
      var h = 1.2 * zoom;
      var w = h * aspectEye;

      return { w: w, h: h };
    }

    function onXRFrame(t, frame) {
      if (!st.running || !st.session || !st.gl || !st.refSpace) return;

      var session = st.session;
      var gl = st.gl;
      var layer = session.renderState.baseLayer;
      var pose = frame.getViewerPose(st.refSpace);
      if (!pose) {
        session.requestAnimationFrame(onXRFrame);
        return;
      }

      var v = st.video;
      var vw = v.videoWidth || 0;
      var vh = v.videoHeight || 0;

      // update texture if ready
      if (vw && vh) {
        gl.bindTexture(gl.TEXTURE_2D, st.tex);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        } catch (e) {
          // some browsers need video readyState, ignore
        }
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      gl.clearColor(0,0,0,1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(st.prog);

      // attribs
      gl.bindBuffer(gl.ARRAY_BUFFER, st.vbo);

      var aPos = gl.getAttribLocation(st.prog, 'aPos');
      var aUV  = gl.getAttribLocation(st.prog, 'aUV');

      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);

      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);

      // uniforms
      var uMVP = gl.getUniformLocation(st.prog, 'uMVP');
      var uTex = gl.getUniformLocation(st.prog, 'uTex');
      var uMode = gl.getUniformLocation(st.prog, 'uMode');
      var uEye = gl.getUniformLocation(st.prog, 'uEye');

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, st.tex);
      gl.uniform1i(uTex, 0);

      gl.uniform1i(uMode, getModeInt());

      // model: in front of viewer, fixed distance -2.0m
      // We place quad in view space, but easiest: build MVP per view:
      // MVP = projection * view * model
      // view matrix can be taken as inverse of view.transform (which is world-from-view)
      // We'll use view.transform.inverse.matrix when possible via invertRigid(view.transform)
      var dist = -2.0;
      var scale = computePlaneScale(vw || 16, vh || 9);
      var model = matMul(matTranslate(dist), matScale(scale.w/2, scale.h/2)); // /2 because aPos is -1..1

      for (var i = 0; i < pose.views.length; i++) {
        var view = pose.views[i];
        var vp = layer.getViewport(view);
        gl.viewport(vp.x, vp.y, vp.width, vp.height);

        // projection
        var proj = new Float32Array(view.projectionMatrix);

        // view matrix: inverse of view.transform
        var viewM = invertRigid(view.transform);

        var mvp = matMul(proj, matMul(viewM, model));
        gl.uniformMatrix4fv(uMVP, false, mvp);

        gl.uniform1i(uEye, (i === 0 ? 0 : 1));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      session.requestAnimationFrame(onXRFrame);
    }

    return {
      start: start,
      stop: stop,
      isRunning: function () { return st.running; }
    };
  })();

  // =========================
  // HUD (no select) + seek + VR button
  // =========================
  var HUD = (function () {
    var st = {
      ui: null,
      panel: null,
      seek: null,
      time: null,
      status: null,
      video: null,
      seeking: false,
      hideTimer: 0
    };

    function fmtTime(sec) {
      sec = Math.max(0, (sec || 0));
      if (!isFinite(sec)) sec = 0;
      var s = Math.floor(sec % 60);
      var m = Math.floor((sec / 60) % 60);
      var h = Math.floor(sec / 3600);
      if (h > 0) return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function clearHideTimer() {
      if (st.hideTimer) clearTimeout(st.hideTimer);
      st.hideTimer = 0;
    }

    function show(yes) {
      if (!st.ui) return;
      if (yes) st.ui.classList.remove('vr3d-hidden');
      else st.ui.classList.add('vr3d-hidden');
    }

    function scheduleHide() {
      var s = S.get();
      if (!s.hud_autohide) return;
      clearHideTimer();
      st.hideTimer = setTimeout(function () {
        if (st.seeking) return scheduleHide();
        show(false);
      }, Math.max(800, s.hud_autohide_ms || 3500));
    }

    function activity() {
      if (!st.ui) return;
      show(true);
      scheduleHide();
    }

    function syncActive() {
      if (!st.panel) return;
      var s = S.get();

      var modeBtns = st.panel.querySelectorAll('[data-g="mode"]');
      for (var i = 0; i < modeBtns.length; i++) {
        var b = modeBtns[i];
        b.classList.toggle('vr3d-active', b.getAttribute('data-v') === s.mode);
      }

      var fitBtns = st.panel.querySelectorAll('[data-g="fit"]');
      for (var j = 0; j < fitBtns.length; j++) {
        var f = fitBtns[j];
        f.classList.toggle('vr3d-active', f.getAttribute('data-v') === s.fit);
      }

      var z = st.panel.querySelector('[data-k="zoom"]');
      var p = st.panel.querySelector('[data-k="ipd"]');
      if (z) z.value = String(s.zoom);
      if (p) p.value = String(s.ipd);
    }

    function setMode(v) {
      var s = S.get();
      s.mode = v;
      S.save();
      syncActive();
    }

    function setFit(v) {
      var s = S.get();
      s.fit = v;
      S.save();
      syncActive();
    }

    function onTimeUpdate() {
      if (!st.video || !st.time || !st.seek) return;
      var v = st.video;
      var cur = v.currentTime || 0;
      var dur = v.duration || 0;

      if (!dur || !isFinite(dur)) {
        st.time.textContent = fmtTime(cur) + ' / --:--';
        return;
      }

      st.time.textContent = fmtTime(cur) + ' / ' + fmtTime(dur);

      if (!st.seeking) {
        var p = dur ? (cur / dur) : 0;
        p = Math.max(0, Math.min(1, p));
        st.seek.value = String(Math.round(p * 1000));
      }
    }

    function updateStatus(vw, vh) {
      if (!st.status) return;
      var s = S.get();
      st.status.textContent =
        'mode=' + s.mode +
        ' | fit=' + s.fit +
        ' | zoom=' + s.zoom.toFixed(2) +
        ' | ipd=' + s.ipd.toFixed(3) +
        ' | src=' + vw + 'x' + vh +
        (WebXR.isRunning() ? ' | VR=on' : '');
    }

    function mount(video) {
      unmount();
      injectCSS();

      st.video = video;

      var s = S.get();
      if (!s.hud) return;

      var ui = document.createElement('div');
      ui.className = 'vr3d-ui';
      ui.innerHTML =
        '<div class="vr3d-panel">' +
          '<div class="vr3d-row">' +
            '<span class="vr3d-badge">VR3D</span>' +

            '<div class="vr3d-group">' +
              '<button class="vr3d-chip" data-g="mode" data-v="2d">2D</button>' +
              '<button class="vr3d-chip" data-g="mode" data-v="sbs">SBS</button>' +
              '<button class="vr3d-chip" data-g="mode" data-v="tab">OU</button>' +
            '</div>' +

            '<div class="vr3d-group">' +
              '<button class="vr3d-chip" data-g="fit" data-v="contain">contain</button>' +
              '<button class="vr3d-chip" data-g="fit" data-v="cover">cover</button>' +
              '<button class="vr3d-chip" data-g="fit" data-v="height">height</button>' +
            '</div>' +

            '<span class="vr3d-lbl">zoom <input class="vr3d-range" data-k="zoom" type="range" min="1" max="2" step="0.01"/></span>' +
            '<span class="vr3d-lbl">ipd <input class="vr3d-range" data-k="ipd" type="range" min="-0.12" max="0.12" step="0.001"/></span>' +

            (s.hud_vr ? '<button class="vr3d-btn" data-act="vr">VR</button>' : '') +
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

      st.ui = ui;
      st.panel = ui.querySelector('.vr3d-panel');
      st.seek = ui.querySelector('[data-k="seek"]');
      st.time = ui.querySelector('[data-time]');
      st.status = ui.querySelector('[data-status]');

      syncActive();

      // activity
      document.addEventListener('pointerdown', activity, { passive: true });
      document.addEventListener('pointermove', activity, { passive: true });
      document.addEventListener('touchstart', activity, { passive: true });

      // controls
      st.panel.addEventListener('click', function (e) {
        activity();
        var t = e.target;
        if (!t || !t.getAttribute) return;

        var g = t.getAttribute('data-g');
        var v = t.getAttribute('data-v');
        var act = t.getAttribute('data-act');

        if (g === 'mode') setMode(v);
        if (g === 'fit') setFit(v);

        if (act === 'close') {
          CanvasOverlay.disable();
          WebXR.stop();
          unmount();
        }
        if (act === 'fs') fullscreenToggle();

        if (act === 'vr') {
          // Switch to WebXR mode:
          // - выключаем canvas overlay (чтобы не было двойного)
          // - стартуем WebXR (одна плоскость, корректный аспект)
          if (WebXR.isRunning()) {
            WebXR.stop();
            // назад в flat mode (если нужно)
            if (st.video) CanvasOverlay.enable(st.video, '');
          } else {
            CanvasOverlay.disable();
            WebXR.start(st.video, '');
          }
        }
      });

      st.panel.addEventListener('input', function (e) {
        activity();
        var t = e.target;
        if (!t || !t.getAttribute) return;
        var k = t.getAttribute('data-k');
        if (!k) return;
        var s = S.get();
        if (k === 'zoom') s.zoom = clamp(parseFloat(t.value) || 1, 1, 2);
        if (k === 'ipd') s.ipd = clamp(parseFloat(t.value) || 0, -0.12, 0.12);
        S.save();
      });

      // seek
      if (st.seek) {
        st.seek.addEventListener('pointerdown', function () { st.seeking = true; activity(); }, { passive: true });
        st.seek.addEventListener('pointerup', function () { st.seeking = false; activity(); scheduleHide(); }, { passive: true });
        st.seek.addEventListener('pointercancel', function () { st.seeking = false; activity(); scheduleHide(); }, { passive: true });

        st.seek.addEventListener('input', function () {
          activity();
          if (!st.video) return;
          var v = st.video;
          var dur = v.duration || 0;
          if (!dur || !isFinite(dur)) return;
          var val = parseFloat(st.seek.value) || 0;
          try { v.currentTime = (val / 1000) * dur; } catch (e) {}
          onTimeUpdate();
        });
      }

      try {
        st.video.addEventListener('timeupdate', onTimeUpdate, { passive: true });
        st.video.addEventListener('durationchange', onTimeUpdate, { passive: true });
      } catch (e2) {}

      // initial
      show(true);
      scheduleHide();

      // status updater in rAF will be done by overlay; but update once now:
      onTimeUpdate();
    }

    function unmount() {
      clearHideTimer();

      try { if (st.video) { st.video.removeEventListener('timeupdate', onTimeUpdate); st.video.removeEventListener('durationchange', onTimeUpdate); } } catch (e) {}

      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('pointermove', activity);
      document.removeEventListener('touchstart', activity);

      if (st.ui && st.ui.parentNode) st.ui.parentNode.removeChild(st.ui);

      st.ui = null; st.panel = null; st.seek = null; st.time = null; st.status = null;
      st.video = null; st.seeking = false;
    }

    return {
      mount: mount,
      unmount: unmount,
      updateStatus: updateStatus
    };
  })();

  // =========================
  // Video finder
  // =========================
  function findVideoSoon(cb, timeoutMs) {
    var start = Date.now();
    var t = setInterval(function () {
      var v = document.querySelector('video');
      if (v) { clearInterval(t); cb(v); return; }
      if (Date.now() - start > (timeoutMs || 15000)) { clearInterval(t); cb(null); }
    }, 100);
  }

  // =========================
  // Player patch
  // =========================
  function patchPlayer() {
    if (!window.Lampa || !Lampa.Player || !Lampa.Player.play) return false;
    if (Lampa.Player.__vr3d_v7_patched) return true;

    var originalPlay = Lampa.Player.play;
    var originalStop = Lampa.Player.stop;

    Lampa.Player.play = function (data) {
      var url = getPlayUrl(data) || '';
      var filename = extractFilenameFromUrl(url);

      // detect mode from filename first
      var mode = detect3DFromText(filename);
      if (!mode && data && data.quality_title) mode = detect3DFromText(data.quality_title);
      if (!mode && data && data.name) mode = detect3DFromText(data.name);

      var s = S.get();

      // apply auto
      var autoMode = null;
      if (s.auto && mode) {
        autoMode = mode;
        s.mode = autoMode;
        // gentle defaults
        if (autoMode === 'sbs' && s.fit === 'contain') s.fit = 'height';
        S.save();
      }

      var res = originalPlay.apply(this, arguments);

      var need = !!autoMode;
      // fallback for HLS/transcoding second play
      if (!need && s.auto && (s.mode === 'sbs' || s.mode === 'tab')) {
        if (/\/transcoding\//i.test(url) || /\.m3u8/i.test(url)) need = true;
      }

      if (need) {
        CanvasOverlay.disable();
        WebXR.stop();
        HUD.unmount();

        findVideoSoon(function (videoEl) {
          if (!videoEl) return;

          // hint for half fixes
          var hint = filename || (data && (data.quality_title || data.name) || '') || '';

          // start flat overlay + hud
          CanvasOverlay.enable(videoEl, hint);
          HUD.mount(videoEl);

          // HUD status updater: we can piggyback using a tiny interval
          // (cheap and good enough)
          var iv = setInterval(function () {
            if (!document.contains(videoEl) || (!CanvasOverlay.isActive() && !WebXR.isRunning())) {
              clearInterval(iv);
              return;
            }
            var vw = videoEl.videoWidth || 0;
            var vh = videoEl.videoHeight || 0;
            HUD.updateStatus(vw, vh);
          }, 500);
        }, 15000);
      }

      return res;
    };

    if (typeof originalStop === 'function') {
      Lampa.Player.stop = function () {
        try { CanvasOverlay.disable(); WebXR.stop(); HUD.unmount(); } catch (e) {}
        return originalStop.apply(this, arguments);
      };
    }

    Lampa.Player.__vr3d_v7_patched = true;
    Log.i('[VR3D] v7 patched Player.play');
    return true;
  }

  // =========================
  // Boot
  // =========================
  injectCSS();

  var tries = 0;
  var boot = setInterval(function () {
    tries++;
    if (patchPlayer() || tries > 120) clearInterval(boot);
  }, 250);

})();
