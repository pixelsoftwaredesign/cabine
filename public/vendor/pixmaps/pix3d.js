/* ═══════════════════════════════════════════════
   Pix3D — Moteur 3D WebGL maison (mode "Real")
   Terrain extrudé + routes 3D + villes depuis les
   données locales Maghreb. Aucune ressource externe.
   Retourne null si WebGL indisponible (repli 2D).
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var W = 65536;                 // monde world-units à zoom de référence 8
  var REFZ = 8;

  function mercX(lng) { return (lng + 180) / 360 * W; }
  function mercY(lat) {
    var s = Math.sin(lat * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * W;
  }
  function project(lat, lng) { return { x: mercX(lng), y: mercY(lat) }; }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ─── bruit déterministe pour le relief ───
  function hash01(x, y) {
    var s = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + 2147483647;
    s = ((s ^ (s >>> 13)) * 1274126177) | 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967295;
  }
  function elev(x, y) {
    var s = 0, a = 1, f = 2600;
    for (var o = 0; o < 4; o++) {
      s += a * (hash01(Math.floor(x / f), Math.floor(y / f)) * 2 - 1);
      a *= 0.55;
      f *= 0.45;
    }
    return s;
  }

  // ─── math 4x4 (column-major, style gl-matrix) ───
  function persp(fovy, asp, near, far, out) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0] = f / asp; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }
  function lookAt(eye, tgt, up, out) {
    var zx = eye[0] - tgt[0], zy = eye[1] - tgt[1], zz = eye[2] - tgt[2];
    var l = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1; zx /= l; zy /= l; zz /= l;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1; xx /= l; xy /= l; xz /= l;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  }

  var LIGHT_DIR = { x: 0.35, y: -0.5, z: 0.79 };
  var SEA_LEVEL = 0.05;

  var PALETTE = {
    deep: [0.05, 0.18, 0.32],
    ocean: [0.07, 0.26, 0.42],
    beach: [0.85, 0.78, 0.62],
    low: [0.40, 0.48, 0.28],
    mid: [0.52, 0.56, 0.33],
    high: [0.68, 0.62, 0.45],
    rock: [0.75, 0.72, 0.68],
    roadM: [1.0, 0.82, 0.45],
    roadS: [0.86, 0.70, 0.42],
    roadT: [0.72, 0.63, 0.46],
    border: [0.92, 0.94, 1.0],
    province: [0.80, 0.86, 0.98],
    city: [1.0, 0.95, 0.85]
  };

  function terrainColor(h, x, y) {
    var c;
    if (h < -0.02) c = h < -0.16 ? PALETTE.deep : PALETTE.ocean;
    else if (h < 0.02) c = PALETTE.beach;
    else if (h < 0.06) c = PALETTE.low;
    else if (h < 0.12) c = PALETTE.mid;
    else if (h < 0.2) c = PALETTE.high;
    else c = PALETTE.rock;
    var jit = (hash01(x, y) - 0.5) * 0.05;
    return [c[0] + jit, c[1] + jit, c[2] + jit];
  }

  function Pix3D(container, data, opts) {
    this.container = container;
    opts = opts || {};
    this.data = data || {};
    this._vertMax = 46;
    this._horiz = 280;
    this._autoPitch = opts.autoPitch !== false;
    this._idleTimer = 0;
    this._yaw = opts.yaw != null ? opts.yaw : 0.6;
    this._pitch = opts.pitch != null ? opts.pitch : 1.02;
    this._radius = opts.radius != null ? opts.radius : 400;
    this._targetX = 0;
    this._targetY = 0;
    this._tgtLat = opts.lat != null ? opts.lat : 34.2;
    this._tgtLng = opts.lng != null ? opts.lng : 7.5;
    this._tgtZ = clamp(opts.zoom != null ? opts.zoom : 6, 3, 19);
    this._active = false;
    this._raf = 0;
    this._ptr = {};
    this._moved = false;
    this._initGl(opts.onFail);
  }

  Pix3D.prototype._initGl = function (onFail) {
    var cv = document.createElement('canvas');
    var opts = { antialias: false, alpha: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false };
    var gl = null;
    try {
      gl = cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts) || cv.getContext('webgl2', opts);
    } catch (e) { gl = null; }
    if (!gl) { if (onFail) onFail(); return; }
    var self = this;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    cv.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5';
    cv.id = 'pix3d-canvas';
    this._gl = gl;
    this._cv = cv;
    this._compile();
    this._buildBuffers();
    this._bindPointer();
    this.container.appendChild(cv);
    this._resize();
  };

  Pix3D.prototype._compile = function () {
    var gl = this._gl;
    var vs = 'attribute vec3 aPos;attribute vec4 aColor;uniform mat4 uProj;uniform mat4 uView;varying vec4 vColor;void main(){vColor=aColor;gl_Position=uProj*uView*vec4(aPos,1.0);}';
    var fs = 'precision mediump float;varying vec4 vColor;void main(){gl_FragColor=vColor;}';
    var mk = function (type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    var pvs = mk(gl.VERTEX_SHADER, vs), pfs = mk(gl.FRAGMENT_SHADER, fs);
    this._prog = gl.createProgram();
    gl.attachShader(this._prog, pvs);
    gl.attachShader(this._prog, pfs);
    gl.linkProgram(this._prog);
    this._uProj = gl.getUniformLocation(this._prog, 'uProj');
    this._uView = gl.getUniformLocation(this._prog, 'uView');
    this._aPos = gl.getAttribLocation(this._prog, 'aPos');
    this._aColor = gl.getAttribLocation(this._prog, 'aColor');
    gl.enableVertexAttribArray(this._aPos);
    gl.enableVertexAttribArray(this._aColor);
    this._bufPos = gl.createBuffer();
    this._bufCol = gl.createBuffer();
    this._bufIdx = gl.createBuffer();
  };

  Pix3D.prototype._buildBuffers = function () {
    var hasCountries = this.data.countries && this.data.countries.length;
    this._cache = { countries: null, provinces: null, roads: null, cities: null };
    if (!hasCountries) return;
    var i, c, ring, roads = [], cities = [], prov = [];
    for (i = 0; i < this.data.countries.length; i++) {
      c = this.data.countries[i];
      for (var k = 0; k < c.geo.length; k++) {
        ring = c.geo[k];
        var pts = [];
        for (var j = 0; j < ring.length; j++) {
          var p = project(ring[j][1], ring[j][0]);
          pts.push([p.x, p.y]);
        }
        if (pts.length > 1) roads.push({ c: -1, pts: pts });
      }
    }
    var provs = this.data.provinces || [];
    for (i = 0; i < provs.length; i++) {
      c = provs[i];
      if (!c.geo) continue;
      for (k = 0; k < c.geo.length; k++) {
        ring = c.geo[k];
        var p2 = [];
        for (j = 0; j < ring.length; j++) {
          var q = project(ring[j][1], ring[j][0]);
          p2.push([q.x, q.y]);
        }
        if (p2.length > 1) prov.push({ pts: p2 });
      }
    }
    var rds = this.data.roads || [];
    for (i = 0; i < rds.length; i++) roads.push({ c: rds[i].c, pts: (rds[i].g || []).map(function (g) { var p = project(g[1], g[0]); return [p.x, p.y]; }) });
    var cts = this.data.cities || [];
    for (i = 0; i < cts.length; i++) {
      var ci = cts[i];
      var pp = project(ci.lat, ci.lng);
      cities.push({ x: pp.x, y: pp.y, r: ci.r || 0, n: ci.n });
    }
    this._cache.countries = roads;
    this._cache.provinces = prov;
    this._cache.roads = roads;
    this._cache.cities = cities;
  };

  Pix3D.prototype._geoHeight = function (x, y) {
    return elev(x, y) * this._vertMax;
  };

  var _sun = function (hx, hy, hxx, hyy, lx, ly, lz) {
    var nx = -hx, ny = -hy, nz = 1;
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    var L = Math.max(0, (nx * lx + ny * ly + nz * lz) / l);
    return 0.55 + 0.45 * L;
  };

  Pix3D.prototype._buildTerrain = function (bbox) {
    var cols = 64, rows = 44;
    var x0 = bbox.x0, x1 = bbox.x1, y0 = bbox.y0, y1 = bbox.y1;
    var lx = LIGHT_DIR.x, ly = LIGHT_DIR.y, lz = LIGHT_DIR.z;
    var verts = cols * rows;
    var pos = new Float32Array(verts * 3), col = new Float32Array(verts * 4);
    var grid = [];
    var i, j;
    for (j = 0; j < rows; j++) {
      grid[j] = [];
      for (i = 0; i < cols; i++) {
        var xu = x0 + (x1 - x0) * i / (cols - 1);
        var yu = y0 + (y1 - y0) * j / (rows - 1);
        var h = this._geoHeight(xu, yu);
        grid[j][i] = h;
        var c = terrainColor(h / this._vertMax, Math.floor(xu), Math.floor(yu));
        var idx = (j * cols + i);
        pos[idx * 3] = xu; pos[idx * 3 + 1] = yu; pos[idx * 3 + 2] = h;
        col[idx * 4] = c[0]; col[idx * 4 + 1] = c[1]; col[idx * 4 + 2] = c[2]; col[idx * 4 + 3] = 1;
      }
    }
    // normales par différences finies → éclairage CPU
    var dx = (x1 - x0) / (cols - 1), dy = (y1 - y0) / (rows - 1);
    for (j = 1; j < rows - 1; j++) {
      for (i = 1; i < cols - 1; i++) {
        var hl = grid[j][i - 1], hr = grid[j][i + 1], hu = grid[j - 1][i], hd = grid[j + 1][i];
        var sh = _sun((hr - hl) / (2 * dx), (hd - hu) / (2 * dy), 0, 0, lx, ly, lz);
        var idx2 = (j * cols + i) * 4;
        col[idx2] *= sh; col[idx2 + 1] *= sh; col[idx2 + 2] *= sh;
      }
    }
    var idx = new Uint16Array((cols - 1) * (rows - 1) * 6);
    var n = 0;
    for (j = 0; j < rows - 1; j++) {
      for (i = 0; i < cols - 1; i++) {
        var a = j * cols + i, b = j * cols + i + 1, c2 = (j + 1) * cols + i, d = (j + 1) * cols + i + 1;
        idx[n++] = a; idx[n++] = c2; idx[n++] = b;
        idx[n++] = b; idx[n++] = c2; idx[n++] = d;
      }
    }
    this._segPos = pos; this._segCol = col; this._segIdx = idx;
    this._segCount = idx.length;
  };

  Pix3D.prototype._draw = function () {
    var gl = this._gl;
    gl.clearColor(0.02, 0.07, 0.11, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    var self = this;
    var w = this._w, h = this._h;
    if (w <= 0 || h <= 0) return;
    gl.viewport(0, 0, w * this._dpr, h * this._dpr);

    var t = this._tgtLat, lng = this._tgtLng, z = this._tgtZ;
    var target = project(t, lng);
    target.z = this._geoHeight(target.x, target.y);
    var radius = this._radius * Math.pow(2, (this._tgtZ - 8) * 0.6);
    radius = clamp(radius, 40, 6000);

    var eye = {
      x: target.x + radius * Math.cos(this._pitch) * Math.cos(this._yaw),
      y: target.y + radius * Math.cos(this._pitch) * Math.sin(this._yaw),
      z: target.z + radius * Math.sin(this._pitch)
    };
    var uProj = persp(1.1, w / h, 1, 12000, new Float64Array(16));
    var up = [0, 0, 1];
    var uView = lookAt([eye.x, eye.y, eye.z], [target.x, target.y, target.z], up, new Float64Array(16));

    gl.useProgram(this._prog);
    gl.uniformMatrix4fv(this._uProj, false, uProj);
    gl.uniformMatrix4fv(this._uView, false, uView);

    // terrain (dans la bbox autour de la cible)
    var span = radius * 1.35;
    this._buildTerrain({ x0: target.x - span, x1: target.x + span, y0: target.y - span, y1: target.y + span });
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, this._segPos, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(this._aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bufCol);
    gl.bufferData(gl.ARRAY_BUFFER, this._segCol, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(this._aColor, 4, gl.FLOAT, false, 0, 0);
    var idx = this._segIdx;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._bufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);

    // lignes (frontières pays, provinces, routes) + villes
    this._drawLines(gl, uProj, uView, target);
  };

  Pix3D.prototype._drawLines = function (gl, uProj, uView, target) {
    var self = this;
    var store = { pos: [], col: [] };
    var push = function (x, y, color, width) {
      var h = self._geoHeight(x, y) + 0.9;
      store.pos.push(x, y, h);
      store.col.push(color[0], color[1], color[2], 0.7);
      void width;
    };

    var ft = this._cache;
    var addPath = function (pts, color, step) {
      if (!pts || pts.length < 2) return;
      for (var i = 0; i < pts.length; i += (step || 1)) {
        var p = pts[i];
        push(p[0], p[1], color, 1);
      }
    };

    (ft.provinces || []).forEach(function (p) { addPath(p.pts, PALETTE.province, 2); });
    if (this.data.countries && this.data.countries.length) {
      (ft.countries || []).forEach(function (p) { addPath(p.pts, PALETTE.border, 2); });
    }
    (ft.roads || []).forEach(function (r) {
      if (r.c < 0) return;
      var c = r.c === 0 ? PALETTE.roadM : r.c === 1 ? PALETTE.roadS : PALETTE.roadT;
      addPath(r.pts, c, 1);
    });

    var pos = new Float32Array(store.pos);
    var col = new Float32Array(store.col);
    var count = pos.length / 3;
    gl.lineWidth(2);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(this._aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bufCol);
    gl.bufferData(gl.ARRAY_BUFFER, col, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(this._aColor, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, count);

    // villas → petits points lumineux
    var pts = [];
    var cols = [];
    (ft.cities || []).forEach(function (ci) {
      var h = self._geoHeight(ci.x, ci.y) + 1.5;
      pts.push(ci.x, ci.y, h);
      cols.push(PALETTE.city[0], PALETTE.city[1], PALETTE.city[2], 0.95);
    });
    if (pts.length) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._bufPos);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this._aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._bufCol);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cols), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this._aColor, 4, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(this._aPos);
      gl.enableVertexAttribArray(this._aColor);
      gl.drawArrays(gl.POINTS, 0, pts.length / 3);
    }
  };

  Pix3D.prototype._frame = function () {
    if (!this._active) return;
    var self = this;
    if (!this._moved) {
      this._yaw += 0.0022;
    }
    this._draw();
    this._raf = requestAnimationFrame(function () { self._frame(); });
  };

  // ─── API ───
  Pix3D.prototype.enable = function () {
    if (!this._gl || this._active) return;
    this._active = true;
    this._cv.style.display = 'block';
    this._resize();
    this._moved = false;
    this._frame();
  };

  Pix3D.prototype.disable = function () {
    this._active = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._cv) this._cv.style.display = 'none';
  };

  Pix3D.prototype.destroy = function () {
    this.disable();
    if (this._cv) { try { this._cv.remove(); } catch (e) {} }
    this._gl = null;
    this._cv = null;
  };

  Pix3D.prototype.isActive = function () { return this._active && !!this._gl; };

  Pix3D.prototype.setView = function (lat, lng, zoom) {
    this._tgtLat = lat; this._tgtLng = lng;
    if (zoom != null) { this._tgtZ = clamp(zoom, 3, 19); }
    this._moved = true;
  };

  Pix3D.prototype._resize = function () {
    if (!this._cv) return;
    var r = this.container.getBoundingClientRect();
    this._w = Math.max(1, r.width || 800);
    this._h = Math.max(1, r.height || 600);
    this._dpr = (global.devicePixelRatio || 1);
    this._cv.width = Math.round(this._w * this._dpr);
    this._cv.height = Math.round(this._h * this._dpr);
    this._cv.style.width = this._w + 'px';
    this._cv.style.height = this._h + 'px';
  };

  Pix3D.prototype._bindPointer = function () {
    var self = this;
    var c = this.container;
    this._onDown = function (e) {
      if (!self._active) return;
      self._moved = true;
      self._ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { c.setPointerCapture(e.pointerId); } catch (err) {}
      self._idleTimer = Date.now();
    };
    this._onMove = function (e) {
      if (!self._active) return;
      var pts = self._ptr;
      if (pts[e.pointerId] && Object.keys(pts).length === 1) {
        var dx = e.clientX - pts[e.pointerId].x;
        var dy = e.clientY - pts[e.pointerId].y;
        self._yaw -= dx * 0.006;
        self._pitch = clamp(self._pitch + dy * 0.005, 0.25, 1.45);
        pts[e.pointerId].x = e.clientX;
        pts[e.pointerId].y = e.clientY;
        self._moved = true;
        self._idleTimer = Date.now();
      }
      e.preventDefault && e.preventDefault();
    };
    this._onUp = function (e) { delete self._ptr[e.pointerId]; };
    this._onWheel = function (e) {
      if (!self._active) return;
      e.preventDefault();
      var factor = Math.exp(e.deltaY * 0.0013);
      self._radius *= factor;
      // recalcule zoom approx
      self._tgtZ = clamp(self._tgtZ - Math.log(factor) * 1.6, 3, 16);
      self._moved = true;
      self._idleTimer = Date.now();
    };
    c.addEventListener('pointerdown', this._onDown);
    c.addEventListener('pointermove', this._onMove);
    c.addEventListener('pointerup', this._onUp);
    c.addEventListener('pointercancel', this._onUp);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    if (global.ResizeObserver) {
      this._ro = new global.ResizeObserver(function () { self._resize(); });
      this._ro.observe(c);
    }
  };

  Pix3D.create = function (container, data, opts) {
    var inst = new Pix3D(container, data, opts);
    if (!inst._gl) { try { inst.destroy(); } catch (e) {} return null; }
    return inst;
  };

  global.Pix3D = Pix3D;
})(window);