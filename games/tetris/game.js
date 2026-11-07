(() => {
  const COLS = 10;
  const ROWS = 20;
  const BEST_KEY = "tetris-neon-best";

  const COLORS = {
    I: "#22d3ee",
    O: "#fbbf24",
    T: "#a78bfa",
    S: "#34d399",
    Z: "#fb7185",
    J: "#60a5fa",
    L: "#fb923c",
  };

  // each shape: rotations as arrays of [x,y] relative cells
  const SHAPES = {
    I: [
      [[0,1],[1,1],[2,1],[3,1]],
      [[2,0],[2,1],[2,2],[2,3]],
      [[0,2],[1,2],[2,2],[3,2]],
      [[1,0],[1,1],[1,2],[1,3]],
    ],
    O: [
      [[1,0],[2,0],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[2,1]],
    ],
    T: [
      [[1,0],[0,1],[1,1],[2,1]],
      [[1,0],[1,1],[2,1],[1,2]],
      [[0,1],[1,1],[2,1],[1,2]],
      [[1,0],[0,1],[1,1],[1,2]],
    ],
    S: [
      [[1,0],[2,0],[0,1],[1,1]],
      [[1,0],[1,1],[2,1],[2,2]],
      [[1,1],[2,1],[0,2],[1,2]],
      [[0,0],[0,1],[1,1],[1,2]],
    ],
    Z: [
      [[0,0],[1,0],[1,1],[2,1]],
      [[2,0],[1,1],[2,1],[1,2]],
      [[0,1],[1,1],[1,2],[2,2]],
      [[1,0],[0,1],[1,1],[0,2]],
    ],
    J: [
      [[0,0],[0,1],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[1,2]],
      [[0,1],[1,1],[2,1],[2,2]],
      [[1,0],[1,1],[0,2],[1,2]],
    ],
    L: [
      [[2,0],[0,1],[1,1],[2,1]],
      [[1,0],[1,1],[1,2],[2,2]],
      [[0,1],[1,1],[2,1],[0,2]],
      [[0,0],[1,0],[1,1],[1,2]],
    ],
  };
  const TYPES = Object.keys(SHAPES);

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const nextCanvas = document.getElementById("next");
  const nctx = nextCanvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const levelEl = document.getElementById("level");
  const linesEl = document.getElementById("lines");
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalMsg = document.getElementById("modalMsg");
  const btnNew = document.getElementById("btnNew");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");

  const cellW = () => canvas.width / COLS;
  const cellH = () => canvas.height / ROWS;

  let board, piece, nextType, score, best, lines, level, dropMs, alive, paused;
  let lastDrop, raf, bag, flashRows, flashUntil;

  best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = String(best);

  function emptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function nextFromBag() {
    if (!bag.length) {
      bag = TYPES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  function spawn(type) {
    return {
      type,
      rot: 0,
      x: 3,
      y: 0,
    };
  }

  function cellsOf(p) {
    return SHAPES[p.type][p.rot].map(([x, y]) => ({ x: p.x + x, y: p.y + y }));
  }

  function collides(p) {
    return cellsOf(p).some(({ x, y }) => {
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y < 0) return false;
      return !!board[y][x];
    });
  }

  function lockPiece() {
    cellsOf(piece).forEach(({ x, y }) => {
      if (y >= 0 && y < ROWS) board[y][x] = piece.type;
    });
    clearLines();
    piece = spawn(nextType);
    nextType = nextFromBag();
    drawNext();
    if (collides(piece)) gameOver();
  }

  function clearLines() {
    const full = [];
    for (let y = 0; y < ROWS; y++) {
      if (board[y].every((c) => c)) full.push(y);
    }
    if (!full.length) return;
    flashRows = full;
    flashUntil = performance.now() + 120;
    const n = full.length;
    const points = [0, 100, 300, 500, 800][n] * level;
    score += points;
    lines += n;
    level = 1 + Math.floor(lines / 10);
    dropMs = Math.max(80, 800 - (level - 1) * 60);
    scoreEl.textContent = String(score);
    linesEl.textContent = String(lines);
    levelEl.textContent = String(level);
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      localStorage.setItem(BEST_KEY, String(best));
    }
    // remove after flash
    setTimeout(() => {
      board = board.filter((_, y) => !full.includes(y));
      while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
      flashRows = [];
      beep(660 + n * 80, 0.08);
    }, 120);
  }

  function softDrop() {
    if (!alive || paused) return;
    const n = { ...piece, y: piece.y + 1 };
    if (!collides(n)) {
      piece = n;
      score += 1;
      scoreEl.textContent = String(score);
    } else {
      lockPiece();
    }
  }

  function hardDrop() {
    if (!alive || paused) return;
    let n = { ...piece };
    let dist = 0;
    while (!collides({ ...n, y: n.y + 1 })) {
      n.y++;
      dist++;
    }
    piece = n;
    score += dist * 2;
    scoreEl.textContent = String(score);
    lockPiece();
    beep(420, 0.05);
  }

  function move(dx) {
    if (!alive || paused) return;
    const n = { ...piece, x: piece.x + dx };
    if (!collides(n)) piece = n;
  }

  function rotate() {
    if (!alive || paused) return;
    const n = { ...piece, rot: (piece.rot + 1) % 4 };
    // wall kicks
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      const t = { ...n, x: n.x + k };
      if (!collides(t)) {
        piece = t;
        return;
      }
    }
  }

  function ghostY() {
    let g = { ...piece };
    while (!collides({ ...g, y: g.y + 1 })) g.y++;
    return g;
  }

  function reset() {
    board = emptyBoard();
    bag = [];
    nextType = nextFromBag();
    piece = spawn(nextFromBag());
    score = 0;
    lines = 0;
    level = 1;
    dropMs = 800;
    alive = true;
    paused = false;
    flashRows = [];
    lastDrop = 0;
    scoreEl.textContent = "0";
    linesEl.textContent = "0";
    levelEl.textContent = "1";
    btnPause.textContent = "暂停";
    overlay.hidden = true;
    drawNext();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function gameOver() {
    alive = false;
    modalTitle.textContent = "游戏结束";
    modalMsg.textContent = `本局得分 ${score} · 消行 ${lines}${score >= best ? " · 新纪录！" : ""}`;
    overlay.hidden = false;
    beep(160, 0.2);
  }

  function togglePause() {
    if (!alive) return;
    paused = !paused;
    btnPause.textContent = paused ? "继续" : "暂停";
    if (!paused) {
      lastDrop = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  let audioCtx;
  function beep(freq, dur) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.value = 0.03;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch (_) {}
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawCell(c, x, y, w, h, color, alpha = 1) {
    c.save();
    c.globalAlpha = alpha;
    const pad = Math.max(1, w * 0.06);
    c.shadowColor = color;
    c.shadowBlur = 10;
    c.fillStyle = color;
    roundRect(c, x + pad, y + pad, w - pad * 2, h - pad * 2, 4);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = "rgba(255,255,255,0.22)";
    roundRect(c, x + pad, y + pad, w - pad * 2, (h - pad * 2) * 0.35, 3);
    c.fill();
    c.restore();
  }

  function drawBoard() {
    const w = cellW();
    const h = cellH();
    ctx.fillStyle = "#050812";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid
    ctx.strokeStyle = "rgba(167, 139, 250, 0.07)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w + 0.5, 0);
      ctx.lineTo(i * w + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let j = 0; j <= ROWS; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * h + 0.5);
      ctx.lineTo(canvas.width, j * h + 0.5);
      ctx.stroke();
    }

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = board[y][x];
        if (!t) continue;
        const flashing = flashRows && flashRows.includes(y);
        drawCell(ctx, x * w, y * h, w, h, flashing ? "#fff" : COLORS[t], flashing ? 0.95 : 1);
      }
    }

    if (alive && piece) {
      const g = ghostY();
      cellsOf(g).forEach(({ x, y }) => {
        if (y < 0) return;
        drawCell(ctx, x * w, y * h, w, h, COLORS[piece.type], 0.18);
      });
      cellsOf(piece).forEach(({ x, y }) => {
        if (y < 0) return;
        drawCell(ctx, x * w, y * h, w, h, COLORS[piece.type], 1);
      });
    }

    if (paused) {
      ctx.fillStyle = "rgba(4, 8, 18, 0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#eef3ff";
      ctx.font = "bold 28px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("暂停", canvas.width / 2, canvas.height / 2);
    }
  }

  function drawNext() {
    const size = nextCanvas.width;
    nctx.clearRect(0, 0, size, size);
    nctx.fillStyle = "rgba(0,0,0,0.25)";
    nctx.fillRect(0, 0, size, size);
    if (!nextType) return;
    const cells = SHAPES[nextType][0];
    let minX = 99, minY = 99, maxX = -99, maxY = -99;
    cells.forEach(([x, y]) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    });
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const cs = Math.min(28, (size - 24) / Math.max(bw, bh));
    const ox = (size - bw * cs) / 2 - minX * cs;
    const oy = (size - bh * cs) / 2 - minY * cs;
    cells.forEach(([x, y]) => {
      drawCell(nctx, ox + x * cs, oy + y * cs, cs, cs, COLORS[nextType], 1);
    });
  }

  function loop(ts) {
    if (!alive) {
      drawBoard();
      return;
    }
    if (paused) {
      drawBoard();
      return;
    }
    if (!lastDrop) lastDrop = ts;
    while (ts - lastDrop >= dropMs) {
      lastDrop += dropMs;
      const n = { ...piece, y: piece.y + 1 };
      if (!collides(n)) piece = n;
      else lockPiece();
      if (!alive) break;
    }
    drawBoard();
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "p" || k === "P") {
      e.preventDefault();
      togglePause();
      return;
    }
    if (k === " " || e.code === "Space") {
      e.preventDefault();
      hardDrop();
      return;
    }
    if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); move(-1); }
    else if (k === "ArrowRight" || k === "d" || k === "D") { e.preventDefault(); move(1); }
    else if (k === "ArrowDown" || k === "s" || k === "S") { e.preventDefault(); softDrop(); }
    else if (k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); rotate(); }
  });

  document.querySelectorAll(".pad").forEach((btn) => {
    const act = btn.dataset.act;
    const handler = (e) => {
      e.preventDefault();
      if (act === "left") move(-1);
      else if (act === "right") move(1);
      else if (act === "down") softDrop();
      else if (act === "rot") rotate();
      else if (act === "drop") hardDrop();
    };
    btn.addEventListener("pointerdown", handler);
  });

  // swipe / tap on board
  let sx = 0, sy = 0, st = 0;
  canvas.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    const dt = Date.now() - st;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      if (dt < 250) rotate();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
    else if (dy > 0) {
      if (dy > 80) hardDrop();
      else softDrop();
    }
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
