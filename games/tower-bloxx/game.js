(function () {
  "use strict";
  /* Tower Bloxx–style stacker inspired by classic Nokia / Jamdat Tower Bloxx. */

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
  var startOverlay = document.getElementById("startOverlay");
  var endOverlay = document.getElementById("endOverlay");
  var endTitle = document.getElementById("endTitle");
  var endMsg = document.getElementById("endMsg");

  var BEST_KEY = "mini-arcade-tower-bloxx-best";
  var BLOCK_H = 36;
  var BASE_W = 160;
  var MIN_W = 28;
  var CRANE_Y = 72;
  var DROP_ZONE = 210; // world y where blocks land relative to camera — actually we use stack top

  var state = null;
  var suspended = false;
  var raf = 0;
  var sparks = [];
  var debris = [];

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

  function makeBlock(x, w, floor) {
    return {
      x: x, w: w, floor: floor,
      hue: 200 + (floor % 5) * 8,
      windows: 2 + ((floor * 3) % 4)
    };
  }

  function resetGame() {
    var base = makeBlock((W - BASE_W) / 2, BASE_W, 0);
    state = {
      phase: "swing", // swing | fall | settle | over
      stack: [base],
      cam: 0, // camera offset: increases as tower grows (world moves down)
      camTarget: 0,
      angle: 0,
      angVel: 1.55,
      amp: 78,
      falling: null,
      combo: 0,
      comboMeter: 0, // 0..1
      mult: 1,
      floors: 0,
      pop: 0,
      perfectStreak: 0,
      t: 0,
      speedScale: 1
    };
    sparks = [];
    debris = [];
    spawnSwing();
    updateHud();
  }

  function topBlock() {
    return state.stack[state.stack.length - 1];
  }

  function topWorldY() {
    // Base sits near bottom initially; each floor adds BLOCK_H upward in world (smaller y)
    // World y=0 at top of virtual space; we place base at y = H - 100 - BLOCK_H
    var baseY = H - 110 - BLOCK_H;
    return baseY - (state.stack.length - 1) * BLOCK_H;
  }

  function spawnSwing() {
    var prev = topBlock();
    var w = Math.max(MIN_W, Math.min(BASE_W, prev.w + (state.floors === 0 ? 0 : 0)));
    // keep same width as previous remaining width
    w = prev.w;
    state.falling = null;
    state.phase = "swing";
    state.swing = {
      w: w,
      floor: state.floors + 1
    };
    // slightly speed up over time
    state.speedScale = Math.min(2.1, 1 + state.floors * 0.035);
    state.amp = Math.min(110, 70 + state.floors * 1.2);
  }

  function swingX() {
    return W / 2 + Math.sin(state.angle) * state.amp;
  }

  function drop() {
    if (!state || suspended) return;
    if (state.phase !== "swing") return;
    var x = swingX() - state.swing.w / 2;
    state.falling = {
      x: x,
      y: CRANE_Y + 28,
      w: state.swing.w,
      vy: 0,
      floor: state.swing.floor,
      rot: 0,
      vr: 0
    };
    state.phase = "fall";
    hintEl.textContent = "";
  }

  function perfectThreshold(w) {
    return Math.max(4, w * 0.06);
  }

  function land() {
    var prev = topBlock();
    var f = state.falling;
    var prevLeft = prev.x;
    var prevRight = prev.x + prev.w;
    var left = f.x;
    var right = f.x + f.w;
    var overlapL = Math.max(left, prevLeft);
    var overlapR = Math.min(right, prevRight);
    var overlap = overlapR - overlapL;

    if (overlap < MIN_W * 0.55) {
      // miss — tumble off
      f.vr = (left + f.w / 2 < prev.x + prev.w / 2) ? -0.12 : 0.12;
      f.vy = 2;
      state.phase = "miss";
      spawnDebris(f);
      return;
    }

    var newW = overlap;
    var newX = overlapL;
    var dx = Math.abs((left + f.w / 2) - (prev.x + prev.w / 2));
    var perfect = dx <= perfectThreshold(prev.w);

    if (perfect) {
      // snap to previous for clean stack
      newX = prev.x;
      newW = prev.w;
      state.perfectStreak++;
      state.comboMeter = Math.min(1, state.comboMeter + 0.22);
      state.combo++;
      bumpMult();
      burstSparks(prev.x + prev.w / 2, topWorldY() - state.cam, true);
    } else {
      state.perfectStreak = 0;
      state.comboMeter = Math.max(0, state.comboMeter - 0.12);
      if (state.comboMeter < 0.05) state.mult = 1;
      // cut overhang — already using overlap
      burstSparks(overlapL + newW / 2, topWorldY() - state.cam, false);
      // falling scraps
      if (left < overlapL) spawnScrap(left, overlapL - left, -1);
      if (right > overlapR) spawnScrap(overlapR, right - overlapR, 1);
    }

    var blk = makeBlock(newX, newW, state.floors + 1);
    state.stack.push(blk);
    state.floors++;
    var gained = Math.round((newW / BASE_W) * 18 * state.mult * (perfect ? 1.35 : 1));
    gained = Math.max(1, gained);
    state.pop += gained;

    state.falling = null;
    state.phase = "settle";

    // camera up
    var topScreen = topWorldY() - state.cam;
    if (topScreen < H * 0.42) {
      state.camTarget = state.cam + (H * 0.42 - topScreen);
    }

    updateHud();
    setTimeout(function () {
      if (!state || state.phase === "over") return;
      spawnSwing();
    }, 180);
  }

  function bumpMult() {
    if (state.comboMeter >= 0.999) {
      state.mult = Math.min(12, state.mult + 1);
      state.comboMeter = 0.35;
    } else if (state.perfectStreak >= 2 && state.mult < 2) {
      state.mult = 2;
    }
    // map combo streak loosely to mult display
    var m = 1 + Math.floor(state.comboMeter * 3) + Math.min(8, Math.floor(state.perfectStreak / 2));
    state.mult = Math.min(12, Math.max(state.mult, m));
  }

  function spawnDebris(f) {
    for (var i = 0; i < 8; i++) {
      debris.push({
        x: f.x + Math.random() * f.w,
        y: f.y,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 3,
        life: 40 + Math.random() * 20,
        c: "#f59e0b"
      });
    }
  }
  function spawnScrap(x, w, dir) {
    debris.push({
      x: x + w / 2, y: topWorldY() - state.cam,
      vx: dir * (2 + Math.random() * 2),
      vy: -1 - Math.random(),
      life: 50, w: w, h: BLOCK_H * 0.7,
      scrap: true, c: "#38bdf8"
    });
  }
  function burstSparks(x, y, perfect) {
    var n = perfect ? 14 : 8;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 1.5 + Math.random() * 3;
      sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 18 + Math.random() * 12,
        perfect: perfect
      });
    }
  }

  function gameOver() {
    state.phase = "over";
    var best = loadBest();
    if (state.pop > best) {
      saveBest(state.pop);
      best = state.pop;
    }
    bestEl.textContent = String(best);
    endTitle.textContent = state.floors >= 1 ? "大楼倒塌" : "没接住";
    endMsg.textContent = "盖了 " + state.floors + " 层，人口 " + state.pop + "。最高人口 " + best + "。";
    endOverlay.hidden = false;
    updateHud();
  }

  function updateHud() {
    if (!state) return;
    comboFill.style.width = Math.round(state.comboMeter * 100) + "%";
    multEl.textContent = "x" + state.mult;
    floorsEl.textContent = pad(state.floors, 3);
    popEl.textContent = pad(state.pop, 5);
  }

  function tick(dt) {
    if (!state || suspended || state.phase === "over") return;
    state.t += dt;
    state.cam += (state.camTarget - state.cam) * Math.min(1, dt * 4);

    // particles
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vy += 0.15; s.life--;
      if (s.life <= 0) sparks.splice(i, 1);
    }
    for (var j = debris.length - 1; j >= 0; j--) {
      var d = debris[j];
      d.x += d.vx; d.y += d.vy; d.vy += 0.25; d.life--;
      if (d.life <= 0 || d.y > H + 40) debris.splice(j, 1);
    }

    if (state.phase === "swing") {
      state.angle += state.angVel * state.speedScale * dt;
    } else if (state.phase === "fall" || state.phase === "miss") {
      var f = state.falling;
      if (!f) return;
      f.vy += 420 * dt;
      f.y += f.vy * dt;
      if (state.phase === "miss") {
        f.rot += f.vr;
        f.x += f.vr * 40 * dt * 10;
        if (f.y > H + 80) gameOver();
        return;
      }
      var landY = topWorldY() - state.cam - BLOCK_H;
      if (f.y >= landY) {
        f.y = landY;
        land();
      }
    }
  }

  // ---- drawing ----
  function drawSky() {
    // vertical stripe sky like the Nokia title
    var bands = 14;
    for (var i = 0; i < bands; i++) {
      var x = (i / bands) * W;
      ctx.fillStyle = i % 2 === 0 ? "#4a7ec8" : "#3d6eb8";
      ctx.fillRect(x, 0, W / bands + 1, H);
    }
    // darker vignette top
    var g = ctx.createLinearGradient(0, 0, 0, H * 0.35);
    g.addColorStop(0, "rgba(20,40,80,0.35)");
    g.addColorStop(1, "rgba(20,40,80,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.35);
  }

  function drawSkyline() {
    var cam = state ? state.cam : 0;
    var ground = H - 70 + Math.min(40, cam * 0.02);
    ctx.fillStyle = "#2a4570";
    // silhouette buildings
    var buildings = [
      [10, 120], [40, 160], [70, 100], [95, 200], [130, 140],
      [165, 220], [200, 160], [230, 280], [260, 180], [295, 240],
      [330, 150], [360, 200]
    ];
    buildings.forEach(function (b, i) {
      var bh = b[1] * 0.55;
      var bx = b[0];
      ctx.fillStyle = i % 3 === 0 ? "#243d66" : "#2c4a78";
      ctx.fillRect(bx, ground - bh, 28, bh);
      // CN tower-ish
      if (i === 7) {
        ctx.fillRect(bx + 10, ground - bh - 50, 6, 50);
        ctx.beginPath();
        ctx.arc(bx + 13, ground - bh - 54, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.fillStyle = "#1e355c";
    ctx.fillRect(0, ground, W, H - ground);
  }

  function drawBlock(x, y, w, h, floor, tilt) {
    ctx.save();
    if (tilt) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(tilt);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    // body
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "#5ec8e8");
    g.addColorStop(0.5, "#2aa9d4");
    g.addColorStop(1, "#1a87b0");
    ctx.fillStyle = g;
    roundRect(x, y, w, h, 3);
    ctx.fill();
    // orange frame
    ctx.strokeStyle = "#f0a020";
    ctx.lineWidth = 3;
    roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 2);
    ctx.stroke();
    // top ledge
    ctx.fillStyle = "#f5c24a";
    ctx.fillRect(x, y, w, 5);
    // windows
    var cols = Math.max(2, Math.min(6, Math.floor(w / 22)));
    var padX = 6;
    var ww = (w - padX * 2 - (cols - 1) * 4) / cols;
    var wh = h - 14;
    for (var c = 0; c < cols; c++) {
      var wx = x + padX + c * (ww + 4);
      ctx.fillStyle = "#0b3a55";
      roundRect(wx, y + 8, ww, wh - 2, 2);
      ctx.fill();
      ctx.fillStyle = "rgba(180,230,255,0.35)";
      ctx.fillRect(wx + 1, y + 9, ww * 0.35, wh * 0.4);
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

  function drawCrane(hookX, hookY, holding) {
    // cable from top
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(hookX, hookY);
    ctx.stroke();
    // hook
    ctx.fillStyle = "#c0c0c0";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hookX, hookY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hookX - 8, hookY + 4);
    ctx.quadraticCurveTo(hookX - 10, hookY + 16, hookX, hookY + 14);
    ctx.quadraticCurveTo(hookX + 10, hookY + 16, hookX + 8, hookY + 4);
    ctx.stroke();
    if (holding) {
      // small connector
      ctx.fillStyle = "#888";
      ctx.fillRect(hookX - 3, hookY + 10, 6, 8);
    }
  }

  function draw() {
    drawSky();
    drawSkyline();

    if (!state) {
      return;
    }

    var cam = state.cam;

    // stack
    for (var i = 0; i < state.stack.length; i++) {
      var b = state.stack[i];
      var by = (H - 110 - BLOCK_H) - i * BLOCK_H - cam;
      if (by > H + 20 || by + BLOCK_H < -20) continue;
      drawBlock(b.x, by, b.w, BLOCK_H, b.floor, 0);
    }

    // swinging / falling
    if (state.phase === "swing" && state.swing) {
      var hx = swingX();
      var hy = CRANE_Y;
      drawCrane(hx, hy, true);
      var bx = hx - state.swing.w / 2;
      var by = hy + 18;
      drawBlock(bx, by, state.swing.w, BLOCK_H, state.swing.floor, Math.sin(state.angle) * 0.04);
    } else if (state.falling) {
      var f = state.falling;
      drawCrane(W / 2 + Math.sin(state.angle) * state.amp * 0.15, CRANE_Y, false);
      drawBlock(f.x, f.y, f.w, BLOCK_H, f.floor, f.rot || 0);
    } else {
      drawCrane(W / 2, CRANE_Y, false);
    }

    // sparks
    sparks.forEach(function (s) {
      ctx.fillStyle = s.perfect ? "#fde68a" : "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 4);
      ctx.lineTo(s.x + 3, s.y);
      ctx.lineTo(s.x, s.y + 4);
      ctx.lineTo(s.x - 3, s.y);
      ctx.closePath();
      ctx.fill();
    });
    debris.forEach(function (d) {
      ctx.fillStyle = d.c || "#f59e0b";
      if (d.scrap) {
        ctx.fillRect(d.x - d.w / 2, d.y, d.w, d.h || 10);
      } else {
        ctx.fillRect(d.x, d.y, 4, 4);
      }
    });
  }

  var last = 0;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    var dt = Math.min(0.033, (ts - last) / 1000);
    last = ts;
    tick(dt);
    draw();
  }

  function onAction(e) {
    if (e) e.preventDefault();
    if (startOverlay && !startOverlay.hidden) return;
    if (endOverlay && !endOverlay.hidden) return;
    drop();
  }

  canvas.addEventListener("pointerdown", onAction);
  window.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.key === " " || e.key === "Enter") onAction(e);
  });

  document.getElementById("btnStart").addEventListener("click", function () {
    startOverlay.hidden = true;
    endOverlay.hidden = true;
    resetGame();
    hintEl.textContent = "点屏幕 / 空格 放下";
  });
  document.getElementById("btnAgain").addEventListener("click", function () {
    endOverlay.hidden = true;
    resetGame();
    hintEl.textContent = "点屏幕 / 空格 放下";
  });

  window.addEventListener("message", function (ev) {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== "arcade") return;
    if (ev.data.action === "suspend") suspended = true;
    else if (ev.data.action === "resume") suspended = false;
  });

  bestEl.textContent = String(loadBest());
  // preview draw
  drawSky();
  drawSkyline();
  requestAnimationFrame(loop);
})();
