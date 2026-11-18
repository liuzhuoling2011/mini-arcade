(function () {
  "use strict";
  /* 黑白棋规则：八向夹击翻转、跳过、双方无子终局。AI 与 Canvas 渲染均为自写。参考见 THIRD_PARTY.md */

  var N = 8;
  var EMPTY = 0, BLACK = 1, WHITE = 2;
  var DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  var CORNERS = [0, 7, 56, 63];
  var X_SQUARES = [9, 14, 49, 54];
  var WEIGHTS = [
    120,-20,20,5,5,20,-20,120,
    -20,-40,-5,-5,-5,-5,-40,-20,
    20,-5,15,3,3,15,-5,20,
    5,-5,3,3,3,3,-5,5,
    5,-5,3,3,3,3,-5,5,
    20,-5,15,3,3,15,-5,20,
    -20,-40,-5,-5,-5,-5,-40,-20,
    120,-20,20,5,5,20,-20,120
  ];

  var wrapEl = document.getElementById("boardWrap");
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var statusEl = document.getElementById("status");
  var scoreB = document.getElementById("scoreB");
  var scoreW = document.getElementById("scoreW");
  var setupEl = document.getElementById("setup");
  var endEl = document.getElementById("end");
  var toastEl = document.getElementById("toast");

  var board = [];
  var turn = BLACK;
  var over = false;
  var suspended = false;
  var aiTimer = null, endTimer = null, toastTimer = null, guardTimer = null;
  var settings = { mode: "local", diff: "easy", humanSide: BLACK };
  var animating = false;
  var moveSeq = 0;
  var lastMove = -1;
  var legalSet = {};
  var legalList = [];

  function idx(r, c) { return r * N + c; }
  function inb(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
  function opp(s) { return s === BLACK ? WHITE : BLACK; }
  function name(s) { return s === BLACK ? "黑棋" : "白棋"; }

  function flipsAt(pos, color, b) {
    b = b || board;
    if (b[pos]) return [];
    var r0 = (pos / N) | 0, c0 = pos % N;
    var all = [];
    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1];
      var r = r0 + dr, c = c0 + dc;
      var line = [];
      while (inb(r, c) && b[idx(r, c)] === opp(color)) {
        line.push(idx(r, c));
        r += dr; c += dc;
      }
      if (line.length && inb(r, c) && b[idx(r, c)] === color) {
        for (var i = 0; i < line.length; i++) all.push(line[i]);
      }
    }
    return all;
  }

  function legalMoves(color, b) {
    b = b || board;
    var m = [];
    for (var i = 0; i < 64; i++) if (flipsAt(i, color, b).length) m.push(i);
    return m;
  }

  function count(color) {
    var n = 0;
    for (var i = 0; i < 64; i++) if (board[i] === color) n++;
    return n;
  }

  /* ------------------------------------------------------------------
     Rendering. World units: x right, y down the board (towards the
     player), z up. A disc is a two-layer cylinder; its pose is a lift and
     a rotation about an in-plane axis. Faces, rim and shadow are projected
     analytically every frame, so the silhouette is exact and the light
     never moves with the disc.
     ------------------------------------------------------------------ */

  var TAU = Math.PI * 2;
  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var DISC_R = 0.405;      // radius, in cells
  var DISC_T = 0.104;      // full thickness, in cells (two equal layers)
  var KX = 0, KY = -0.30;  // oblique camera: height moves up the screen
  var PERSP = 0.07;        // apparent growth per radius of lift
  var BEVEL = 0.96;        // tilt of the rounded edge normal (rad)
  var SH_BIAS = 0.16;      // extra cast-shadow reach, in radii
  var PLACE_LIFT = 0.55;   // start height of a new disc, in radii
  var FLIP_LIFT = 1.04;    // clearance during a flip, in radii

  var PLACE_MS = REDUCED ? 90 : 190;
  var FLIP_MS = REDUCED ? 170 : 400;
  var FLIP_DELAY = REDUCED ? 30 : 120;
  var STAGGER = REDUCED ? 25 : 70;

  function norm3(x, y, z) {
    var l = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / l, y / l, z / l];
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var LIGHT = norm3(-0.38, -0.62, 1);
  var VIEW = norm3(-KX, -KY, 1);
  var SHX = -LIGHT[0] / LIGHT[2], SHY = -LIGHT[1] / LIGHT[2];

  var MAT = {};
  MAT[BLACK] = { c: [27, 27, 30], dif: 0.62, refl: 54, sheen: 0.11, ao: 0.78, lift: 0.03, fall: 0.1 };
  MAT[WHITE] = { c: [238, 235, 226], dif: 0.15, refl: 12, sheen: 0.12, ao: 0.72, lift: 0, fall: 0.06 };
  MAT[BLACK].amb = 1 - MAT[BLACK].dif * LIGHT[2];
  MAT[WHITE].amb = 1 - MAT[WHITE].dif * LIGHT[2];

  function shade(n, m, mul) {
    var d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
    if (d < 0) d = 0;
    var k = (m.amb + m.dif * d) * (mul || 1);
    var s = m.refl * Math.pow(d, 12);
    return [m.c[0] * k + s, m.c[1] * k + s, m.c[2] * k + s];
  }
  function byte(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  function rgba(c, a) {
    return "rgba(" + byte(c[0]) + "," + byte(c[1]) + "," + byte(c[2]) + "," + (a == null ? 1 : a) + ")";
  }

  function rotFrame(ux, uy, th) {
    var c = Math.cos(th), s = Math.sin(th), k = 1 - c;
    return {
      e1: [c + ux * ux * k, ux * uy * k, -uy * s],
      e2: [ux * uy * k, c + uy * uy * k, ux * s],
      n: [uy * s, -ux * s, c]
    };
  }

  // Keeps a projected circle invertible when it is seen exactly edge-on.
  function keepArea(v, minDet) {
    var det = v[0] * v[3] - v[1] * v[2];
    if (Math.abs(det) >= minDet) return;
    var al = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    var bl = Math.sqrt(v[2] * v[2] + v[3] * v[3]);
    var sg = det < 0 ? -1 : 1;
    if (al >= bl && al > 1e-9) {
      var k = (sg * minDet - det) / al;
      v[2] += -v[1] / al * k; v[3] += v[0] / al * k;
    } else if (bl > 1e-9) {
      var k2 = (sg * minDet - det) / bl;
      v[0] += v[3] / bl * k2; v[1] += -v[2] / bl * k2;
    }
  }

  function discGeom(p, R, T) {
    var f = rotFrame(p.ux, p.uy, p.th);
    var s = 1 + PERSP * (p.h - T * 0.5) / R;
    var v = [
      s * R * (f.e1[0] + KX * f.e1[2]), s * R * (f.e1[1] + KY * f.e1[2]),
      s * R * (f.e2[0] + KX * f.e2[2]), s * R * (f.e2[1] + KY * f.e2[2])
    ];
    keepArea(v, R * R * s * s * 0.003);
    return {
      f: f,
      Ax: v[0], Ay: v[1], Bx: v[2], By: v[3],
      bx: p.x + KX * p.h, by: p.y + KY * p.h,
      dx: s * T * 0.5 * (f.n[0] + KX * f.n[2]),
      dy: s * T * 0.5 * (f.n[1] + KY * f.n[2])
    };
  }

  // Convex hull of the same projected circle at two centres: the exact
  // outline of a cylinder band under a parallel projection.
  function hullPath(g, G, c1x, c1y, c2x, c2y) {
    var dx = c2x - c1x, dy = c2y - c1y;
    var ph = Math.atan2(G.Bx * dy - G.By * dx, G.Ax * dy - G.Ay * dx);
    var sp = Math.sin(ph), cp = Math.cos(ph);
    if ((-G.Ax * sp + G.Bx * cp) * dx + (-G.Ay * sp + G.By * cp) * dy < 0) ph += Math.PI;
    g.beginPath();
    g.setTransform(G.Ax, G.Ay, G.Bx, G.By, c2x, c2y);
    g.arc(0, 0, 1, ph, ph + Math.PI, false);
    g.setTransform(G.Ax, G.Ay, G.Bx, G.By, c1x, c1y);
    g.arc(0, 0, 1, ph + Math.PI, ph + TAU, false);
    g.closePath();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Rim shading: brightness is constant along each generator line, so a
  // linear gradient across the band (perpendicular to it) is exact.
  function rimFill(g, G, m, mul) {
    var f = G.f;
    var pv = Math.atan2(dot3(f.e2, VIEW), dot3(f.e1, VIEW));
    var a0 = pv - Math.PI / 2;
    var c0 = Math.cos(a0), s0 = Math.sin(a0);
    var p1x = G.bx + G.Ax * c0 + G.Bx * s0, p1y = G.by + G.Ay * c0 + G.By * s0;
    var p2x = 2 * G.bx - p1x, p2y = 2 * G.by - p1y;
    var wx = p2x - p1x, wy = p2y - p1y;
    var dl = Math.sqrt(G.dx * G.dx + G.dy * G.dy);
    if (dl > 1e-3) {
      var nx = -G.dy / dl, ny = G.dx / dl;
      var pr = wx * nx + wy * ny;
      wx = nx * pr; wy = ny * pr;
    }
    var wl = wx * wx + wy * wy || 1;
    var gr = g.createLinearGradient(p1x, p1y, p1x + wx, p1y + wy);
    var last = 0;
    for (var k = 0; k <= 6; k++) {
      var a = a0 + Math.PI * k / 6, ca = Math.cos(a), sa = Math.sin(a);
      var mm = [f.e1[0] * ca + f.e2[0] * sa, f.e1[1] * ca + f.e2[1] * sa, f.e1[2] * ca + f.e2[2] * sa];
      var qx = G.Ax * ca + G.Bx * sa + G.bx - p1x, qy = G.Ay * ca + G.By * sa + G.by - p1y;
      var t = clamp((qx * wx + qy * wy) / wl, 0, 1);
      if (t < last) t = last;
      last = t;
      gr.addColorStop(t, rgba(shade(mm, m, mul)));
    }
    return gr;
  }

  function drawFace(g, G, cx, cy, nf, m) {
    var f = G.f;
    var lx = dot3(LIGHT, f.e1), ly = dot3(LIGHT, f.e2), ll = Math.sqrt(lx * lx + ly * ly);
    var hx = ll > 1e-4 ? lx / ll : -0.52, hy = ll > 1e-4 ? ly / ll : -0.85;
    var mh = [f.e1[0] * hx + f.e2[0] * hy, f.e1[1] * hx + f.e2[1] * hy, f.e1[2] * hx + f.e2[2] * hy];
    var cb = Math.cos(BEVEL), sb = Math.sin(BEVEL);
    var lit = norm3(nf[0] * cb + mh[0] * sb, nf[1] * cb + mh[1] * sb, nf[2] * cb + mh[2] * sb);
    var dim = norm3(nf[0] * cb - mh[0] * sb, nf[1] * cb - mh[1] * sb, nf[2] * cb - mh[2] * sb);
    var base = shade(nf, m);

    g.setTransform(G.Ax, G.Ay, G.Bx, G.By, cx, cy);
    g.beginPath();
    g.arc(0, 0, 1, 0, TAU);
    var bevel = g.createLinearGradient(-hx, -hy, hx, hy);
    bevel.addColorStop(0, rgba(shade(dim, m)));
    bevel.addColorStop(0.5, rgba(base));
    bevel.addColorStop(1, rgba(shade(lit, m)));
    g.fillStyle = bevel;
    g.fill();

    var top = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    top.addColorStop(0, rgba(base));
    top.addColorStop(0.8, rgba(base));
    top.addColorStop(0.93, rgba(base, 0));
    g.fillStyle = top;
    g.fill();

    var satin = g.createLinearGradient(hx, hy, -hx, -hy);
    satin.addColorStop(0, "rgba(255,255,255," + m.lift + ")");
    satin.addColorStop(0.45, "rgba(255,255,255,0)");
    satin.addColorStop(1, "rgba(0,0,0," + m.fall + ")");
    g.fillStyle = satin;
    g.fill();

    var facing = Math.max(0, dot3(nf, LIGHT)) / LIGHT[2];
    var sa = m.sheen * facing * facing * facing;
    if (sa > 0.004) {
      var sh = g.createRadialGradient(hx * 0.42, hy * 0.42, 0, hx * 0.42, hy * 0.42, 0.95);
      sh.addColorStop(0, "rgba(255,255,255," + sa.toFixed(3) + ")");
      sh.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = sh;
      g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawDisc(g, p, R, T) {
    var G = discGeom(p, R, T), f = G.f;
    var topVis = dot3(f.n, VIEW) >= 0;
    var under = p.top === BLACK ? WHITE : BLACK;
    var vis = topVis ? p.top : under, hid = topVis ? under : p.top;
    var sg = topVis ? 1 : -1;
    var vx = G.bx + sg * G.dx, vy = G.by + sg * G.dy;
    var hx = G.bx - sg * G.dx, hy = G.by - sg * G.dy;
    var nf = topVis ? f.n : [-f.n[0], -f.n[1], -f.n[2]];
    // the layer nearest the felt sits in its contact shadow
    var near = clamp((p.h - T * 0.5) / (R * 0.35), 0, 1);
    if (p.a != null && p.a < 1) g.globalAlpha = p.a;
    hullPath(g, G, hx, hy, G.bx, G.by);
    g.fillStyle = rimFill(g, G, MAT[hid], MAT[hid].ao + (1 - MAT[hid].ao) * near);
    g.fill();
    hullPath(g, G, G.bx, G.by, vx, vy);
    g.fillStyle = rimFill(g, G, MAT[vis]);
    g.fill();
    drawFace(g, G, vx, vy, nf, MAT[vis]);
    g.globalAlpha = 1;
  }

  function drawShadow(g, p, R, T) {
    var f = rotFrame(p.ux, p.uy, p.th);
    var lift = clamp((p.h - T * 0.5) / R, 0, 1.6);
    var am = p.a == null ? 1 : p.a;
    var v = [
      R * (f.e1[0] + SHX * f.e1[2]), R * (f.e1[1] + SHY * f.e1[2]),
      R * (f.e2[0] + SHX * f.e2[2]), R * (f.e2[1] + SHY * f.e2[2])
    ];
    keepArea(v, R * T * 0.6);
    var rg;
    var ao = 0.5 * clamp(1 - lift / 0.22, 0, 1) * am;
    if (ao > 0.004) {
      var k = 1.045;
      g.setTransform(v[0] * k, v[1] * k, v[2] * k, v[3] * k, p.x + SHX * T * 0.2, p.y + SHY * T * 0.2);
      rg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      rg.addColorStop(0, "rgba(0,0,0," + ao.toFixed(3) + ")");
      rg.addColorStop(0.87, "rgba(0,0,0," + ao.toFixed(3) + ")");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg;
      g.beginPath();
      g.arc(0, 0, 1, 0, TAU);
      g.fill();
    }
    var hh = p.h + SH_BIAS * R;
    var spread = 1.05 + 0.3 * lift;
    var inner = clamp(0.6 - 0.4 * lift, 0.12, 0.6);
    var ca = (0.34 - 0.13 * Math.min(lift, 1)) * am;
    g.setTransform(v[0] * spread, v[1] * spread, v[2] * spread, v[3] * spread, p.x + SHX * hh, p.y + SHY * hh);
    rg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    rg.addColorStop(0, "rgba(0,0,0," + ca.toFixed(3) + ")");
    rg.addColorStop(inner, "rgba(0,0,0," + ca.toFixed(3) + ")");
    rg.addColorStop((inner + 1) / 2, "rgba(0,0,0," + (ca * 0.4).toFixed(3) + ")");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.beginPath();
    g.arc(0, 0, 1, 0, TAU);
    g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  function restPose(x, y, color, T) {
    return { x: x, y: y, h: T * 0.5, ux: 1, uy: 0, th: 0, top: color, a: 1 };
  }

  /* ---------------- board surface (cached per size) ---------------- */

  var geo = { css: 0, dev: 0, scale: 1, cell: 0, ox: 0, rad: 0 };
  var boardCv = null;
  var sprites = null;

  function makeCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6d2b79f5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function grain(g, horiz, x0, y0, len, depth, rnd, sc) {
    var n = Math.max(8, Math.round(depth / (1.5 * sc)));
    for (var i = 0; i < n; i++) {
      var off = (i + rnd()) / n * depth;
      var amp = (0.3 + rnd() * 1.6) * sc;
      var wl = len * (0.18 + rnd() * 0.5);
      var ph = rnd() * TAU, ph2 = rnd() * TAU;
      var light = rnd() < 0.4;
      g.strokeStyle = light
        ? "rgba(255,222,176," + (0.02 + rnd() * 0.045).toFixed(3) + ")"
        : "rgba(12,6,2," + (0.05 + rnd() * 0.12).toFixed(3) + ")";
      g.lineWidth = (0.45 + rnd() * 1.3) * sc;
      g.beginPath();
      for (var s = 0; s <= 32; s++) {
        var t = s / 32 * len;
        var d = off + Math.sin(t / wl * TAU + ph) * amp + Math.sin(t / wl * 2.3 * TAU + ph2) * amp * 0.3;
        var x = horiz ? x0 + t : x0 + d, y = horiz ? y0 + d : y0 + t;
        if (s) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
  }

  function feltNoise(sc) {
    var cell = Math.max(1, Math.round(sc / 1.4));
    var n = 72;
    var tile = makeCanvas(n * cell, n * cell);
    var g = tile.getContext("2d");
    var rnd = mulberry(91);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var v = rnd();
        if (v < 0.5) g.fillStyle = "rgba(0,0,0," + ((0.5 - v) * 0.13).toFixed(3) + ")";
        else g.fillStyle = "rgba(255,255,255," + ((v - 0.5) * 0.07).toFixed(3) + ")";
        g.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    return tile;
  }

  function buildBoard() {
    var S = geo.dev, F = geo.ox, C = geo.cell, sc = geo.scale, W = C * 8;
    var cv = makeCanvas(S, S), g = cv.getContext("2d");
    var rnd = mulberry(20241118);

    g.save();
    roundRect(g, 0, 0, S, S, geo.rad);
    g.clip();
    var wood = g.createLinearGradient(0, 0, S, S);
    wood.addColorStop(0, "#4b3321");
    wood.addColorStop(0.5, "#3b2819");
    wood.addColorStop(1, "#2b1c11");
    g.fillStyle = wood;
    g.fillRect(0, 0, S, S);

    var E = F + W;
    var rails = [
      { p: [[0, 0], [S, 0], [E, F], [F, F]], h: true, x: 0, y: 0, len: S, depth: F },
      { p: [[0, S], [S, S], [E, E], [F, E]], h: true, x: 0, y: E, len: S, depth: S - E },
      { p: [[0, 0], [F, F], [F, E], [0, S]], h: false, x: 0, y: 0, len: S, depth: F },
      { p: [[S, 0], [E, F], [E, E], [S, S]], h: false, x: E, y: 0, len: S, depth: S - E }
    ];
    for (var i = 0; i < rails.length; i++) {
      var rl = rails[i];
      g.save();
      g.beginPath();
      g.moveTo(rl.p[0][0], rl.p[0][1]);
      for (var j = 1; j < 4; j++) g.lineTo(rl.p[j][0], rl.p[j][1]);
      g.closePath();
      g.clip();
      g.fillStyle = i % 2 ? "rgba(0,0,0,0.05)" : "rgba(255,230,190,0.02)";
      g.fillRect(0, 0, S, S);
      grain(g, rl.h, rl.x, rl.y, rl.len, rl.depth, rnd, sc);
      g.restore();
    }
    g.strokeStyle = "rgba(10,5,2,0.42)";
    g.lineWidth = Math.max(1, sc * 0.75);
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(F, F);
    g.moveTo(S, 0); g.lineTo(E, F);
    g.moveTo(0, S); g.lineTo(F, E);
    g.moveTo(S, S); g.lineTo(E, E);
    g.stroke();
    g.restore();

    // outer edge: lit along the top/left, falling off to the bottom/right
    g.save();
    roundRect(g, sc * 0.5, sc * 0.5, S - sc, S - sc, Math.max(0, geo.rad - sc * 0.5));
    var edge = g.createLinearGradient(0, 0, S, S);
    edge.addColorStop(0, "rgba(255,228,190,0.26)");
    edge.addColorStop(0.5, "rgba(255,228,190,0.06)");
    edge.addColorStop(1, "rgba(0,0,0,0.35)");
    g.strokeStyle = edge;
    g.lineWidth = Math.max(1, sc);
    g.stroke();
    g.restore();

    // playing surface
    var felt = g.createRadialGradient(F + W * 0.34, F + W * 0.24, W * 0.04, F + W * 0.5, F + W * 0.5, W * 0.8);
    felt.addColorStop(0, "#277650");
    felt.addColorStop(0.55, "#1f6545");
    felt.addColorStop(1, "#175037");
    g.fillStyle = felt;
    g.fillRect(F, F, W, W);
    g.fillStyle = g.createPattern(feltNoise(sc), "repeat");
    g.fillRect(F, F, W, W);

    // the frame lip shades the felt on the lit side's opposite walls
    var lip = Math.max(2, C * 0.18);
    var gt = g.createLinearGradient(0, F, 0, F + lip);
    gt.addColorStop(0, "rgba(0,0,0,0.36)");
    gt.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gt;
    g.fillRect(F, F, W, lip);
    var gl = g.createLinearGradient(F, 0, F + lip * 0.75, 0);
    gl.addColorStop(0, "rgba(0,0,0,0.3)");
    gl.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gl;
    g.fillRect(F, F, lip * 0.75, W);
    var gb = g.createLinearGradient(0, E, 0, E - lip * 0.45);
    gb.addColorStop(0, "rgba(0,0,0,0.16)");
    gb.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gb;
    g.fillRect(F, E - lip * 0.45, W, lip * 0.45);
    var gr = g.createLinearGradient(E, 0, E - lip * 0.45, 0);
    gr.addColorStop(0, "rgba(0,0,0,0.14)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(E - lip * 0.45, F, lip * 0.45, W);

    // grid
    var lw = Math.max(1, Math.round(sc * 1.1));
    g.fillStyle = "rgba(5,26,16,0.78)";
    for (var k = 0; k <= 8; k++) {
      var at = clamp(F + k * C - (lw >> 1), F, E - lw);
      g.fillRect(at, F, lw, W);
      g.fillRect(F, at, W, lw);
    }
    var dotR = Math.max(1.6 * sc, C * 0.052);
    g.fillStyle = "rgba(5,26,16,0.86)";
    [[2, 2], [2, 6], [6, 2], [6, 6]].forEach(function (q) {
      g.beginPath();
      g.arc(F + q[0] * C, F + q[1] * C, dotR, 0, TAU);
      g.fill();
    });

    // inner walls of the frame: shaded at top/left, catching light at bottom/right
    var wall = Math.max(1, Math.round(sc));
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.fillRect(F - wall, F - wall, W + wall, wall);
    g.fillRect(F - wall, F - wall, wall, W + wall);
    g.fillStyle = "rgba(255,226,182,0.16)";
    g.fillRect(F - wall, E, W + wall * 2, wall);
    g.fillRect(E, F - wall, wall, W + wall * 2);

    // engraved coordinates
    var fs = F * 0.46;
    if (fs >= 7.5 * sc) {
      g.font = "600 " + fs.toFixed(1) + "px -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      var letters = "abcdefgh";
      for (var q = 0; q < 8; q++) {
        var mid = F + (q + 0.5) * C;
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.fillText(letters[q], mid, F * 0.5 + sc);
        g.fillText(String(q + 1), F * 0.5, mid + sc);
        g.fillStyle = "rgba(228,204,160,0.62)";
        g.fillText(letters[q], mid, F * 0.5);
        g.fillText(String(q + 1), F * 0.5, mid);
      }
    }
    boardCv = cv;
  }

  function buildSprites() {
    var C = geo.cell, R = DISC_R * C, T = DISC_T * C;
    var W = Math.ceil(C * 1.5);
    if (W % 2) W++;
    var c0 = W / 2 + (C % 2) * 0.5;
    function paint(fn) {
      var cv = makeCanvas(W, W);
      fn(cv.getContext("2d"));
      return cv;
    }
    sprites = {
      W: W,
      shadow: paint(function (g) { drawShadow(g, restPose(c0, c0, BLACK, T), R, T); }),
      disc: {}
    };
    sprites.disc[BLACK] = paint(function (g) { drawDisc(g, restPose(c0, c0, BLACK, T), R, T); });
    sprites.disc[WHITE] = paint(function (g) { drawDisc(g, restPose(c0, c0, WHITE, T), R, T); });
  }

  function renderPips() {
    var pips = document.querySelectorAll("canvas.pip");
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    for (var i = 0; i < pips.length; i++) {
      var pip = pips[i];
      var size = pip.clientWidth || 24;
      var dev = Math.round(size * dpr);
      if (pip.width !== dev) { pip.width = dev; pip.height = dev; }
      var g = pip.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, dev, dev);
      var R = dev * 0.4, T = R * DISC_T / DISC_R;
      var color = +pip.getAttribute("data-color");
      var pose = restPose(dev * 0.48, dev * 0.49, color, T);
      drawShadow(g, pose, R, T);
      drawDisc(g, pose, R, T);
    }
  }

  function layout() {
    var w = wrapEl.clientWidth, h = wrapEl.clientHeight;
    if (!w || !h) return;
    var dpr = window.devicePixelRatio || 1;
    var css = Math.max(160, Math.floor(Math.min(w, h)));
    var dev = Math.round(css * dpr);
    if (dev > 2600) dev = 2600;
    var scale = dev / css;
    var frame = Math.round(clamp(css * 0.05, 12, 46) * scale);
    var cell = Math.floor((dev - frame * 2) / 8);
    var ox = Math.floor((dev - cell * 8) / 2);
    var changed = dev !== geo.dev || cell !== geo.cell || ox !== geo.ox;
    geo = { css: css, dev: dev, scale: scale, cell: cell, ox: ox, rad: Math.round(ox * 0.5) };
    if (canvas.width !== dev) { canvas.width = dev; canvas.height = dev; }
    var size = dev / scale;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    canvas.style.borderRadius = (geo.rad / scale).toFixed(2) + "px";
    var left = Math.round((w - size) / 2), top = Math.round((h - size) / 2);
    canvas.style.left = left + "px";
    canvas.style.top = top + "px";
    // land on whole device pixels so the bitmap is never resampled
    var rect = canvas.getBoundingClientRect();
    var fx = rect.left * dpr - Math.round(rect.left * dpr);
    var fy = rect.top * dpr - Math.round(rect.top * dpr);
    if (Math.abs(fx) > 0.01 || Math.abs(fy) > 0.01) {
      canvas.style.left = (left - fx / dpr) + "px";
      canvas.style.top = (top - fy / dpr) + "px";
    }
    if (changed || !boardCv) {
      buildBoard();
      buildSprites();
    }
    renderPips();
    drawNow();
  }

  /* ---------------- animation state ---------------- */

  var anims = {};
  var rafId = 0;
  var hover = -1, pressed = -1, kbCell = -1, kbOn = false;
  var hintT0 = 0;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function cellCenter(p) {
    var r = (p / N) | 0, c = p % N;
    return [geo.ox + (c + 0.5) * geo.cell, geo.ox + (r + 0.5) * geo.cell];
  }

  function animPose(p, a, t) {
    var C = geo.cell, R = DISC_R * C, T = DISC_T * C;
    var xy = cellCenter(p);
    var k = clamp((t - a.start) / a.dur, 0, 1);
    if (a.kind === "place") {
      var fall = k * k;
      return {
        x: xy[0], y: xy[1], h: T * 0.5 + PLACE_LIFT * R * (1 - fall) * (REDUCED ? 0.4 : 1),
        ux: 1, uy: 0, th: 0, top: a.to, a: 0.55 + 0.45 * clamp(k / 0.3, 0, 1)
      };
    }
    var th = Math.PI * easeInOutCubic(k);
    return {
      x: xy[0], y: xy[1], h: T * 0.5 + FLIP_LIFT * R * Math.sin(th),
      ux: a.ux, uy: a.uy, th: th, top: a.from, a: 1
    };
  }

  function humanTurn() {
    return settings.mode !== "ai" || turn === settings.humanSide;
  }

  function canHumanPlay() {
    if (over || suspended || animating) return false;
    if (!setupEl.hidden || !endEl.hidden) return false;
    return humanTurn();
  }

  function requestDraw() {
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  function drawNow() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    frame(performance.now());
  }

  function frame(now) {
    rafId = 0;
    if (!geo.dev || !boardCv) return;
    var t = performance.now();
    if (now && now > t) t = now;
    var g = ctx;
    var C = geo.cell, R = DISC_R * C, T = DISC_T * C, W2 = sprites.W / 2;
    var more = false;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.clearRect(0, 0, geo.dev, geo.dev);
    g.drawImage(boardCv, 0, 0);

    var showHints = canHumanPlay();
    var focus = showHints ? (pressed >= 0 ? pressed : kbOn ? kbCell : hover) : -1;
    if (focus >= 0 && !legalSet[focus]) focus = -1;
    var lw = Math.max(1, Math.round(geo.scale * 1.1));
    if (showHints) {
      var ha = clamp((t - hintT0) / 220, 0, 1);
      if (ha < 1) more = true;
      var hr = C * 0.085;
      g.fillStyle = turn === BLACK ? "rgba(6,12,9," + (0.42 * ha).toFixed(3) + ")" : "rgba(246,243,234," + (0.5 * ha).toFixed(3) + ")";
      for (var i = 0; i < legalList.length; i++) {
        var lp = legalList[i];
        if (lp === focus) continue;
        var lc = cellCenter(lp);
        g.beginPath();
        g.arc(lc[0], lc[1], hr, 0, TAU);
        g.fill();
      }
      if (focus >= 0) {
        var fr = (focus / N) | 0, fc = focus % N;
        g.fillStyle = pressed >= 0 ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.07)";
        g.fillRect(geo.ox + fc * C + lw, geo.ox + fr * C + lw, C - lw, C - lw);
        var fcxy = cellCenter(focus);
        g.globalAlpha = pressed >= 0 ? 0.62 : 0.48;
        g.drawImage(sprites.disc[turn], Math.floor(fcxy[0]) - W2, Math.floor(fcxy[1]) - W2);
        g.globalAlpha = 1;
      }
    }

    var active = [];
    var resting = [];
    for (var p = 0; p < 64; p++) {
      var a = anims[p];
      var color = board[p];
      if (a) {
        if (t >= a.start + a.dur) { delete anims[p]; a = null; }
        else if (t < a.start) { more = true; if (a.kind === "flip") color = a.from; else color = 0; a = null; }
        else { more = true; active.push(animPose(p, a, t)); continue; }
      }
      if (color) resting.push(p, color);
    }
    for (var s = 0; s < resting.length; s += 2) {
      var sxy = cellCenter(resting[s]);
      g.drawImage(sprites.shadow, Math.floor(sxy[0]) - W2, Math.floor(sxy[1]) - W2);
    }
    for (var d = 0; d < resting.length; d += 2) {
      var dxy = cellCenter(resting[d]);
      g.drawImage(sprites.disc[resting[d + 1]], Math.floor(dxy[0]) - W2, Math.floor(dxy[1]) - W2);
    }
    if (lastMove >= 0 && board[lastMove] && !anims[lastMove]) {
      var mxy = cellCenter(lastMove);
      g.fillStyle = "rgba(214,72,54,0.92)";
      g.beginPath();
      g.arc(mxy[0] + KX * T, mxy[1] + KY * T, Math.max(2 * geo.scale, C * 0.058), 0, TAU);
      g.fill();
    }
    active.sort(function (x, y) { return x.h - y.h; });
    for (var q = 0; q < active.length; q++) {
      drawShadow(g, active[q], R, T);
      drawDisc(g, active[q], R, T);
    }

    if (kbOn && kbCell >= 0 && showHints) {
      var kr = (kbCell / N) | 0, kc = kbCell % N;
      g.strokeStyle = "rgba(232,204,150,0.9)";
      g.lineWidth = Math.max(2, Math.round(geo.scale * 2));
      var inset = lw + g.lineWidth / 2 + geo.scale;
      g.strokeRect(geo.ox + kc * C + inset, geo.ox + kr * C + inset, C - inset * 2 + lw, C - inset * 2 + lw);
    }

    if (more) requestDraw();
    else if (animating) settleMove();
  }

  /* ---------------- game flow ---------------- */

  function refreshLegal() {
    legalSet = {};
    legalList = over ? [] : legalMoves(turn);
    for (var i = 0; i < legalList.length; i++) legalSet[legalList[i]] = 1;
    hintT0 = performance.now();
  }

  function syncScores() {
    scoreB.querySelector("strong").textContent = count(BLACK);
    scoreW.querySelector("strong").textContent = count(WHITE);
    scoreB.classList.toggle("active", !over && turn === BLACK);
    scoreW.classList.toggle("active", !over && turn === WHITE);
  }

  function refresh() {
    refreshLegal();
    syncScores();
    updateCursor();
    requestDraw();
  }

  function pulseStatus() {
    statusEl.classList.remove("pulse");
    void statusEl.offsetWidth;
    statusEl.classList.add("pulse");
  }

  function updateStatus(extra) {
    if (over) return;
    var t = name(turn) + "行棋";
    if (settings.mode === "ai") t += turn === settings.humanSide ? "（你）" : "（电脑）";
    t += " · 可落 " + legalMoves(turn).length + " 处";
    if (extra) t += " · " + extra;
    statusEl.textContent = t;
    pulseStatus();
  }

  function toast(msg) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.remove("show");
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
      toastTimer = setTimeout(function () { toastEl.hidden = true; }, 260);
    }, 1500);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.classList.remove("show");
    toastEl.hidden = true;
  }

  function reset() {
    board = new Array(64).fill(EMPTY);
    board[idx(3, 3)] = WHITE; board[idx(3, 4)] = BLACK;
    board[idx(4, 3)] = BLACK; board[idx(4, 4)] = WHITE;
    turn = BLACK; over = false; animating = false;
    anims = {}; lastMove = -1;
    hover = -1; pressed = -1; kbCell = -1;
    clearTimeout(guardTimer);
    clearTimeout(endTimer);
    hideToast();
    refresh();
    updateStatus();
  }

  function finish(title, msg, now) {
    over = true;
    clearTimeout(aiTimer);
    refresh();
    statusEl.textContent = title;
    document.getElementById("endTitle").textContent = title;
    document.getElementById("endMsg").textContent = msg;
    clearTimeout(endTimer);
    endTimer = setTimeout(function () { endEl.hidden = false; }, now ? 0 : 700);
  }

  function endCheck() {
    var cb = count(BLACK), cw = count(WHITE);
    var title, msg;
    if (cb > cw) { title = "黑棋获胜"; msg = "黑 " + cb + " : 白 " + cw; }
    else if (cw > cb) { title = "白棋获胜"; msg = "黑 " + cb + " : 白 " + cw; }
    else { title = "和棋"; msg = "双方各 " + cb + " 子"; }
    finish(title, msg);
  }

  function afterMove() {
    var next = opp(turn);
    if (legalMoves(next).length) {
      turn = next;
    } else if (legalMoves(turn).length) {
      refresh();
      updateStatus(name(next) + "无子可下，跳过");
      toast(name(next) + "无子可下，跳过");
      scheduleAI();
      return;
    } else {
      endCheck();
      return;
    }
    refresh();
    updateStatus();
    scheduleAI();
  }

  function settleMove() {
    if (!animating) return;
    animating = false;
    anims = {};
    clearTimeout(guardTimer);
    afterMove();
  }

  function play(pos) {
    if (over || suspended || animating) return;
    var color = turn;
    var flips = flipsAt(pos, color);
    if (!flips.length) return;

    var t0 = performance.now();
    var r0 = (pos / N) | 0, c0 = pos % N;
    anims = {};
    board[pos] = color;
    anims[pos] = { kind: "place", to: color, start: t0, dur: PLACE_MS };
    var end = PLACE_MS;
    for (var i = 0; i < flips.length; i++) {
      var fp = flips[i];
      var dr = ((fp / N) | 0) - r0, dc = (fp % N) - c0;
      var dist = Math.max(Math.abs(dr), Math.abs(dc));
      var rx = dc / dist, ry = dr / dist, rl = Math.sqrt(rx * rx + ry * ry);
      var delay = FLIP_DELAY + (dist - 1) * STAGGER;
      // rotate about the in-plane axis across the capture line, so the edge
      // nearest the new disc rises first and the wave rolls outwards
      anims[fp] = { kind: "flip", from: board[fp], to: color, start: t0 + delay, dur: FLIP_MS, ux: -ry / rl, uy: rx / rl };
      board[fp] = color;
      end = Math.max(end, delay + FLIP_MS);
    }
    lastMove = pos;
    animating = true;
    hover = -1; pressed = -1;
    moveSeq++;
    legalSet = {}; legalList = [];
    syncScores();
    updateCursor();
    clearTimeout(guardTimer);
    var seq = moveSeq;
    guardTimer = setTimeout(function () {
      if (animating && seq === moveSeq) settleMove();
    }, end + 600);
    requestDraw();
  }

  /* ---------------- AI (unchanged rules and strength) ---------------- */

  function evalBoard(b, color) {
    var s = 0;
    var my = 0, op = 0;
    for (var i = 0; i < 64; i++) {
      if (b[i] === color) { s += WEIGHTS[i]; my++; }
      else if (b[i] === opp(color)) { s -= WEIGHTS[i]; op++; }
    }
    var mob = legalMoves(color, b).length - legalMoves(opp(color), b).length;
    s += mob * 8;
    if (my + op > 50) s += (my - op) * 6;
    return s;
  }

  function cloneBoard() { return board.slice(); }

  function pickEasy(color) {
    var moves = legalMoves(color);
    if (Math.random() < 0.25) {
      for (var i = 0; i < CORNERS.length; i++) {
        if (moves.indexOf(CORNERS[i]) >= 0) return CORNERS[i];
      }
    }
    return moves[(Math.random() * moves.length) | 0];
  }

  function pickNormal(color) {
    var moves = legalMoves(color);
    var best = moves[0], bestS = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var b = cloneBoard();
      var flips = flipsAt(m, color, b);
      b[m] = color;
      for (var j = 0; j < flips.length; j++) b[flips[j]] = color;
      var s = evalBoard(b, color);
      if (CORNERS.indexOf(m) >= 0) s += 80;
      if (X_SQUARES.indexOf(m) >= 0) s -= 40;
      if (s > bestS) { bestS = s; best = m; }
    }
    return best;
  }

  function minimax(b, depth, alpha, beta, maximizing, aiColor) {
    var color = maximizing ? aiColor : opp(aiColor);
    var moves = legalMoves(color, b);
    if (!moves.length) {
      var other = legalMoves(opp(color), b);
      if (!other.length || depth === 0) return evalBoard(b, aiColor);
      return minimax(b, depth - 1, alpha, beta, !maximizing, aiColor);
    }
    if (depth === 0) return evalBoard(b, aiColor);
    if (maximizing) {
      var maxE = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        var nb = b.slice();
        var flips = flipsAt(moves[i], color, nb);
        nb[moves[i]] = color;
        for (var j = 0; j < flips.length; j++) nb[flips[j]] = color;
        var v = minimax(nb, depth - 1, alpha, beta, false, aiColor);
        if (v > maxE) maxE = v;
        if (v > alpha) alpha = v;
        if (beta <= alpha) break;
      }
      return maxE;
    } else {
      var minE = Infinity;
      for (var k = 0; k < moves.length; k++) {
        var nb2 = b.slice();
        var flips2 = flipsAt(moves[k], color, nb2);
        nb2[moves[k]] = color;
        for (var t = 0; t < flips2.length; t++) nb2[flips2[t]] = color;
        var v2 = minimax(nb2, depth - 1, alpha, beta, true, aiColor);
        if (v2 < minE) minE = v2;
        if (v2 < beta) beta = v2;
        if (beta <= alpha) break;
      }
      return minE;
    }
  }

  function pickHard(color) {
    var moves = legalMoves(color);
    var empties = 0;
    for (var i = 0; i < 64; i++) if (!board[i]) empties++;
    var depth = empties <= 10 ? 5 : 3;
    var best = moves[0], bestV = -Infinity;
    for (var m = 0; m < moves.length; m++) {
      var nb = board.slice();
      var flips = flipsAt(moves[m], color, nb);
      nb[moves[m]] = color;
      for (var j = 0; j < flips.length; j++) nb[flips[j]] = color;
      var v = minimax(nb, depth - 1, -Infinity, Infinity, false, color);
      if (CORNERS.indexOf(moves[m]) >= 0) v += 50;
      if (v > bestV) { bestV = v; best = moves[m]; }
    }
    return best;
  }

  function aiPick(color) {
    if (settings.diff === "easy") return pickEasy(color);
    if (settings.diff === "normal") return pickNormal(color);
    return pickHard(color);
  }

  function scheduleAI() {
    clearTimeout(aiTimer);
    if (over || suspended || settings.mode !== "ai") return;
    if (turn !== settings.humanSide) {
      statusEl.textContent = "电脑思考中…";
      var delay = settings.diff === "hard" ? 320 : 160;
      aiTimer = setTimeout(function () {
        if (over || suspended || animating) return;
        var moves = legalMoves(turn);
        if (!moves.length) { afterMove(); return; }
        play(aiPick(turn));
      }, delay);
    }
  }

  /* ---------------- input ---------------- */

  function cellAt(ev) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return -1;
    var x = (ev.clientX - rect.left) * (geo.dev / rect.width);
    var y = (ev.clientY - rect.top) * (geo.dev / rect.height);
    var c = Math.floor((x - geo.ox) / geo.cell), r = Math.floor((y - geo.ox) / geo.cell);
    if (r < 0 || r >= N || c < 0 || c >= N) return -1;
    return r * N + c;
  }

  function updateCursor() {
    canvas.style.cursor = canHumanPlay() && hover >= 0 && legalSet[hover] ? "pointer" : "default";
  }

  function setHover(p) {
    if (p === hover) return;
    hover = p;
    updateCursor();
    requestDraw();
  }

  // A press anywhere on a legal square arms it; sliding onto another legal
  // square re-arms that one; releasing plays the armed square.
  var dragging = false;
  function legalAt(ev) {
    var p = cellAt(ev);
    return p >= 0 && legalSet[p] ? p : -1;
  }
  canvas.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ev.preventDefault();
    kbOn = false;
    if (!canHumanPlay()) return;
    dragging = true;
    pressed = legalAt(ev);
    try { canvas.setPointerCapture(ev.pointerId); } catch (err) {}
    requestDraw();
  });
  canvas.addEventListener("pointermove", function (ev) {
    if (!canHumanPlay()) {
      if (hover >= 0 || pressed >= 0) { hover = -1; pressed = -1; updateCursor(); requestDraw(); }
      return;
    }
    var lp = legalAt(ev);
    if (dragging && lp !== pressed) { pressed = lp; requestDraw(); }
    if (ev.pointerType === "mouse") setHover(lp);
  });
  canvas.addEventListener("pointerup", function () {
    var p = pressed;
    dragging = false;
    pressed = -1;
    if (p >= 0 && canHumanPlay() && legalSet[p]) play(p);
    else requestDraw();
  });
  canvas.addEventListener("pointercancel", function () { dragging = false; pressed = -1; requestDraw(); });
  canvas.addEventListener("pointerleave", function (ev) {
    if (ev.pointerType === "mouse") setHover(-1);
  });
  canvas.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });

  window.addEventListener("keydown", function (ev) {
    if (!setupEl.hidden || !endEl.hidden) return;
    var k = ev.key, dr = 0, dc = 0;
    if (k === "ArrowUp") dr = -1;
    else if (k === "ArrowDown") dr = 1;
    else if (k === "ArrowLeft") dc = -1;
    else if (k === "ArrowRight") dc = 1;
    else if (k === "Enter" || k === " " || ev.code === "Space") {
      if (kbOn && kbCell >= 0 && canHumanPlay() && legalSet[kbCell]) {
        ev.preventDefault();
        play(kbCell);
      }
      return;
    } else return;
    ev.preventDefault();
    if (!kbOn || kbCell < 0) {
      kbCell = legalList.length ? legalList[0] : 27;
    } else {
      var r = clamp(((kbCell / N) | 0) + dr, 0, N - 1), c = clamp(kbCell % N + dc, 0, N - 1);
      kbCell = r * N + c;
    }
    kbOn = true;
    requestDraw();
  });

  /* ---------------- setup / chrome ---------------- */

  function readSeg(seg, attr, fb) {
    var a = seg.querySelector("button.active");
    return a ? a.getAttribute(attr) : fb;
  }
  function wireSeg(seg, attr) {
    seg.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button");
      if (!btn || !btn.hasAttribute(attr)) return;
      seg.querySelectorAll("button").forEach(function (b) { b.classList.toggle("active", b === btn); });
      syncUI();
    });
  }
  function syncUI() {
    var mode = readSeg(document.getElementById("modeSeg"), "data-mode", "local");
    document.getElementById("diffRow").hidden = mode !== "ai";
    document.getElementById("sideRow").hidden = mode !== "ai";
  }

  function start(keep) {
    if (!keep) {
      settings.mode = readSeg(document.getElementById("modeSeg"), "data-mode", "local");
      settings.diff = readSeg(document.getElementById("diffSeg"), "data-diff", "easy");
      settings.humanSide = readSeg(document.getElementById("sideSeg"), "data-side", "human") === "ai" ? WHITE : BLACK;
    }
    setupEl.hidden = true; endEl.hidden = true;
    reset(); scheduleAI();
  }

  document.getElementById("btnStart").addEventListener("click", function () { start(false); });
  document.getElementById("btnAgain").addEventListener("click", function () { start(true); });
  document.getElementById("btnSetup").addEventListener("click", function () { endEl.hidden = true; setupEl.hidden = false; });
  document.getElementById("btnRestart").addEventListener("click", function () {
    clearTimeout(aiTimer); clearTimeout(endTimer);
    setupEl.hidden = false; endEl.hidden = true;
    requestDraw();
  });
  document.getElementById("btnResign").addEventListener("click", function () {
    if (over || !setupEl.hidden) return;
    var loser = settings.mode === "ai" ? settings.humanSide : turn;
    finish(name(opp(loser)) + "获胜", name(loser) + "认输。", true);
  });
  wireSeg(document.getElementById("modeSeg"), "data-mode");
  wireSeg(document.getElementById("diffSeg"), "data-diff");
  wireSeg(document.getElementById("sideSeg"), "data-side");
  syncUI();

  window.addEventListener("message", function (ev) {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== "arcade") return;
    if (ev.data.action === "suspend") { suspended = true; clearTimeout(aiTimer); hover = -1; pressed = -1; requestDraw(); }
    else if (ev.data.action === "resume") { suspended = false; scheduleAI(); requestDraw(); }
  });

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(function () { layout(); }).observe(wrapEl);
  }
  window.addEventListener("resize", layout);

  reset();
  layout();
})();
