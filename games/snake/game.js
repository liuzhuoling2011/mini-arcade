(() => {
  const COLS = 20;
  const ROWS = 20;
  const BEST_KEY = "snake-neon-best";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const speedEl = document.getElementById("speed");
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalMsg = document.getElementById("modalMsg");
  const btnNew = document.getElementById("btnNew");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");

  const cell = () => canvas.width / COLS;

  let snake, dir, nextDir, food, score, best, tickMs, alive, paused, lastTick, raf, particles;

  best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = String(best);

  function randFood() {
    let p;
    do {
      p = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 };
    } while (snake.some((s) => s.x === p.x && s.y === p.y));
    return p;
  }

  function reset() {
    const mid = (COLS / 2) | 0;
    snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    dir = { x: 1, y: 0 };
    nextDir = { ...dir };
    food = randFood();
    score = 0;
    tickMs = 160;
    alive = true;
    paused = false;
    particles = [];
    lastTick = 0;
    scoreEl.textContent = "0";
    speedEl.textContent = "1";
    btnPause.textContent = "暂停";
    overlay.hidden = true;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    draw(true);
  }

  function setDir(nx, ny) {
    if (!alive || paused) return;
    // no 180° reverse
    if (nx === -dir.x && ny === -dir.y) return;
    nextDir = { x: nx, y: ny };
  }

  function bumpSpeed() {
    const level = 1 + Math.floor(score / 50);
    speedEl.textContent = String(level);
    tickMs = Math.max(70, 160 - (level - 1) * 10);
  }

  function spawnParticles(gx, gy) {
    const s = cell();
    const cx = gx * s + s / 2;
    const cy = gy * s + s / 2;
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * (1.5 + Math.random() * 2),
        vy: Math.sin(a) * (1.5 + Math.random() * 2),
        life: 1,
        color: `hsl(${160 + Math.random() * 40}, 90%, 60%)`,
      });
    }
  }

  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
      gameOver();
      return;
    }
    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      gameOver();
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = String(score);
      if (score > best) {
        best = score;
        bestEl.textContent = String(best);
        localStorage.setItem(BEST_KEY, String(best));
      }
      spawnParticles(food.x, food.y);
      food = randFood();
      bumpSpeed();
      beep(880, 0.05);
    } else {
      snake.pop();
    }
  }

  function gameOver() {
    alive = false;
    modalTitle.textContent = "游戏结束";
    modalMsg.textContent = `本局得分 ${score}${score >= best ? " · 新纪录！" : ""}`;
    overlay.hidden = false;
    beep(180, 0.18);
  }

  function togglePause() {
    if (!alive) return;
    paused = !paused;
    btnPause.textContent = paused ? "继续" : "暂停";
    if (!paused) {
      lastTick = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  // lightweight WebAudio beeps
  let audioCtx;
  function beep(freq, dur) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = 0.04;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch (_) {}
  }

  function drawGrid() {
    const s = cell();
    ctx.fillStyle = "#050812";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(52, 211, 153, 0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s + 0.5, 0);
      ctx.lineTo(i * s + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let j = 0; j <= ROWS; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * s + 0.5);
      ctx.lineTo(canvas.width, j * s + 0.5);
      ctx.stroke();
    }
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

  function draw(force) {
    drawGrid();
    const s = cell();
    const pad = Math.max(1, s * 0.08);

    // food glow
    const fx = food.x * s + s / 2;
    const fy = food.y * s + s / 2;
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 200);
    const grad = ctx.createRadialGradient(fx, fy, 2, fx, fy, s * 0.9);
    grad.addColorStop(0, `rgba(251, 191, 36, ${0.9 * pulse})`);
    grad.addColorStop(1, "rgba(251, 191, 36, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, s * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fbbf24";
    ctx.shadowColor = "#fbbf24";
    ctx.shadowBlur = 16;
    roundRect(food.x * s + pad, food.y * s + pad, s - pad * 2, s - pad * 2, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    // snake
    snake.forEach((seg, i) => {
      const t = i / Math.max(1, snake.length - 1);
      const hue = 150 + t * 40;
      const isHead = i === 0;
      ctx.fillStyle = isHead ? "#6ee7ff" : `hsl(${hue}, 85%, ${55 - t * 15}%)`;
      ctx.shadowColor = isHead ? "#22d3ee" : `hsl(${hue}, 90%, 50%)`;
      ctx.shadowBlur = isHead ? 18 : 8;
      roundRect(seg.x * s + pad, seg.y * s + pad, s - pad * 2, s - pad * 2, isHead ? 8 : 5);
      ctx.fill();
      if (isHead) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#04120c";
        const eye = s * 0.12;
        const ox = dir.x !== 0 ? dir.x * s * 0.18 : 0;
        const oy = dir.y !== 0 ? dir.y * s * 0.18 : 0;
        const cx = seg.x * s + s / 2 + ox;
        const cy = seg.y * s + s / 2 + oy;
        const px = dir.x === 0 ? s * 0.16 : 0;
        const py = dir.y === 0 ? s * 0.16 : 0;
        ctx.beginPath();
        ctx.arc(cx - px, cy - py, eye, 0, Math.PI * 2);
        ctx.arc(cx + px, cy + py, eye, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.shadowBlur = 0;

    // particles
    particles = particles.filter((p) => p.life > 0);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.04;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    if (paused && !force) {
      ctx.fillStyle = "rgba(4, 8, 18, 0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#eef3ff";
      ctx.font = "bold 28px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("暂停", canvas.width / 2, canvas.height / 2);
    }
  }

  function loop(ts) {
    if (!alive) {
      draw();
      return;
    }
    if (paused) {
      draw();
      return;
    }
    if (!lastTick) lastTick = ts;
    while (ts - lastTick >= tickMs) {
      lastTick += tickMs;
      step();
      if (!alive) break;
    }
    draw();
    raf = requestAnimationFrame(loop);
  }

  // input
  const keyMap = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], W: [0, -1], s: [0, 1], S: [0, 1], a: [-1, 0], A: [-1, 0], d: [1, 0], D: [1, 0],
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      togglePause();
      return;
    }
    const m = keyMap[e.key];
    if (m) {
      e.preventDefault();
      setDir(m[0], m[1]);
    }
  });

  document.querySelectorAll(".pad").forEach((btn) => {
    const map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const handler = (e) => {
      e.preventDefault();
      const d = map[btn.dataset.dir];
      if (d) setDir(d[0], d[1]);
    };
    btn.addEventListener("pointerdown", handler);
  });

  // swipe
  let sx = 0, sy = 0;
  canvas.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    sx = t.clientX; sy = t.clientY;
  }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
  }, { passive: true });

  btnNew.addEventListener("click", reset);
  btnRestart.addEventListener("click", reset);
  btnPause.addEventListener("click", togglePause);

  reset();

  let shellHold = false;
  let shellPausedUs = false;
  window.addEventListener("message", (ev) => {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== "arcade") return;
    if (ev.data.action === "suspend") {
      if (shellHold) return;
      shellHold = true;
      shellPausedUs = !!(alive && !paused);
      if (shellPausedUs) togglePause();
      try { if (audioCtx && audioCtx.state === "running") audioCtx.suspend(); } catch (err) {}
    } else if (ev.data.action === "resume") {
      if (!shellHold) return;
      shellHold = false;
      try { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); } catch (err) {}
      if (shellPausedUs && paused) togglePause();
      shellPausedUs = false;
    }
  });

})();
