(function () {
  "use strict";
  /*
   * Nokia Tower Bloxx / City Bloxx Quick-game remake
   * Visual: classic 2D yellow dual-window (XHS handset video crops)
   * Math: City Bloxx 1.0.8 House.java — SPEC.md
   */

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var W = canvas.width;
  var H = canvas.height;

  var startOverlay = document.getElementById("startOverlay");
  var endOverlay = document.getElementById("endOverlay");
  var endTitle = document.getElementById("endTitle");
  var endMsg = document.getElementById("endMsg");
  var bestEl = document.getElementById("bestPop");

  var BEST_KEY = "mini-arcade-tower-bloxx-best-v4";

  /* Logical floor size — ~1/3 of classic 240px S40 width, scaled to 360 */
  var BLOCK_W = 96;
  var BLOCK_H = 40;
  var PIVOT_Y = 6;
  var CRANE_LEN = 72;

  /* JAR fixed-point half-width ≈ 128 */
  var HALF_FP = 128;
  var TH_PERFECT = 25;
  var TH_GOOD = 50;
  var TH_OK = 80;
  var TH_LAND = 127;
  var COMBO_MAX = 6000;

  /* aQ / aS tables (Quick-game path uses bl index; map bl≈1 residential) */
  var AQ = [213, 256, 298, 341, 384];
  var AS = [1670, 1700, 1650, 1600, 1550, 1500, 1450];
  var BL = 1; /* difficulty band for quick climb */

  var state = null;
  var suspended = false;
  var raf = 0;
  var lastTs = 0;
  var fx = [];
  var sparkles = [];
  var audioCtx = null;
  var midiSfx = null;
  var imgs = {};
  var floorPat = null;
  var hintT = 0;

  ["floor", "build_icon", "pop_icon", "stars", "stars_sheet", "jumpers", "star_burst", "chute"].forEach(function (n) {
    var im = new Image();
    im.src = "assets/" + n + ".png";
    imgs[n] = im;
  });

  fetch("assets/sfx-midi.json")
    .then(function (r) { return r.json(); })
    .then(function (j) { midiSfx = j; })
    .catch(function () {});

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

  /* ---------- Audio: MIDI note sequences via WebAudio ---------- */
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
  }
  function midiToFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function playMidiClip(key, gainScale) {
    var ac = ensureAudio();
    if (!ac || !midiSfx || !midiSfx[key]) return;
    try { if (ac.state === "suspended") ac.resume(); } catch (e) {}
    var clip = midiSfx[key];
    var gScale = gainScale || 0.045;
    var t0 = ac.currentTime + 0.01;
    var maxT = 0;
    clip.notes.forEach(function (ev) {
      var startMs = ev[0], note = ev[1], vel = ev[2], durMs = ev[3];
      /* Skip very low percussion-ish for clearer phone speaker tone, keep for explosion */
      if (key !== "explosion" && note < 40) return;
      var dur = Math.min(0.35, Math.max(0.04, durMs / 1000));
      var when = t0 + startMs / 1000;
      if (when - t0 > 1.2) return; /* keep SFX snappy */
      var o = ac.createOscillator();
      var g = ac.createGain();
      o.type = key === "explosion" ? "sawtooth" : (note < 55 ? "triangle" : "square");
      o.frequency.setValueAtTime(midiToFreq(note), when);
      var vol = gScale * (vel / 127);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(when); o.stop(when + dur + 0.02);
      maxT = Math.max(maxT, startMs + durMs);
    });
  }
  function sfxLand(q) {
    if (q === 4) playMidiClip("good", 0.04);
    else if (q === 3) playMidiClip("mediocre", 0.038);
    else playMidiClip("mediocre", 0.03);
  }
  function sfxFail() { playMidiClip("bad", 0.042); }
  function sfxCollapse() { playMidiClip("explosion", 0.05); }
  function sfxCombo() { playMidiClip("milestone", 0.035); }
  function sfxBank() { playMidiClip("feedback", 0.05); }
  function sfxClick() { playMidiClip("feedback", 0.04); }

  /* ---------- Swing amp / period from aQ / aS ---------- */
  function swingParams(floors) {
    /* Quick-game: cP = min(aQ[bl], aQ[0] + bs*(aQ[bl]-aQ[0])/60)
       cO = max(aS[bl+2], aS[0] - bs*(aS[0]-aS[bl+2])/100) when bs<100 */
    var cP = Math.min(AQ[BL], AQ[0] + floors * (AQ[BL] - AQ[0]) / 60);
    var cO = Math.max(AS[BL + 2], AS[0] - floors * (AS[0] - AS[BL + 2]) / 100);
    /* Map FP amp → px: half floor width corresponds to 128 FP */
    var amp = (cP / HALF_FP) * (BLOCK_W / 2);
    var period = cO / 1000; /* aS units behave as ms */
    return { amp: amp, period: period };
  }

  function resetGame() {
    state = {
      phase: "swing",
      floors: [],
      /* lean oscillator (bv, bw, bu, bm from JAR) */
      bm: 0,
      bv: 0,
      bw: 0,
      bu: 0,
      leanVis: 0,
      cam: 0,
      camTarget: 0,
      angle: 0,
      amp: 70,
      period: 1.67,
      hang: null,
      falling: null,
      comboMeter: -2000,
      mult: 0,
      comboScore: 0,
      longestCombo: 0,
      floorsCount: 0,
      pop: 0,
      lives: 3,
      t: 0,
      shake: 0,
      pauseUntil: 0,
      hint: "点屏幕 / 空格放下"
    };
    /* Foundation floor centered */
    state.floors.push({ cx: W / 2, off: 0 });
    fx = [];
    sparkles = [];
    var sp = swingParams(0);
    state.amp = sp.amp;
    state.period = sp.period;
    spawnHang();
  }

  function topFloor() { return state.floors[state.floors.length - 1]; }

  function towerTopWorldY() {
    /* Y of top surface of uppermost floor in world space (y increases down) */
    return H - 70 - state.floors.length * BLOCK_H;
  }

  function spawnHang() {
    state.hang = { w: BLOCK_W };
    state.phase = "swing";
    var sp = swingParams(state.floorsCount);
    state.amp = sp.amp;
    state.period = sp.period;
  }

  function hookXY() {
    var a = state.angle;
    return {
      x: W / 2 + Math.sin(a) * state.amp,
      y: PIVOT_Y + CRANE_LEN + (1 - Math.cos(a)) * 4,
      a: a
    };
  }

  function drop() {
    if (!state || suspended) return;
    if (state.phase !== "swing" || !state.hang) return;
    try { ensureAudio() && audioCtx.resume && audioCtx.resume(); } catch (e) {}
    sfxClick();
    var h = hookXY();
    state.falling = {
      x: h.x - state.hang.w / 2,
      y: h.y + 10,
      w: state.hang.w,
      vy: 40,
      rot: state.angle * 0.14,
      vr: 0
    };
    state.hang = null;
    state.phase = "fall";
    state.hint = "";
  }

  function toFP(dxPx) {
    return (dxPx / (BLOCK_W / 2)) * HALF_FP;
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
      spawnPopFloat(state.comboScore);
    }
    state.comboScore = 0;
    state.mult = 0;
    state.comboMeter = 0;
  }

  function updateLeanStats() {
    /* House.z after land: bv = min(bs/2 + |bm|/20, bs*(bs/2+|bm|/20)/6) */
    var bs = state.floorsCount;
    var bm = state.bm;
    var term = bs / 2 + Math.abs(bm) / 20;
    state.bv = Math.min(term, bs * term / 6);
  }

  function land() {
    var prev = topFloor();
    var f = state.falling;
    var cx = f.x + f.w / 2;
    var dx = cx - prev.cx;
    var fp = toFP(dx);
    var absFP = Math.abs(fp);
    var q = qualityFromFP(absFP);
    var n3 = Math.round(fp); /* signed FP offset like JAR */

    if (q === 0) {
      state.phase = "miss";
      f.vr = dx < 0 ? -0.2 : 0.2;
      f.vy = 60;
      if (state.comboMeter > 0 || state.mult > 0) bankCombo();
      state.lives = Math.max(0, state.lives - 1);
      spawnJumpers(3, true);
      sfxFail();
      return;
    }

    /* Combo increment (House.F control flow) */
    if (state.mult === 0) {
      state.comboScore = 0;
      state.mult = 1;
    } else if (state.comboMeter > 0) {
      state.mult++;
    }
    if (state.mult > state.longestCombo) state.longestCombo = state.mult;

    state.bm += n3;

    var storedOff = 0;
    if (q === 4) {
      storedOff = 0;
      state.comboMeter = COMBO_MAX;
      spawnStars(cx, towerTopWorldY() - state.cam - BLOCK_H / 2, 12);
      spawnSparkles(cx, towerTopWorldY() - state.cam);
      sfxLand(4);
      if (state.mult >= 3) sfxCombo();
    } else {
      storedOff = n3;
      sfxLand(q);
      if (q <= 2) spawnJumpers(q === 1 ? 2 : 1, q === 1);
      if (q === 3) {
        spawnStars(cx, towerTopWorldY() - state.cam - BLOCK_H / 2, 5);
        spawnSparkles(cx, towerTopWorldY() - state.cam);
      }
    }

    /* Place floor — full width, absolute center = prev.cx + dx in px */
    var newCx = prev.cx + dx;
    state.floors.push({ cx: newCx, off: storedOff });
    state.floorsCount++;
    updateLeanStats();
    state.shake = 0.32;

    /* Population y(quality): if meter active, comboScore += mult*(2+floors/10*2); pop += floors/10 + quality */
    var bs = state.floorsCount;
    if (state.comboMeter > 0) {
      state.comboScore += state.mult * (2 + Math.floor(bs / 10) * 2);
    }
    state.pop += Math.floor(bs / 10) + q;

    state.falling = null;

    /* Camera hug tower top */
    var topScreen = towerTopWorldY() - state.cam;
    if (topScreen < H * 0.38) {
      state.camTarget += (H * 0.38 - topScreen);
    }

    /* Collapse if lean extreme */
    if (Math.abs(state.bm) > 420 || Math.abs(state.leanVis) > 0.55) {
      state.phase = "collapsing";
      spawnJumpers(6, true);
      sfxCollapse();
      state.pauseUntil = state.t + 0.85;
    } else {
      state.phase = "pause";
      state.pauseUntil = state.t + 0.16;
    }
  }

  function spawnStars(x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      var sp = 1.4 + Math.random() * 3.4;
      fx.push({
        kind: "star",
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 30 + Math.random() * 18,
        rot: Math.random() * 6,
        frame: (Math.random() * 3) | 0
      });
    }
  }
  function spawnSparkles(cx, topY) {
    for (var i = 0; i < 4; i++) {
      sparkles.push({
        x: cx + (i % 2 === 0 ? -BLOCK_W / 2 - 2 : BLOCK_W / 2 + 2),
        y: topY + BLOCK_H * 0.3 + (i < 2 ? 0 : 8),
        life: 18 + Math.random() * 10
      });
    }
  }
  function spawnJumpers(n, chute) {
    var top = towerTopWorldY() - state.cam;
    var mid = topFloor().cx;
    for (var i = 0; i < n; i++) {
      var useChute = chute && (i === 0 || Math.random() < 0.45);
      fx.push({
        kind: useChute ? "chute" : "jumper",
        x: mid + (Math.random() - 0.5) * 50,
        y: top + 6,
        vx: (Math.random() - 0.5) * 2.6 + (Math.random() < 0.5 ? -1.2 : 1.2),
        vy: -1.8 - Math.random() * 2.4,
        life: 100 + Math.random() * 50,
        swing: Math.random() * 6,
        frame: (Math.random() * 2) | 0
      });
    }
  }
  function spawnPopFloat(n) {
    fx.push({
      kind: "float",
      x: W - 70,
      y: H - 48,
      vx: 0,
      vy: -0.8,
      life: 50,
      text: "+" + n
    });
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
    } else if (state.comboMeter > -2000) {
      state.comboMeter -= dtMs;
    }

    /* Lean oscillator q(): bw += dtMs-ish; cR = cos(bw/10); bu = bv * cR >> 16 */
    state.bw = (state.bw + dtMs * 0.36) % 3600;
    var cR = Math.cos((state.bw / 10) * Math.PI / 180);
    /* bv is in JAR units; map to radians-ish lean */
    var leanTarget = (state.bv * cR) / 8000;
    /* also bias from bm */
    leanTarget += state.bm / 9000;
    state.leanVis += (leanTarget - state.leanVis) * Math.min(1, dt * 8);

    state.cam += (state.camTarget - state.cam) * Math.min(1, dt * 3.4);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

    for (var j = fx.length - 1; j >= 0; j--) {
      var p = fx[j];
      p.life -= dt * 60;
      if (p.kind === "star") {
        p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.rot += 0.22;
      } else if (p.kind === "float") {
        p.y += p.vy * 60 * dt;
      } else {
        p.x += p.vx + Math.sin(state.t * 3 + p.swing) * (p.kind === "chute" ? 0.4 : 0.12);
        p.y += p.vy;
        p.vy += p.kind === "chute" ? 0.03 : 0.17;
        p.frame = (p.frame + dt * 8) % 2;
      }
      if (p.life <= 0 || p.y > H + 50) fx.splice(j, 1);
    }
    for (var s = sparkles.length - 1; s >= 0; s--) {
      sparkles[s].life -= dt * 60;
      if (sparkles[s].life <= 0) sparkles.splice(s, 1);
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
        f.x += f.vr * 260 * dt;
        if (f.y > H + 80) {
          state.falling = null;
          if (state.lives <= 0) gameOver("机会用尽");
          else spawnHang();
        }
        return;
      }
      var landY = towerTopWorldY() - state.cam - BLOCK_H;
      if (f.y >= landY) {
        f.y = landY;
        land();
      }
    } else if (state.phase === "pause") {
      if (state.t >= state.pauseUntil) spawnHang();
    } else if (state.phase === "collapsing") {
      state.leanVis += (state.leanVis >= 0 ? 1 : -1) * 1.6 * dt;
      if (state.t >= state.pauseUntil) gameOver("大楼倒塌");
    }
  }

  /* ---------- Drawing ---------- */
  function drawSky() {
    var bands = 14;
    for (var i = 0; i < bands; i++) {
      var t = i / bands;
      /* Video-sampled blues: ~14,103,231 with vertical banding */
      var shade = (i % 2 === 0) ? 0 : 18;
      ctx.fillStyle = "rgb(" + (18 + shade) + "," + (100 + shade * 0.4) + "," + (228 - shade) + ")";
      ctx.fillRect((i / bands) * W - 0.5, 0, W / bands + 1, H);
    }
    /* faint lighter streaks */
    ctx.globalAlpha = 0.12;
    for (var k = 0; k < 6; k++) {
      ctx.fillStyle = "#c8e4ff";
      ctx.fillRect(20 + k * 58, 0, 3, H);
    }
    ctx.globalAlpha = 1;
  }

  function drawCity() {
    var ground = H - 36 + Math.min(50, (state ? state.cam : 0) * 0.04);
    /* Far lavender layer */
    var far = [
      [0, 70], [16, 110], [34, 85], [50, 150], [72, 100],
      [90, 175], [112, 120], [130, 210], [155, 140], [175, 190],
      [198, 115], [218, 165], [240, 125], [260, 200], [285, 95],
      [305, 145], [325, 175], [345, 110]
    ];
    far.forEach(function (b, idx) {
      var hh = b[1] * 0.55;
      ctx.fillStyle = idx % 3 === 0 ? "#5a5f9a" : (idx % 3 === 1 ? "#4a5088" : "#6a70a8");
      ctx.fillRect(b[0], ground - hh, 20, hh);
      if (idx === 7 || idx === 13) {
        ctx.fillRect(b[0] + 7, ground - hh - 28, 3, 28);
        ctx.beginPath();
        ctx.moveTo(b[0] + 8.5, ground - hh - 36);
        ctx.lineTo(b[0] + 4, ground - hh - 28);
        ctx.lineTo(b[0] + 13, ground - hh - 28);
        ctx.fill();
      }
    });
    /* Near cooler layer */
    ctx.globalAlpha = 0.45;
    for (var i = 0; i < 12; i++) {
      ctx.fillStyle = "#7a8eb8";
      var hh2 = 50 + (i % 4) * 22;
      ctx.fillRect(6 + i * 30, ground - hh2, 16, hh2);
    }
    ctx.globalAlpha = 1;
    /* Ground strip */
    ctx.fillStyle = "#2a3828";
    ctx.fillRect(0, ground, W, H - ground + 4);
    ctx.fillStyle = "#3a4a30";
    ctx.fillRect(0, ground, W, 3);
  }

  function drawFloorAt(cx, y, rot) {
    var x = cx - BLOCK_W / 2;
    ctx.save();
    if (rot) {
      ctx.translate(cx, y + BLOCK_H / 2);
      ctx.rotate(rot);
      ctx.translate(-cx, -(y + BLOCK_H / 2));
    }
    if (imgs.floor && imgs.floor.complete && imgs.floor.naturalWidth) {
      ctx.drawImage(imgs.floor, x, y, BLOCK_W, BLOCK_H);
    } else {
      /* Fallback paint */
      ctx.fillStyle = "#e8b048";
      ctx.fillRect(x, y, BLOCK_W, BLOCK_H);
      ctx.strokeStyle = "#1a1008";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + 1, y + 1, BLOCK_W - 2, BLOCK_H - 2);
      ctx.fillStyle = "#1e4a9a";
      var ww = (BLOCK_W - 28) / 2;
      ctx.fillRect(x + 10, y + 8, ww, BLOCK_H - 16);
      ctx.fillRect(x + 18 + ww, y + 8, ww, BLOCK_H - 16);
    }
    ctx.restore();
  }

  function drawCrane(hx, hy, holding) {
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    /* Gray hook */
    ctx.fillStyle = "#9aa3ad";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(hx - 7, hy);
    ctx.lineTo(hx + 7, hy);
    ctx.lineTo(hx + 6, hy + 7);
    ctx.lineTo(hx - 6, hy + 7);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy + 12, 6.5, -0.15, Math.PI * 0.95);
    ctx.strokeStyle = "#4a4a4a";
    ctx.lineWidth = 2.6;
    ctx.stroke();
    if (holding) {
      ctx.fillStyle = "#666";
      ctx.fillRect(hx - 2, hy + 6, 4, 9);
    }
  }

  function drawTower() {
    var cam = state.cam;
    var lean = state.leanVis;
    var shakeX = state.shake > 0 ? (Math.random() - 0.5) * 5 * state.shake : 0;
    var baseY = H - 70 - cam;
    var pivotX = W / 2 + shakeX;
    var pivotY = baseY + BLOCK_H * 0.5;

    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(lean);
    ctx.translate(-pivotX, -pivotY);

    for (var i = 0; i < state.floors.length; i++) {
      var fl = state.floors[i];
      var y = (H - 70 - BLOCK_H) - i * BLOCK_H - cam;
      if (y > H + 40 || y + BLOCK_H < -50) continue;
      /* Per-floor X already stores lean offsets; mild extra shear from height */
      var shear = (i / Math.max(1, state.floors.length)) * lean * 8;
      drawFloorAt(fl.cx + shear + shakeX, y, 0);
    }
    ctx.restore();
  }

  function drawSparkles() {
    sparkles.forEach(function (s) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.life / 12);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      var r = 4;
      ctx.beginPath();
      ctx.moveTo(s.x - r, s.y); ctx.lineTo(s.x + r, s.y);
      ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x, s.y + r);
      ctx.stroke();
      ctx.strokeStyle = "#ffe566";
      ctx.beginPath();
      ctx.moveTo(s.x - r * 0.6, s.y - r * 0.6);
      ctx.lineTo(s.x + r * 0.6, s.y + r * 0.6);
      ctx.moveTo(s.x + r * 0.6, s.y - r * 0.6);
      ctx.lineTo(s.x - r * 0.6, s.y + r * 0.6);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawFx() {
    fx.forEach(function (p) {
      if (p.kind === "star") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.life / 15);
        if (imgs.stars_sheet && imgs.stars_sheet.complete && imgs.stars_sheet.naturalWidth) {
          var fw = imgs.stars_sheet.naturalWidth / 3;
          var fi = p.frame % 3;
          ctx.drawImage(imgs.stars_sheet, fi * fw, 0, fw, imgs.stars_sheet.naturalHeight, -8, -8, 16, 16);
        } else if (imgs.stars && imgs.stars.complete) {
          ctx.drawImage(imgs.stars, -8, -8, 16, 16);
        } else {
          ctx.fillStyle = "#ffd24a";
          starPath(0, 0, 6, 2.5, 5);
          ctx.fill();
        }
        ctx.restore();
      } else if (p.kind === "chute") {
        if (imgs.chute && imgs.chute.complete && imgs.chute.naturalWidth) {
          ctx.drawImage(imgs.chute, p.x - 12, p.y - 16, 24, 30);
        } else {
          ctx.fillStyle = "#3b82f6";
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - 8, 9, 5, 0, Math.PI, 0);
          ctx.fill();
          ctx.strokeStyle = "#94a3b8";
          ctx.beginPath();
          ctx.moveTo(p.x - 7, p.y - 6);
          ctx.lineTo(p.x, p.y + 2);
          ctx.lineTo(p.x + 7, p.y - 6);
          ctx.stroke();
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(p.x - 2, p.y + 2, 4, 7);
        }
      } else if (p.kind === "jumper") {
        if (imgs.jumpers && imgs.jumpers.complete && imgs.jumpers.naturalWidth) {
          var jw = imgs.jumpers.naturalWidth / 2;
          var fi2 = (p.frame | 0) % 2;
          ctx.drawImage(imgs.jumpers, fi2 * jw, 0, jw, imgs.jumpers.naturalHeight, p.x - 10, p.y - 4, 20, 12);
        } else {
          ctx.fillStyle = "#ea580c";
          ctx.fillRect(p.x - 2, p.y, 4, 8);
        }
      } else if (p.kind === "float") {
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 20);
        ctx.fillStyle = "#ffe566";
        ctx.font = "bold 14px sans-serif";
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 3;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
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

  function drawHud() {
    if (!state) return;
    /* Top combo bar — JAR: width E/2, yellow fill, star left, xN right */
    var barW = Math.floor(W * 0.48);
    var barX = Math.floor(W / 2 - barW / 2);
    var barY = 10;
    var meterOn = state.comboMeter > 0;
    var fillW = meterOn ? Math.max(0, Math.min(barW, state.comboMeter * barW / COMBO_MAX)) : 0;

    if (meterOn) {
      /* Dark outer + yellow border (JAR colors 107,26,0 and 252,255,0) */
      ctx.fillStyle = "#6b1a00";
      ctx.fillRect(barX - 3, barY - 2, barW + 6, 12);
      ctx.strokeStyle = "#fcff00";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(barX - 2.5, barY - 1.5, barW + 5, 11);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(barX, barY, barW, 8);
      if (state.comboMeter > 5850) ctx.fillStyle = "#ffffff";
      else ctx.fillStyle = "#ffd000";
      ctx.fillRect(barX, barY + 1, fillW, 6);

      /* Star icon */
      if (imgs.stars && imgs.stars.complete && imgs.stars.naturalWidth) {
        ctx.drawImage(imgs.stars, barX - 16, barY - 8, 22, 22);
      } else {
        ctx.fillStyle = "#ffcc33";
        starPath(barX - 5, barY + 4, 8, 3.5, 5);
        ctx.fill();
      }

      if (state.mult > 1) {
        var label = "x" + state.mult;
        ctx.font = "bold 18px Arial, sans-serif";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#111";
        ctx.fillStyle = "#fff";
        ctx.strokeText(label, barX + barW + 8, barY + 10);
        ctx.fillText(label, barX + barW + 8, barY + 10);
      }
    }

    /* Bottom-left: building + floors + life segments */
    var blX = 8, blY = H - 44;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.strokeStyle = "#e8b84a";
    ctx.lineWidth = 2;
    roundRectPath(blX, blY, 78, 32, 6);
    ctx.fill(); ctx.stroke();
    if (imgs.build_icon && imgs.build_icon.complete) {
      ctx.drawImage(imgs.build_icon, blX + 4, blY + 5, 22, 22);
    }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px monospace, Arial";
    ctx.fillText(pad(state.floorsCount, 3), blX + 30, blY + 16);
    /* Life segments — short yellow bars */
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = i < state.lives ? "#f0c020" : "#333";
      ctx.fillRect(blX + 30 + i * 12, blY + 20, 10, 5);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1;
      ctx.strokeRect(blX + 30 + i * 12, blY + 20, 10, 5);
    }

    /* Bottom-right: population */
    var brX = W - 100, brY = H - 44;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.strokeStyle = "#e8b84a";
    ctx.lineWidth = 2;
    roundRectPath(brX, brY, 92, 32, 6);
    ctx.fill(); ctx.stroke();
    if (imgs.pop_icon && imgs.pop_icon.complete) {
      ctx.drawImage(imgs.pop_icon, brX + 4, brY + 4, 24, 24);
    }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px monospace, Arial";
    ctx.fillText(pad(state.pop, 5), brX + 32, brY + 21);

    /* Softkey triangles */
    ctx.fillStyle = "rgba(79,195,247,0.55)";
    tri(14, H - 6, 8);
    tri(W - 14, H - 6, 8);

    /* Hint */
    if (state.hint) {
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.hint, W / 2, H - 14);
      ctx.textAlign = "left";
    }
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function tri(cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - s, cy - s * 1.2);
    ctx.lineTo(cx + s, cy - s * 1.2);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    drawSky();
    drawCity();
    if (!state) return;

    drawTower();
    drawSparkles();

    if (state.phase === "swing" && state.hang) {
      var h = hookXY();
      drawCrane(h.x, h.y, true);
      var by = h.y + 12;
      drawFloorAt(h.x, by, state.angle * 0.12);
    } else if (state.falling) {
      var f = state.falling;
      drawCrane(W / 2 + Math.sin(state.angle) * 6, PIVOT_Y + CRANE_LEN, false);
      drawFloorAt(f.x + f.w / 2, f.y, f.rot || 0);
    } else {
      drawCrane(W / 2, PIVOT_Y + CRANE_LEN, false);
    }

    drawFx();
    drawHud();
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
    try { ensureAudio() && audioCtx.resume && audioCtx.resume(); } catch (e) {}
    resetGame();
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
