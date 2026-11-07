(() => {
  "use strict";

  const SIZE = 4;
  const BEST_KEY = "neon2048-best";
  const MOVE_MS = 150;

  const boardEl = document.getElementById("board");
  const gridBg = document.getElementById("gridBg");
  const tilesEl = document.getElementById("tiles");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const scoreDeltaEl = document.getElementById("scoreDelta");
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalMsg = document.getElementById("modalMsg");
  const btnContinue = document.getElementById("btnContinue");
  const btnRestart = document.getElementById("btnRestart");
  const btnNew = document.getElementById("btnNew");

  /** @type {number[][]} */
  let grid = [];
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let won = false;
  let keepPlaying = false;
  let over = false;
  let animating = false;
  let shellHold = false;
  let tileIdSeq = 1;
  /** @type {Map<number, HTMLElement>} */
  const tileNodes = new Map();
  /** @type {{id:number, r:number, c:number, v:number}[]} */
  let tiles = [];

  bestEl.textContent = String(best);

  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    gridBg.appendChild(cell);
  }

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function metrics() {
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 12;
    const boardW = boardEl.clientWidth - gap * 2;
    const cell = (boardW - gap * (SIZE - 1)) / SIZE;
    return { gap, cell, step: cell + gap };
  }

  function applyTileGeometry(el, r, c, m = metrics()) {
    el.style.width = `${m.cell}px`;
    el.style.height = `${m.cell}px`;
    el.style.transform = `translate(${c * m.step}px, ${r * m.step}px)`;
  }

  function valueClass(v) {
    return v >= 65536 ? "v65536" : `v${v}`;
  }

  function createTileEl(tile, { spawn = false, pop = false } = {}) {
    const el = document.createElement("div");
    el.className = `tile ${valueClass(tile.v)}`;
    el.dataset.id = String(tile.id);
    const inner = document.createElement("div");
    inner.className = "tile-inner" + (spawn ? " spawn" : "") + (pop ? " pop" : "");
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = String(tile.v);
    inner.appendChild(num);
    el.appendChild(inner);
    // Set position BEFORE insert so the first paint is already correct (no 0,0 flash).
    applyTileGeometry(el, tile.r, tile.c);
    tilesEl.appendChild(el);
    tileNodes.set(tile.id, el);
    if (spawn || pop) {
      const clear = () => inner.classList.remove("spawn", "pop");
      inner.addEventListener("animationend", clear, { once: true });
      setTimeout(clear, 220);
    }
    return el;
  }

  function syncTileEl(tile, { pop = false } = {}) {
    let el = tileNodes.get(tile.id);
    if (!el) {
      createTileEl(tile, { pop });
      return;
    }
    el.className = `tile ${valueClass(tile.v)}`;
    const inner = el.querySelector(".tile-inner");
    const num = el.querySelector(".num");
    if (num) num.textContent = String(tile.v);
    applyTileGeometry(el, tile.r, tile.c);
    if (pop && inner) {
      inner.classList.remove("spawn", "pop");
      void inner.offsetWidth;
      inner.classList.add("pop");
      const clear = () => inner.classList.remove("pop");
      inner.addEventListener("animationend", clear, { once: true });
      setTimeout(clear, 220);
    }
  }

  function rebuildFromGrid(spawnIds = new Set(), mergeIds = new Set()) {
    tilesEl.innerHTML = "";
    tileNodes.clear();
    tiles = [];
    const m = metrics();
    document.documentElement.style.setProperty("--cell-size", `${m.cell}px`);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        if (!v) continue;
        const id = tileIdSeq++;
        const tile = { id, r, c, v };
        tiles.push(tile);
        createTileEl(tile, {
          spawn: spawnIds.has(`${r},${c}`),
          pop: mergeIds.has(`${r},${c}`),
        });
      }
    }
  }

  function randomEmpty() {
    const empties = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) empties.push([r, c]);
      }
    }
    if (!empties.length) return null;
    return empties[(Math.random() * empties.length) | 0];
  }

  function spawnTile() {
    const pos = randomEmpty();
    if (!pos) return null;
    const [r, c] = pos;
    const v = Math.random() < 0.9 ? 2 : 4;
    grid[r][c] = v;
    return { r, c, v };
  }

  function showScoreDelta(n) {
    if (!n) return;
    scoreDeltaEl.hidden = false;
    scoreDeltaEl.textContent = `+${n}`;
    scoreDeltaEl.style.animation = "none";
    void scoreDeltaEl.offsetWidth;
    scoreDeltaEl.style.animation = "";
    clearTimeout(showScoreDelta._t);
    showScoreDelta._t = setTimeout(() => {
      scoreDeltaEl.hidden = true;
    }, 700);
  }

  function setScore(n, delta = 0) {
    score = n;
    scoreEl.textContent = String(score);
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      localStorage.setItem(BEST_KEY, String(best));
    }
    if (delta) showScoreDelta(delta);
  }

  function canMove() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) return true;
        const v = grid[r][c];
        if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
        if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  function hideOverlay() {
    overlay.hidden = true;
    btnContinue.hidden = true;
  }

  function showWin() {
    won = true;
    modalTitle.textContent = "太棒了！";
    modalMsg.textContent = "你合成了 2048！要不要继续冲击更高分？";
    btnContinue.hidden = false;
    btnRestart.textContent = "再来一局";
    overlay.hidden = false;
    playTone(880, 0.08, "triangle");
    setTimeout(() => playTone(1175, 0.12, "triangle"), 90);
  }

  function showGameOver() {
    over = true;
    modalTitle.textContent = "游戏结束";
    modalMsg.textContent = `本局得分 ${score}。再试一次，冲击新纪录！`;
    btnContinue.hidden = true;
    btnRestart.textContent = "再来一局";
    overlay.hidden = false;
    playTone(180, 0.18, "sawtooth");
  }

  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      audioCtx = null;
    }
    return audioCtx;
  }
  function playTone(freq, dur, type = "sine") {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  function slideLine(line) {
    const filtered = line.filter((v) => v !== 0);
    const out = [];
    let gained = 0;
    let i = 0;
    while (i < filtered.length) {
      if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
        const val = filtered[i] * 2;
        out.push(val);
        gained += val;
        i += 2;
      } else {
        out.push(filtered[i]);
        i += 1;
      }
    }
    while (out.length < SIZE) out.push(0);
    const moved = out.some((v, idx) => v !== line[idx]);
    return { line: out, moved, gained };
  }

  function vectors(dir) {
    if (dir === "left") {
      return {
        getLine: (i) => grid[i].slice(),
        setLine: (i, line) => { grid[i] = line; },
        mapPos: (i, j) => ({ r: i, c: j }),
      };
    }
    if (dir === "right") {
      return {
        getLine: (i) => grid[i].slice().reverse(),
        setLine: (i, line) => { grid[i] = line.slice().reverse(); },
        mapPos: (i, j) => ({ r: i, c: SIZE - 1 - j }),
      };
    }
    if (dir === "up") {
      return {
        getLine: (i) => [grid[0][i], grid[1][i], grid[2][i], grid[3][i]],
        setLine: (i, line) => {
          for (let r = 0; r < SIZE; r++) grid[r][i] = line[r];
        },
        mapPos: (i, j) => ({ r: j, c: i }),
      };
    }
    return {
      getLine: (i) => [grid[3][i], grid[2][i], grid[1][i], grid[0][i]],
      setLine: (i, line) => {
        for (let r = 0; r < SIZE; r++) grid[3 - r][i] = line[r];
      },
      mapPos: (i, j) => ({ r: SIZE - 1 - j, c: i }),
    };
  }

  /**
   * Track each occupied cell's tile id so we can animate existing DOM nodes.
   * @returns {{id:number,r:number,c:number,v:number}[][]}
   */
  function occupancyByCell() {
    /** @type {({id:number,r:number,c:number,v:number}|null)[][]} */
    const map = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (const t of tiles) map[t.r][t.c] = t;
    return map;
  }

  /**
   * Plan which live tiles slide where, and which become merges.
   * Returns moves for existing tiles + final tile list after move (before spawn).
   */
  function planMoves(dir) {
    const meta = vectors(dir);
    const occ = occupancyByCell();
    /** @type {{tile:any, toR:number, toC:number, mergePartner?:any, isMergeResult?:boolean, newValue?:number}[]} */
    const moves = [];
    /** @type {{id:number, r:number, c:number, v:number, merged?:boolean}[]} */
    const nextTiles = [];
    const mergeMarks = new Set();

    for (let i = 0; i < SIZE; i++) {
      const sources = [];
      for (let j = 0; j < SIZE; j++) {
        const p = meta.mapPos(i, j);
        const t = occ[p.r][p.c];
        if (t) sources.push(t);
      }

      let idx = 0;
      let outJ = 0;
      while (idx < sources.length) {
        const a = sources[idx];
        const dest = meta.mapPos(i, outJ);
        if (idx + 1 < sources.length && sources[idx + 1].v === a.v) {
          const b = sources[idx + 1];
          const newVal = a.v * 2;
          // Both tiles slide to dest; a survives as merged result, b is removed after.
          moves.push({ tile: a, toR: dest.r, toC: dest.c, mergePartner: b, isSurvivor: true, newValue: newVal });
          moves.push({ tile: b, toR: dest.r, toC: dest.c, mergePartner: a, isSurvivor: false });
          nextTiles.push({ id: a.id, r: dest.r, c: dest.c, v: newVal, merged: true });
          mergeMarks.add(`${dest.r},${dest.c}`);
          idx += 2;
          outJ += 1;
        } else {
          moves.push({ tile: a, toR: dest.r, toC: dest.c, isSurvivor: true });
          nextTiles.push({ id: a.id, r: dest.r, c: dest.c, v: a.v });
          idx += 1;
          outJ += 1;
        }
      }
    }
    return { moves, nextTiles, mergeMarks };
  }

  function move(dir) {
    if (shellHold || animating || over) return;
    if (won && !keepPlaying) return;

    const prevGrid = grid.map((row) => row.slice());
    const v = vectors(dir);
    let anyMoved = false;
    let gained = 0;

    for (let i = 0; i < SIZE; i++) {
      const before = v.getLine(i);
      const result = slideLine(before);
      if (result.moved) anyMoved = true;
      gained += result.gained;
      v.setLine(i, result.line);
    }

    if (!anyMoved) {
      grid = prevGrid;
      return;
    }

    animating = true;
    setScore(score + gained, gained);
    if (gained) playTone(520 + Math.min(400, gained / 2), 0.05, "sine");
    else playTone(320, 0.03, "sine");

    // Recompute plan from previous occupancy against the already-updated grid logic
    // Restore prev grid briefly only for planning from current tiles[] which still
    // reflect the old layout — planMoves uses tiles[], not grid.
    const { moves, nextTiles, mergeMarks } = planMoves(dir);
    // grid already holds the post-move values from slideLine above.

    const m = metrics();
    document.documentElement.style.setProperty("--cell-size", `${m.cell}px`);

    // Disable transition briefly? No — we want transition ON for the slide.
    // Ensure tiles have transition, then update transforms.
    for (const mv of moves) {
      const el = tileNodes.get(mv.tile.id);
      if (!el) continue;
      el.style.transition = `transform ${MOVE_MS}ms ease-in-out`;
      // Merging tiles that die go slightly under the survivor
      if (mv.isSurvivor === false) el.style.zIndex = "2";
      else if (mv.mergePartner) el.style.zIndex = "3";
      applyTileGeometry(el, mv.toR, mv.toC, m);
    }

    setTimeout(() => {
      // Remove non-survivor merge partners
      for (const mv of moves) {
        if (mv.isSurvivor === false) {
          const el = tileNodes.get(mv.tile.id);
          if (el) el.remove();
          tileNodes.delete(mv.tile.id);
        }
      }

      // Update survivors (value + pop) and refresh tiles list
      tiles = [];
      for (const t of nextTiles) {
        tiles.push({ id: t.id, r: t.r, c: t.c, v: t.v });
        const el = tileNodes.get(t.id);
        if (!el) {
          createTileEl(t, { pop: !!t.merged });
          continue;
        }
        el.style.zIndex = "";
        el.className = `tile ${valueClass(t.v)}`;
        const num = el.querySelector(".num");
        if (num) num.textContent = String(t.v);
        applyTileGeometry(el, t.r, t.c, m);
        if (t.merged) {
          const inner = el.querySelector(".tile-inner");
          if (inner) {
            inner.classList.remove("spawn", "pop");
            void inner.offsetWidth;
            inner.classList.add("pop");
            const clear = () => inner.classList.remove("pop");
            inner.addEventListener("animationend", clear, { once: true });
            setTimeout(clear, 220);
          }
        }
      }

      // Spawn new tile without wiping the board
      const spawned = spawnTile();
      if (spawned) {
        const id = tileIdSeq++;
        const tile = { id, r: spawned.r, c: spawned.c, v: spawned.v };
        tiles.push(tile);
        createTileEl(tile, { spawn: true });
      }

      animating = false;

      let hit2048 = false;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (grid[r][c] === 2048) hit2048 = true;
        }
      }
      if (hit2048 && !won) {
        showWin();
        return;
      }
      if (!canMove()) showGameOver();
    }, MOVE_MS + 12);
  }

  function newGame() {
    hideOverlay();
    grid = emptyGrid();
    score = 0;
    setScore(0);
    won = false;
    keepPlaying = false;
    over = false;
    animating = false;
    tiles = [];
    tileNodes.clear();
    tilesEl.innerHTML = "";
    spawnTile();
    spawnTile();
    const spawnSet = new Set();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c]) spawnSet.add(`${r},${c}`);
      }
    }
    rebuildFromGrid(spawnSet, new Set());
    playTone(640, 0.05, "triangle");
    boardEl.focus({ preventScroll: true });
  }

  // Keyboard: arrows + WASD. Also accept e.code for layout-independent WASD.
  const keyMap = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    a: "left",
    d: "right",
    w: "up",
    s: "down",
    A: "left",
    D: "right",
    W: "up",
    S: "down",
  };
  const codeMap = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    KeyA: "left",
    KeyD: "right",
    KeyW: "up",
    KeyS: "down",
  };

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Don't steal typing from inputs
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;

      const dir = keyMap[e.key] || codeMap[e.code];
      if (!dir) return;
      e.preventDefault(); // stop page scroll on arrows
      move(dir);
    },
    { passive: false }
  );

  // Make board focusable so users can click it; keys work globally anyway.
  boardEl.tabIndex = 0;

  let touchStart = null;
  boardEl.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    },
    { passive: true }
  );
  boardEl.addEventListener(
    "touchmove",
    (e) => {
      if (touchStart) e.preventDefault();
    },
    { passive: false }
  );
  boardEl.addEventListener(
    "touchend",
    (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (Math.max(absX, absY) < 24) return;
      if (absX > absY) move(dx > 0 ? "right" : "left");
      else move(dy > 0 ? "down" : "up");
    },
    { passive: true }
  );

  btnNew.addEventListener("click", newGame);
  btnRestart.addEventListener("click", newGame);
  btnContinue.addEventListener("click", () => {
    keepPlaying = true;
    hideOverlay();
    boardEl.focus({ preventScroll: true });
  });

  window.addEventListener("resize", () => {
    const m = metrics();
    document.documentElement.style.setProperty("--cell-size", `${m.cell}px`);
    for (const t of tiles) {
      const el = tileNodes.get(t.id);
      if (!el) continue;
      // Skip transition on resize to avoid sliding tiles during layout change
      const prev = el.style.transition;
      el.style.transition = "none";
      applyTileGeometry(el, t.r, t.c, m);
      void el.offsetWidth;
      el.style.transition = prev || "";
    }
  });

  newGame();

  window.addEventListener("message", (ev) => {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== "arcade") return;
    if (ev.data.action === "suspend") {
      shellHold = true;
      try { if (audioCtx && audioCtx.state === "running") audioCtx.suspend(); } catch (err) {}
    } else if (ev.data.action === "resume") {
      shellHold = false;
      try { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); } catch (err) {}
    }
  });

})();
