(function () {
  "use strict";
  /*
   * Nokia / Jamdat Tower Bloxx–style rewrite.
   * Lean/wobble stack, population + combo meter, dual-window floors,
   * jumping/parachuting residents, WebAudio SFX.
   * Refs: /workspace/xhs-nokia-tower/GAMEPLAY_NOTES.md
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

  var BEST_KEY = "mini-arcade-tower-bloxx-best-v2";
  var BLOCK_H = 40;
  var BASE_W = 118;
  var MIN_W = 36;
  var PIVOT_Y = 8;
  var CRANE_LEN0 = 78;

  var state = null;
  var suspended = false;
  var raf = 0;
  var lastTs = 0;
  var fx = []; // stars, people, scraps
  var audioCtx = null;

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
  function sfxLand(perfect) {
    beep(180, 0.06, "triangle", 0.07);
    beep(perfect ? 660 : 320, 0.09, "square", perfect ? 0.07 : 0.05, 0.02);
    if (perfect) {
      beep(880, 0.08, "sine", 0.05, 0.06);
      beep(1175, 0.1, "sine", 0.04, 0.1);
    }
  }
  function sfxFail() {
    beep(140, 0.15, "sawtooth", 0.06);
    beep(90, 0.25, "triangle", 0.05, 0.08);
  }
  function sfxCombo(n) {
    beep(500 + n * 40, 0.07, "square", 0.05);
  }

  function resetGame() {
    state = {
      phase: "swing", // swing | fall | miss | over
      floors: [], // {x,w,cx}  cx = center relative to tower axis
      lean: 0,
      leanV: 0,
      leanImpulse: 0,
      cam: 0,
      camTarget: 0,
      angle: 0,
      angSpeed: 1.65,
      amp: 72,
      hang: null,
      falling: null,
      comboMeter: 0,
      mult: 1,
      goodStreak: 0,
      floorsCount: 0,
      pop: 0,
      stability: 3, // 0..3 segments
      speed: 1,
      t: 0
    };
    // foundation
    state.floors.push({ x: (W - BASE_W) / 2, w: BASE_W, cx: 0 });
    fx = [];
    spawnHang();
    updateHud();
  }

  function topFloor() { return state.floors[state.floors.length - 1]; }

  function worldTopY() {
    // foundation top near bottom; each floor stacks up (smaller y)
    return H - 96 - state.floors.length * BLOCK_H;
  }

  function spawnHang() {
    var prev = topFloor();
    state.hang = { w: prev.w };
    state.phase = "swing";
    state.speed = Math.min(2.0, 1 + state.floorsCount * 0.028);
    state.amp = Math.min(96, 64 + state.floorsCount * 1.1);
  }

  function hookXY() {
    var a = state.angle;
    var len = CRANE_LEN0;
    return {
      x: W / 2 + Math.sin(a) * state.amp,
      y: PIVOT_Y + len + Math.abs(Math.cos(a)) * 4,
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
      vy: 40,
      rot: state.angle * 0.12,
      vr: 0
    };
    state.hang = null;
    state.phase = "fall";
    hintEl.textContent = "";
  }

  function qualityFromOffset(dx, w) {
    var r = Math.abs(dx) / Math.max(8, w);
    if (r < 0.045) return "perfect";
    if (r < 0.14) return "good";
    if (r < 0.28) return "ok";
    return "bad";
  }

  function land() {
    var prev = topFloor();
    var f = state.falling;
    var left = f.x;
    var right = f.x + f.w;
    var pL = prev.x;
    var pR = prev.x + prev.w;
    var oL = Math.max(left, pL);
    var oR = Math.min(right, pR);
    var overlap = oR - oL;

    if (overlap < MIN_W * 0.65) {
      // total miss
      state.phase = "miss";
      f.vr = (left + f.w / 2 < prev.x + prev.w / 2) ? -0.15 : 0.15;
      f.vy = 120;
      spawnJumpers(3, true);
      sfxFail();
      return;
    }

    // Keep most of the block; light trim of severe overhang (original still had seams of full-ish floors)
    var trim = 0;
    if (left < pL) trim += pL - left;
    if (right > pR) trim += right - pR;
    var newW = Math.max(MIN_W, f.w - trim * 0.55);
    // place centered on overlap mid, but preserve lean feel via cx
    var mid = (oL + oR) / 2;
    var newX = mid - newW / 2;
    // clamp onto previous footprint loosely
    if (newX < pL - 8) newX = pL - 8;
    if (newX + newW > pR + 8) newX = pR + 8 - newW;

    var dx = (newX + newW / 2) - (prev.x + prev.w / 2);
    var q = qualityFromOffset(dx, prev.w);

    state.floors.push({ x: newX, w: newW, cx: dx });
    state.floorsCount++;

    // lean impulse from off-center mass
    state.leanV += dx * 0.0018;
    state.leanImpulse = dx * 0.0025;

    // scoring
    var basePop = Math.round(14 + (newW / BASE_W) * 22);
    var bonus = 0;
    if (q === "perfect") {
      state.goodStreak++;
      state.comboMeter = Math.min(1, state.comboMeter + 0.28);
      raiseMult(true);
      bonus = Math.round(40 * state.mult + state.goodStreak * 12);
      spawnStars(mid, worldTopY() - state.cam, 12);
      sfxLand(true);
      sfxCombo(state.mult);
    } else if (q === "good") {
      state.goodStreak++;
      state.comboMeter = Math.min(1, state.comboMeter + 0.14);
      raiseMult(false);
      bonus = Math.round(18 * state.mult);
      spawnStars(mid, worldTopY() - state.cam, 6);
      sfxLand(false);
    } else if (q === "ok") {
      state.goodStreak = Math.max(0, state.goodStreak - 1);
      state.comboMeter = Math.max(0, state.comboMeter - 0.08);
      maybeDropMult();
      bonus = Math.round(6 * Math.max(1, state.mult * 0.5));
      spawnJumpers(1, false);
      sfxLand(false);
    } else {
      state.goodStreak = 0;
      state.comboMeter = Math.max(0, state.comboMeter - 0.35);
      dropMult();
      bonus = 2;
      spawnJumpers(2 + (Math.random() > 0.5 ? 1 : 0), true);
      state.stability = Math.max(0, state.stability - 1);
      sfxLand(false);
    }

    // big combo jumps like 00032→00302
    if (state.mult >= 4 && (q === "perfect" || q === "good")) {
      bonus += Math.round(55 * state.mult);
    }
    state.pop += basePop + bonus;

    // stability recovers slowly on good hits
    if (q === "perfect" || q === "good") {
      if (Math.random() < 0.35 && state.stability < 3) state.stability++;
    }

    state.falling = null;

    // camera follow tower top
    var topScreen = worldTopY() - state.cam;
    if (topScreen < H * 0.38) {
      state.camTarget += (H * 0.38 - topScreen);
    }

    // fail if lean too wild or width too thin or stability gone
    if (Math.abs(state.lean) > 0.38 || newW < MIN_W + 2 || state.stability <= 0) {
      // allow a beat of wobble then collapse
      state.phase = "collapsing";
      spawnJumpers(4, true);
      sfxFail();
      setTimeout(function () { if (state) gameOver(); }, 700);
    } else {
      state.phase = "pause";
      setTimeout(function () {
        if (!state || state.phase === "over" || state.phase === "collapsing") return;
        spawnHang();
      }, 160);
    }
    updateHud();
  }

  function raiseMult(perfect) {
    if (state.comboMeter >= 0.98) {
      state.mult = Math.min(7, state.mult + 1);
      state.comboMeter = 0.25;
    } else if (perfect && state.goodStreak >= 2 && state.mult < 2) {
      state.mult = 2;
    }
    // climb toward streak-based mult
    var want = Math.min(7, 1 + Math.floor(state.goodStreak / 2));
    if (want > state.mult && state.comboMeter > 0.5) state.mult = want;
  }
  function maybeDropMult() {
    if (state.mult > 1 && Math.random() < 0.45) state.mult--;
  }
  function dropMult() {
    state.mult = Math.max(1, state.mult - 1 - (state.mult > 4 ? 1 : 0));
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
        x: mid + (Math.random() - 0.5) * 40,
        y: top + 10,
        vx: (Math.random() - 0.5) * 2.5,
        vy: -1.5 - Math.random() * 2,
        life: 90 + Math.random() * 40,
        swing: Math.random() * 6
      });
    }
  }

  function gameOver() {
    if (!state || state.phase === "over") return;
    state.phase = "over";
    var best = loadBest();
    if (state.pop > best) { saveBest(state.pop); best = state.pop; }
    bestEl.textContent = String(best);
    endTitle.textContent = "大楼倒塌";
    endMsg.textContent = "盖了 " + state.floorsCount + " 层 · 人口 " + pad(state.pop, 5) + "\n最高人口 " + pad(best, 5);
    endOverlay.hidden = false;
    updateHud();
  }

  function updateHud() {
    if (!state) return;
    comboFill.style.width = Math.round(state.comboMeter * 100) + "%";
    multEl.textContent = "x" + state.mult;
    floorsEl.textContent = pad(state.floorsCount, 3);
    popEl.textContent = pad(state.pop, 5);
    var segs = stabSeg.querySelectorAll("i");
    for (var i = 0; i < segs.length; i++) {
      segs[i].classList.toggle("on", i < state.stability);
    }
  }

  function tick(dt) {
    if (!state || suspended || state.phase === "over") return;
    state.t += dt;

    // spring-damper lean (whole tower wobble)
    var target = state.leanImpulse;
    state.leanImpulse *= Math.pow(0.2, dt); // decay target bias
    var k = 18, damp = 5.5;
    var acc = -k * (state.lean - target) - damp * state.leanV;
    // also bias lean toward COM of recent floors
    var com = 0, mass = 0;
    for (var i = Math.max(0, state.floors.length - 8); i < state.floors.length; i++) {
      var fl = state.floors[i];
      com += fl.cx * fl.w;
      mass += fl.w;
    }
    if (mass > 0) acc += (com / mass) * 0.0009;
    state.leanV += acc * dt;
    state.lean += state.leanV * dt;
    if (Math.abs(state.lean) > 0.55) state.lean = Math.sign(state.lean) * 0.55;

    state.cam += (state.camTarget - state.cam) * Math.min(1, dt * 3.5);

    // fx
    for (var j = fx.length - 1; j >= 0; j--) {
      var p = fx[j];
      p.life -= dt * 60;
      if (p.kind === "star") {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += 0.2;
      } else {
        p.x += p.vx + Math.sin(state.t * 3 + p.swing) * (p.kind === "chute" ? 0.35 : 0.1);
        p.y += p.vy;
        p.vy += p.kind === "chute" ? 0.04 : 0.18;
      }
      if (p.life <= 0 || p.y > H + 30) fx.splice(j, 1);
    }

    if (state.phase === "swing") {
      state.angle += state.angSpeed * state.speed * dt;
    } else if (state.phase === "fall" || state.phase === "miss") {
      var f = state.falling;
      if (!f) return;
      f.vy += 980 * dt;
      f.y += f.vy * dt;
      if (state.phase === "miss") {
        f.rot += f.vr;
        f.x += f.vr * 220 * dt;
        if (f.y > H + 60) gameOver();
        return;
      }
      var landY = worldTopY() - state.cam - BLOCK_H;
      if (f.y >= landY) {
        f.y = landY;
        land();
      }
    } else if (state.phase === "collapsing") {
      state.leanV += (state.lean >= 0 ? 1 : -1) * 1.2 * dt;
      state.lean += state.leanV * dt;
    }
  }

  // ---------- draw ----------
  function drawSky() {
    var bands = 16;
    for (var i = 0; i < bands; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#5b8fd4" : "#4a7fc6";
      ctx.fillRect((i / bands) * W, 0, W / bands + 1, H);
    }
  }

  function drawCity() {
    var ground = H - 40 + Math.min(30, (state ? state.cam : 0) * 0.015);
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
    // far stripes
    ctx.globalAlpha = 0.35;
    for (var i = 0; i < 10; i++) {
      ctx.fillStyle = "#6f8ec0";
      ctx.fillRect(8 + i * 36, ground - 60 - (i % 3) * 30, 14, 60 + (i % 3) * 30);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloorBlock(x, y, w, h, tiltExtra) {
    ctx.save();
    // body
    ctx.fillStyle = "#e8a830";
    roundRect(x, y, w, h, 2);
    ctx.fill();
    // darker side edge for thickness
    ctx.fillStyle = "#c07818";
    ctx.fillRect(x + w - 5, y + 2, 5, h - 2);
    // outline
    ctx.strokeStyle = "#2a1808";
    ctx.lineWidth = 2.5;
    roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 2);
    ctx.stroke();
    // top trim
    ctx.fillStyle = "#f0b840";
    ctx.fillRect(x + 1, y + 1, w - 6, 4);
    // two windows
    var gap = 5;
    var wx = 7;
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
    // hook body
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
    // hook curve
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
    // pivot near foundation
    var baseY = H - 96 - cam;
    var pivotX = W / 2;
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
        ctx.fillStyle = "#ffd24a";
        ctx.strokeStyle = "#a06000";
        ctx.lineWidth = 1;
        starPath(0, 0, 5, 2.2, 5);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      } else if (p.kind === "chute") {
        // parachute
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
        ctx.fillStyle = "#ea580c";
        ctx.fillRect(p.x - 2, p.y, 4, 7);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(p.x - 2, p.y + 5, 4, 3);
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
      var idle = hookXY();
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
