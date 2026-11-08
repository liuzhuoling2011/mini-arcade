(function () {
  "use strict";
  /*
   * Tower Bloxx–style remake for mini-arcade.
   * Visuals: classic 2D yellow dual-window floors + city silhouette (XHS Nokia video).
   * Math: Nokia City Bloxx 1.0.8 Quick-game (House.class) — see
   * /workspace/tower-bloxx-rea/SPEC.md
   */

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var W = canvas.width;
  var H = canvas.height;

  var comboFill = document.getElementById("comboFill");
  var multEl = document.getElementById("mult");
  var floorsEl = document.getElementById("floors");
  var popEl = document.getElementById("pop");
  var bestEl = document.getElementById("bestPop");
  var hintEl = document.getElementById("hint");
  var stabSeg = document.getElementById("stabSeg");
  var startOverlay = document.getElementById("startOverlay");
  var endOverlay = document.getElementById("endOverlay");
  var endTitle = document.getElementById("endTitle");
  var endMsg = document.getElementById("endMsg");

  var BEST_KEY = "mini-arcade-tower-bloxx-best-v3";
  var BLOCK_H = 40;
  var BASE_W = 120;
  var MIN_W = 40;
  var PIVOT_Y = 8;
  var CRANE_LEN0 = 78;
  /* JAR: half-width ≈ 128; thresholds 25/50/80/127 */
  var HALF_FP = 128;
  var TH_PERFECT = 25;
  var TH_GOOD = 50;
  var TH_OK = 80;
  var TH_LAND = 127;
  var COMBO_MAX = 6000;

  var state = null;
  var suspended = false;
  var raf = 0;
  var lastTs = 0;
  var fx = [];
  var audioCtx = null;
  var imgs = {};

  ["pop_icon", "build_icon", "stars", "jumpers", "star_burst"].forEach(function (n) {
    var im = new Image();
    im.src = "assets/" + n + ".png";
    imgs[n] = im;
  });

  function pad(n, len) {
    var s = String(Math.max(0, n | 0));
    while (s.length < len) s = "0" + s;
    return s;
  }
  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) {}
  }

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
  }
  function beep(freq, dur, type, vol, when) {
    var ac = ensureAudio();
    if (!ac) return;
    var t0 = ac.currentTime + (when || 0);
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfxLand(q) {
    if (q === 4) {
      beep(220, 0.05, "triangle", 0.06);
      beep(660, 0.08, "square", 0.07, 0.02);
      beep(880, 0.08, "sine", 0.05, 0.06);
      beep(1175, 0.1, "sine", 0.04, 0.1);
    } else if (q === 3) {
      beep(200, 0.05, "triangle", 0.06);
      beep(520, 0.08, "square", 0.055, 0.02);
    } else if (q >= 1) {
      beep(180, 0.06, "triangle", 0.05);
      beep(320, 0.07, "square", 0.04, 0.02);
    }
  }
  function sfxFail() {
    beep(140, 0.15, "sawtooth", 0.06);
    beep(90, 0.25, "triangle", 0.05, 0.08);
  }
  function sfxCombo(n) {
    beep(480 + n * 45, 0.07, "square", 0.05);
  }
  function sfxBank() {
    beep(740, 0.1, "sine", 0.06);
    beep(980, 0.12, "sine", 0.05, 0.08);
  }

  function resetGame() {
    state = {
      phase: "swing",
      floors: [],
      lean: 0,
      leanV: 0,
      leanBias: 0,
      cam: 0,
      camTarget: 0,
      angle: 0,
      period: 1.7,
      amp: 70,
      hang: null,
      falling: null,
      comboMeter: 0,
      mult: 0,
      comboScore: 0,
      longestCombo: 0,
      floorsCount: 0,
      pop: 0,
      lives: 3,
      t: 0,
      shake: 0,
      pauseUntil: 0
    };
    state.floors.push({ x: (W - BASE_W) / 2, w: BASE_W, off: 0 });
    fx = [];
    spawnHang();
    updateHud();
  }

  function topFloor() { return state.floors[state.floors.length - 1]; }

  function worldTopY() {
    return H - 96 - state.floors.length * BLOCK_H;
  }

  function spawnHang() {
    var prev = topFloor();
    /* keep full previous width — City Bloxx does not slice on land */
    var w = Math.max(MIN_W, prev.w);
    state.hang = { w: w };
    state.phase = "swing";
    /* aS / aQ-ish scaling */
    var f = state.floorsCount;
    state.period = Math.max(0.95, 1.7 - f * 0.012);
    state.amp = Math.min(110, 64 + f * 1.35);
  }

  function hookXY() {
    var a = state.angle;
    return {
      x: W / 2 + Math.sin(a) * state.amp,
      y: PIVOT_Y + CRANE_LEN0 + Math.abs(Math.cos(a)) * 5,
      a: a
    };
  }

  function drop() {
    if (!state || suspended) return;
    if (state.phase !== "swing" || !state.hang) return;
    try { ensureAudio() && audioCtx.resume && audioCtx.resume(); } catch (e) {}
    var h = hookXY();
    state.falling = {
      x: h.x - state.hang.w / 2,
      y: h.y + 10,
      w: state.hang.w,
      vy: 60,
      rot: state.angle * 0.12,
      vr: 0
    };
    state.hang = null;
    state.phase = "fall";
    hintEl.textContent = "";
  }

  /* Map pixel offset → JAR-like fixed-point (half-width = 128) */
  function toFP(dxPx, halfW) {
    return (dxPx / Math.max(1, halfW)) * HALF_FP;
  }

  function qualityFromFP(absFP) {
    if (absFP < TH_PERFECT) return 4;
    if (absFP < TH_GOOD) return 3;
    if (absFP < TH_OK) return 2;
    if (absFP <= TH_LAND) return 1;
    return 0;
  }

  function bankCombo() {
    if (!state) return;
    if (state.comboScore > 0) {
      state.pop += state.comboScore;
      sfxBank();
    }
    state.comboScore = 0;
    state.mult = 0;
    state.comboMeter = 0;
    updateHud();
  }

  function land() {
    var prev = topFloor();
    var f = state.falling;
    var cx = f.x + f.w / 2;
    var pcx = prev.x + prev.w / 2;
    var dx = cx - pcx;
    var half = prev.w / 2;
    var fp = toFP(dx, half);
    var absFP = Math.abs(fp);
    var q = qualityFromFP(absFP);

    if (q === 0) {
      /* miss — eject, lose a life */
      state.phase = "miss";
      f.vr = dx < 0 ? -0.18 : 0.18;
      f.vy = 80;
      if (state.comboMeter > 0 || state.mult > 0) bankCombo();
      state.lives = Math.max(0, state.lives - 1);
      spawnJumpers(3, true);
      sfxFail();
      updateHud();
      return;
    }

    /* Keep full width (no slice); store offset for lean */
    var newW = f.w;
    var newX = cx - newW / 2;
    var off = dx;

    state.floors.push({ x: newX, w: newW, off: off });
    state.floorsCount++;
    state.leanBias += off * 0.0022;
    state.leanV += off * 0.0016;
    state.shake = 0.35;

    /* Combo increment (House.F): if mult==0 reset score then ++; else if meter>0 ++ */
    if (state.mult === 0) {
      state.comboScore = 0;
      state.mult = 1;
    } else if (state.comboMeter > 0) {
      state.mult++;
    }
    if (state.mult > state.longestCombo) state.longestCombo = state.mult;

    if (q === 4) {
      state.comboMeter = COMBO_MAX;
      spawnStars(cx, worldTopY() - state.cam, 14);
      sfxLand(4);
      if (state.mult > 1) sfxCombo(state.mult);
    } else {
      sfxLand(q);
      if (q <= 2) spawnJumpers(q === 1 ? 2 : 1, q === 1);
      if (q === 3) spawnStars(cx, worldTopY() - state.cam, 5);
    }

    /* Population: floors/10 + quality; while meter active add to comboScore */
    var floors = state.floorsCount;
    var add = Math.floor(floors / 10) + q;
    if (state.comboMeter > 0 && state.mult > 0) {
      state.comboScore += state.mult * (2 + Math.floor(floors / 10) * 2);
    }
    state.pop += add;

    state.falling = null;

    var topScreen = worldTopY() - state.cam;
    if (topScreen < H * 0.36) {
      state.camTarget += (H * 0.36 - topScreen);
    }

    if (Math.abs(state.lean) > 0.42 || Math.abs(state.leanBias) > 0.55) {
      state.phase = "collapsing";
      spawnJumpers(5, true);
      sfxFail();
      state.pauseUntil = state.t + 0.7;
    } else {
      state.phase = "pause";
      state.pauseUntil = state.t + 0.18;
    }
    updateHud();
  }

  function spawnStars(x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      var sp = 1.2 + Math.random() * 3.2;
      fx.push({
        kind: "star",
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 28 + Math.random() * 16, rot: Math.random() * 6
      });
    }
  }
  function spawnJumpers(n, chute) {
    var top = worldTopY() - state.cam;
    var mid = topFloor().x + topFloor().w / 2;
    for (var i = 0; i < n; i++) {
      fx.push({
        kind: chute && i === 0 ? "chute" : "jumper",
        x: mid + (Math.random() - 0.5) * 44,
        y: top + 8,
        vx: (Math.random() - 0.5) * 2.8,
        vy: -1.6 - Math.random() * 2.2,
        life: 95 + Math.random() * 40,
        swing: Math.random() * 6
      });
    }
  }

  function gameOver(reason) {
    if (!state || state.phase === "over") return;
    if (state.comboMeter > 0 || state.comboScore > 0) bankCombo();
    state.phase = "over";
    var best = loadBest();
    if (state.pop > best) { saveBest(state.pop); best = state.pop; }
    bestEl.textContent = String(best);
    endTitle.textContent = reason || "大楼倒塌";
    endMsg.textContent =
      "盖了 " + state.floorsCount + " 层 · 人口 " + pad(state.pop, 5) +
      "\n最长连击 x" + state.longestCombo +
      "\n最高人口 " + pad(best, 5);
    endOverlay.hidden = false;
    updateHud();
  }

  function updateHud() {
    if (!state) return;
    var pct = state.comboMeter > 0 ? Math.min(100, (state.comboMeter / COMBO_MAX) * 100) : 0;
    comboFill.style.width = Math.round(pct) + "%";
    multEl.textContent = state.mult > 1 ? ("x" + state.mult) : (state.mult === 1 && state.comboMeter > 0 ? "x1" : "");
    floorsEl.textContent = pad(state.floorsCount, 3);
    popEl.textContent = pad(state.pop, 5);
    var segs = stabSeg.querySelectorAll("i");
    for (var i = 0; i < segs.length; i++) {
      segs[i].classList.toggle("on", i < state.lives);
    }
  }

  function tick(dt) {
    if (!state || suspended || state.phase === "over") return;
    state.t += dt;
    var dtMs = dt * 1000;

    /* Combo drain: bA -= dt + (bz-1)*dt/6 */
    if (state.comboMeter > 0) {
      var drain = dtMs + Math.max(0, state.mult - 1) * dtMs / 6;
      state.comboMeter -= drain;
      if (state.comboMeter <= 0) {
        state.comboMeter = 0;
        bankCombo();
      }
      updateHud();
    }

    /* Spring lean toward bias from stacked offsets */
    var k = 14, damp = 4.8;
    var acc = -k * (state.lean - state.leanBias) - damp * state.leanV;
    /* recent COM */
    var com = 0, mass = 0;
    for (var i = Math.max(0, state.floors.length - 10); i < state.floors.length; i++) {
      var fl = state.floors[i];
      com += fl.off * fl.w;
      mass += fl.w;
    }
    if (mass > 0) acc += (com / mass) * 0.0007;
    /* gentle wobble amp grows with height (bv-ish) */
    acc += Math.sin(state.t * 2.4) * Math.min(0.08, state.floorsCount * 0.0025) * 0.4;
    state.leanV += acc * dt;
    state.lean += state.leanV * dt;
    if (Math.abs(state.lean) > 0.6) state.lean = Math.sign(state.lean) * 0.6;
    state.leanBias *= Math.pow(0.992, dt * 60);

    state.cam += (state.camTarget - state.cam) * Math.min(1, dt * 3.2);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

    for (var j = fx.length - 1; j >= 0; j--) {
      var p = fx[j];
      p.life -= dt * 60;
      if (p.kind === "star") {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += 0.2;
      } else {
        p.x += p.vx + Math.sin(state.t * 3 + p.swing) * (p.kind === "chute" ? 0.35 : 0.1);
        p.y += p.vy;
        p.vy += p.kind === "chute" ? 0.035 : 0.18;
      }
      if (p.life <= 0 || p.y > H + 40) fx.splice(j, 1);
    }

    if (state.phase === "swing") {
      state.angle += (Math.PI * 2 / state.period) * dt;
    } else if (state.phase === "fall" || state.phase === "miss") {
      var f = state.falling;
      if (!f) return;
      f.vy += 980 * dt;
      f.y += f.vy * dt;
      if (state.phase === "miss") {
        f.rot += f.vr;
        f.x += f.vr * 240 * dt;
        if (f.y > H + 60) {
          state.falling = null;
          if (state.lives <= 0) {
            gameOver("机会用尽");
          } else {
            /* peel overhanging top floor if any; resume */
            spawnHang();
          }
        }
        return;
      }
      var landY = worldTopY() - state.cam - BLOCK_H;
      if (f.y >= landY) {
        f.y = landY;
        land();
      }
    } else if (state.phase === "pause") {
      if (state.t >= state.pauseUntil) spawnHang();
    } else if (state.phase === "collapsing") {
      state.leanV += (state.lean >= 0 ? 1 : -1) * 1.4 * dt;
      state.lean += state.leanV * dt;
      if (state.t >= state.pauseUntil) gameOver("大楼倒塌");
    }
  }

  function drawSky() {
    var bands = 16;
    for (var i = 0; i < bands; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#5b8fd4" : "#4a7fc6";
      ctx.fillRect((i / bands) * W, 0, W / bands + 1, H);
    }
    /* tiny birds */
    if (state) {
      ctx.fillStyle = "rgba(20,30,50,0.45)";
      for (var b = 0; b < 3; b++) {
        var bx = (state.t * (18 + b * 7) + b * 90) % (W + 40) - 20;
        var by = 40 + b * 28 + Math.sin(state.t * 2 + b) * 4;
        ctx.fillRect(bx, by, 3, 1);
        ctx.fillRect(bx + 2, by - 1, 2, 1);
      }
    }
  }

  function drawCity() {
    var ground = H - 40 + Math.min(40, (state ? state.cam : 0) * 0.02);
    var sil = [
      [0, 90], [18, 140], [40, 110], [58, 180], [82, 130],
      [105, 210], [128, 150], [150, 260], [175, 170], [198, 230],
      [225, 145], [248, 200], [275, 160], [300, 240], [328, 120], [345, 170]
    ];
    sil.forEach(function (b, idx) {
      var h = b[1] * 0.5;
      ctx.fillStyle = idx % 2 ? "#3d4f7a" : "#2f4068";
      ctx.fillRect(b[0], ground - h, 22, h);
      if (idx === 7 || idx === 13) {
        ctx.fillRect(b[0] + 8, ground - h - 40, 4, 40);
        ctx.beginPath();
        ctx.moveTo(b[0] + 10, ground - h - 48);
        ctx.lineTo(b[0] + 6, ground - h - 40);
        ctx.lineTo(b[0] + 14, ground - h - 40);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 0.35;
    for (var i = 0; i < 10; i++) {
      ctx.fillStyle = "#6f8ec0";
      ctx.fillRect(8 + i * 36, ground - 60 - (i % 3) * 30, 14, 60 + (i % 3) * 30);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#2a3a28";
    ctx.fillRect(0, ground, W, H - ground + 2);
  }

  function drawFloorBlock(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "#e8a830";
    roundRect(x, y, w, h, 2);
    ctx.fill();
    ctx.fillStyle = "#c07818";
    ctx.fillRect(x + w - 5, y + 2, 5, h - 2);
    ctx.strokeStyle = "#2a1808";
    ctx.lineWidth = 2.5;
    roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 2);
    ctx.stroke();
    ctx.fillStyle = "#f0b840";
    ctx.fillRect(x + 1, y + 1, w - 6, 4);
    var gap = 5, wx = 7;
    var ww = (w - wx * 2 - gap - 4) / 2;
    var wh = h - 12;
    if (ww > 4 && wh > 6) {
      for (var i = 0; i < 2; i++) {
        var sx = x + wx + i * (ww + gap);
        ctx.fillStyle = "#1a4a6e";
        roundRect(sx, y + 7, ww, wh, 1.5);
        ctx.fill();
        ctx.fillStyle = "rgba(160,210,240,0.35)";
        ctx.fillRect(sx + 1, y + 8, ww * 0.4, wh * 0.45);
        ctx.strokeStyle = "#142838";
        ctx.lineWidth = 1;
        roundRect(sx, y + 7, ww, wh, 1.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCrane(hx, hy, holding) {
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = "#9aa3ad";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy);
    ctx.lineTo(hx + 6, hy);
    ctx.lineTo(hx + 5, hy + 6);
    ctx.lineTo(hx - 5, hy + 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy + 11, 6, -0.2, Math.PI * 0.9);
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    if (holding) {
      ctx.fillStyle = "#666";
      ctx.fillRect(hx - 2, hy + 6, 4, 8);
    }
  }

  function drawTower() {
    var cam = state.cam;
    var lean = state.lean;
    var shakeX = state.shake > 0 ? (Math.random() - 0.5) * 4 * state.shake : 0;
    var baseY = H - 96 - cam;
    var pivotX = W / 2 + shakeX;
    var pivotY = baseY + BLOCK_H * 0.5;

    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(lean);
    ctx.translate(-pivotX, -pivotY);

    for (var i = 0; i < state.floors.length; i++) {
      var fl = state.floors[i];
      var y = (H - 96 - BLOCK_H) - i * BLOCK_H - cam;
      if (y > H + 30 || y + BLOCK_H < -40) continue;
      drawFloorBlock(fl.x, y, fl.w, BLOCK_H);
    }
    ctx.restore();
  }

  function drawFx() {
    fx.forEach(function (p) {
      if (p.kind === "star") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (imgs.stars && imgs.stars.complete && imgs.stars.naturalWidth) {
          ctx.drawImage(imgs.stars, 0, 0, 13, 13, -7, -7, 14, 14);
        } else {
          ctx.fillStyle = "#ffd24a";
          starPath(0, 0, 5, 2.2, 5);
          ctx.fill();
        }
        ctx.restore();
      } else if (p.kind === "chute") {
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 8, 8, 5, 0, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = "#94a3b8";
        ctx.beginPath();
        ctx.moveTo(p.x - 6, p.y - 6);
        ctx.lineTo(p.x, p.y + 2);
        ctx.lineTo(p.x + 6, p.y - 6);
        ctx.stroke();
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(p.x - 2, p.y + 2, 4, 6);
      } else {
        if (imgs.jumpers && imgs.jumpers.complete && imgs.jumpers.naturalWidth) {
          ctx.drawImage(imgs.jumpers, 0, 0, 17, 11, p.x - 8, p.y - 4, 17, 11);
        } else {
          ctx.fillStyle = "#ea580c";
          ctx.fillRect(p.x - 2, p.y, 4, 7);
        }
      }
    });
  }

  function starPath(x, y, r, r2, n) {
    ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / n;
      var rr = i % 2 === 0 ? r : r2;
      var px = x + Math.cos(ang) * rr;
      var py = y + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function draw() {
    drawSky();
    drawCity();
    if (!state) return;

    drawTower();

    if (state.phase === "swing" && state.hang) {
      var h = hookXY();
      drawCrane(h.x, h.y, true);
      var bw = state.hang.w;
      var bx = h.x - bw / 2;
      var by = h.y + 12;
      ctx.save();
      ctx.translate(h.x, by + BLOCK_H / 2);
      ctx.rotate(state.angle * 0.1);
      ctx.translate(-h.x, -(by + BLOCK_H / 2));
      drawFloorBlock(bx, by, bw, BLOCK_H);
      ctx.restore();
    } else if (state.falling) {
      var f = state.falling;
      drawCrane(W / 2 + Math.sin(state.angle) * 8, PIVOT_Y + CRANE_LEN0, false);
      ctx.save();
      ctx.translate(f.x + f.w / 2, f.y + BLOCK_H / 2);
      ctx.rotate(f.rot || 0);
      ctx.translate(-(f.x + f.w / 2), -(f.y + BLOCK_H / 2));
      drawFloorBlock(f.x, f.y, f.w, BLOCK_H);
      ctx.restore();
    } else {
      drawCrane(W / 2, PIVOT_Y + CRANE_LEN0, false);
    }

    drawFx();
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;
    tick(dt);
    draw();
  }

  function onAction(e) {
    if (e) e.preventDefault();
    if (!startOverlay.hidden || !endOverlay.hidden) return;
    drop();
  }
  canvas.addEventListener("pointerdown", onAction);
  window.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.key === "Enter") onAction(e);
  });

  document.getElementById("btnStart").addEventListener("click", function () {
    startOverlay.hidden = true;
    endOverlay.hidden = true;
    resetGame();
    hintEl.textContent = "点屏幕 / 空格放下";
  });
  document.getElementById("btnAgain").addEventListener("click", function () {
    endOverlay.hidden = true;
    resetGame();
  });

  window.addEventListener("message", function (ev) {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== "arcade") return;
    if (ev.data.action === "suspend") suspended = true;
    else if (ev.data.action === "resume") {
      suspended = false;
      try { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); } catch (e) {}
    }
  });

  bestEl.textContent = String(loadBest());
  drawSky(); drawCity();
  requestAnimationFrame(loop);
})();
