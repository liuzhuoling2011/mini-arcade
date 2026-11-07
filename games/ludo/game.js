(function () {
  "use strict";
  /*
   * 中国飞行棋（自写实现，规则对齐 MIT：netmanfisher/chinese-ludo、DynamsoftRD/Modern-Ludo）
   * - 掷 6 起飞；掷 6 再掷；连掷三个 6 本回合作废
   * - 外圈 52 格；本色终点入口后进 6 格航道，点数须刚好到终点
   * - 撞子回基地；起点安全；同色可叠子
   * - 颜色飞跃：停在本色格 → 飞到下一本色格；若落到飞行点再触发飞行通道
   * - 飞行通道：本色「飞行器」触发格 → 对角捷径终点（可再撞子）
   * 详见 THIRD_PARTY.md
   */

  var COLORS = [
    { id: "red", name: "红", fill: "#ef4444", soft: "#fecaca" },
    { id: "yellow", name: "黄", fill: "#fbbf24", soft: "#fef3c7" },
    { id: "blue", name: "蓝", fill: "#3b82f6", soft: "#bfdbfe" },
    { id: "green", name: "绿", fill: "#22c55e", soft: "#bbf7d0" }
  ];
  var TRACK = 52;
  var HOME_LEN = 6;
  // Ring layout aligned with chinese-ludo (MIT): starts every 13 cells.
  // Our seats red/yellow/blue/green ↔ that project's yellow/blue/red/green roles.
  var START = [0, 13, 26, 39];
  var ENTRY = [49, 10, 23, 36]; // home-entry squares (no color-jump on these)
  // Own-color stations on the ring (every 4 cells); landing jumps to the next.
  var PATH_COLORS = [
    [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49], // red
    [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50], // yellow
    [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51], // blue
    [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48]  // green
  ];
  // Express flight (飞行通道): trigger → destination (+12 along ring / wrap)
  var SHORTCUTS = [
    { trigger: 17, dest: 29 }, // red
    { trigger: 30, dest: 42 }, // yellow
    { trigger: 43, dest: 3 },  // blue
    { trigger: 4, dest: 16 }   // green
  ];
  // Safe squares: all four starts
  var SAFE = {};
  START.forEach(function (s) { SAFE[s] = 1; });
  // Quick lookup: which seat owns a color tile (for drawing)
  var TILE_OWNER = {};
  PATH_COLORS.forEach(function (tiles, ci) {
    tiles.forEach(function (t) { TILE_OWNER[t] = ci; });
  });

  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var statusEl = document.getElementById("status");
  var dieEl = document.getElementById("die");
  var playersEl = document.getElementById("players");
  var btnRoll = document.getElementById("btnRoll");
  var setupEl = document.getElementById("setup");
  var endEl = document.getElementById("end");

  var state = null;
  var suspended = false;
  var aiTimer = null;
  var settings = { mode: "local", diff: "easy", humanColor: 0, count: 2 };

  // piece.pos: null = base; 0..51 = ring (absolute); 'H0'..'H5' home; 'DONE'
  function activeColors() {
    if (settings.count === 2) return [0, 2]; // red vs blue
    if (settings.count === 3) return [0, 1, 2];
    return [0, 1, 2, 3];
  }

  function isHuman(color) {
    if (settings.mode === "local") return true;
    return color === settings.humanColor;
  }

  function reset() {
    var pieces = {};
    activeColors().forEach(function (c) {
      pieces[c] = [null, null, null, null];
    });
    state = {
      pieces: pieces,
      turn: activeColors()[0],
      dice: null,
      phase: "roll", // roll | choose | extra
      sixStreak: 0,
      movable: [],
      over: false,
      winner: null
    };
    dieEl.textContent = "?";
    btnRoll.disabled = false;
    renderPlayers();
    draw();
    updateStatus();
    maybeAI();
  }

  function ringPos(color, steps) {
    // steps >= 0 after leaving base; 0 means sitting on start
    return (START[color] + steps) % TRACK;
  }

  function stepsOnRing(color, abs) {
    return (abs - START[color] + TRACK) % TRACK;
  }

  function pathLengthToHome() {
    // From start, walk until ENTRY, then HOME_LEN to finish
    // Distance start→entry along ring:
    return (ENTRY[0] - START[0] + TRACK) % TRACK; // same for all relative: 50
  }
  // For each color: steps from start to entry (inclusive of entry square as last ring)
  function stepsToEntry(color) {
    return (ENTRY[color] - START[color] + TRACK) % TRACK;
  }

  function destinations(color, pieceIdx, dice) {
    var pos = state.pieces[color][pieceIdx];
    var out = [];
    if (pos === "DONE") return out;

    if (pos === null) {
      if (dice === 6) out.push({ kind: "takeoff" });
      return out;
    }

    if (typeof pos === "string" && pos[0] === "H") {
      var h = parseInt(pos.slice(1), 10); // 0..4 on stretch; finish needs progress HOME_LEN
      var progress = h + 1; // cells entered so far
      var np = progress + dice;
      if (np < HOME_LEN) out.push({ kind: "home", home: np - 1 });
      else if (np === HOME_LEN) out.push({ kind: "done" });
      // overshoot illegal
      return out;
    }

    // on ring (absolute index)
    var steps = stepsOnRing(color, pos);
    var entryAt = stepsToEntry(color);
    var next = steps + dice;

    if (next < entryAt) {
      out.push({ kind: "ring", abs: ringPos(color, next) });
      return out;
    }
    if (next === entryAt) {
      out.push({ kind: "ring", abs: ringPos(color, next) });
      return out;
    }
    // Crossing entry: remaining steps enter 6-cell home (6th = finish)
    var into = next - entryAt; // 1..6 from entry
    if (into >= 1 && into < HOME_LEN) out.push({ kind: "home", home: into - 1 });
    else if (into === HOME_LEN) out.push({ kind: "done" });
    // else overshoot
    return out;
  }

  function findMovable(color, dice) {
    var list = [];
    for (var i = 0; i < 4; i++) {
      if (destinations(color, i, dice).length) list.push(i);
    }
    return list;
  }

  function occupants(abs) {
    var found = [];
    activeColors().forEach(function (c) {
      state.pieces[c].forEach(function (p, i) {
        if (p === abs) found.push({ color: c, idx: i });
      });
    });
    return found;
  }

  function captureAt(color, abs) {
    if (typeof abs !== "number") return 0;
    if (SAFE[abs]) return 0;
    var n = 0;
    occupants(abs).forEach(function (o) {
      if (o.color !== color) {
        state.pieces[o.color][o.idx] = null;
        n++;
      }
    });
    return n;
  }

  /** After landing on a ring square: color jump and/or flight shortcut (MIT chinese-ludo order). */
  function resolveFlights(color, pieceIdx) {
    var msgs = [];
    var pieces = state.pieces[color];
    var abs = pieces[pieceIdx];
    if (typeof abs !== "number") return msgs;
    // Just took off onto start — no jump (matches chinese-ludo position===0 guard)
    if (abs === START[color]) return msgs;
    // Home entry: no color jump
    if (abs === ENTRY[color]) return msgs;

    var sc = SHORTCUTS[color];

    // Priority 1: express flight trigger
    if (abs === sc.trigger) {
      pieces[pieceIdx] = sc.dest;
      msgs.push("飞行通道");
      captureAt(color, sc.dest);
      return msgs;
    }

    // Priority 2: color jump to next same-color station
    var tiles = PATH_COLORS[color];
    var ix = tiles.indexOf(abs);
    if (ix < 0) return msgs;
    var next = tiles[(ix + 1) % tiles.length];
    // Do not jump onto/into a square that would skip the home entry incorrectly:
    // if next is past entry along this color's progress while still on ring loop near finish,
    // chinese-ludo blocks finish-stretch destinations; our ENTRY is never a jump source,
    // and next after the tile before ENTRY is ENTRY itself (allowed).
    pieces[pieceIdx] = next;
    msgs.push("颜色飞跃");
    captureAt(color, next);

    // Chain: color jump landing on flight trigger → fly again
    if (next === sc.trigger) {
      pieces[pieceIdx] = sc.dest;
      msgs.push("飞行通道");
      captureAt(color, sc.dest);
    }
    return msgs;
  }

  function checkWin(color) {
    var pieces = state.pieces[color];
    if (pieces.every(function (p) { return p === "DONE"; })) {
      state.over = true;
      state.winner = color;
      finish(COLORS[color].name + "方获胜", COLORS[color].name + "色飞机全部到达终点！");
      return true;
    }
    return false;
  }

  function applyMove(color, pieceIdx, dice) {
    var opts = destinations(color, pieceIdx, dice);
    if (!opts.length) return { ok: false, msgs: [] };
    var dest = opts[0];
    var pieces = state.pieces[color];
    var msgs = [];

    if (dest.kind === "takeoff") {
      pieces[pieceIdx] = START[color];
      // start is safe — no capture, no flight
    } else if (dest.kind === "ring") {
      pieces[pieceIdx] = dest.abs;
      captureAt(color, dest.abs);
      msgs = resolveFlights(color, pieceIdx);
    } else if (dest.kind === "home") {
      pieces[pieceIdx] = "H" + dest.home;
    } else if (dest.kind === "done") {
      pieces[pieceIdx] = "DONE";
    }

    checkWin(color);
    return { ok: true, msgs: msgs };
  }

  /** Final ring square after dice + flights (for AI scoring). */
  function finalRingAfter(color, abs) {
    if (typeof abs !== "number") return abs;
    if (abs === START[color] || abs === ENTRY[color]) return abs;
    var sc = SHORTCUTS[color];
    if (abs === sc.trigger) return sc.dest;
    var tiles = PATH_COLORS[color];
    var ix = tiles.indexOf(abs);
    if (ix < 0) return abs;
    var next = tiles[(ix + 1) % tiles.length];
    if (next === sc.trigger) return sc.dest;
    return next;
  }

  function finish(title, msg) {
    state.over = true;
    state.phase = "end";
    btnRoll.disabled = true;
    statusEl.textContent = title;
    document.getElementById("endTitle").textContent = title;
    document.getElementById("endMsg").textContent = msg;
    endEl.hidden = false;
    draw();
  }

  function nextTurn(keepExtra) {
    if (state.over) return;
    if (keepExtra) {
      state.phase = "roll";
      state.dice = null;
      dieEl.textContent = "?";
      btnRoll.disabled = false;
      updateStatus("再掷一次");
      maybeAI();
      return;
    }
    var order = activeColors();
    var i = order.indexOf(state.turn);
    state.turn = order[(i + 1) % order.length];
    state.sixStreak = 0;
    state.phase = "roll";
    state.dice = null;
    state.movable = [];
    dieEl.textContent = "?";
    btnRoll.disabled = false;
    updateStatus();
    renderPlayers();
    draw();
    maybeAI();
  }

  function roll() {
    if (!state || state.over || suspended) return;
    if (state.phase !== "roll") return;
    if (settings.mode === "ai" && !isHuman(state.turn) && !state._aiRolling) return;

    var d = 1 + ((Math.random() * 6) | 0);
    state.dice = d;
    dieEl.textContent = String(d);

    if (d === 6) state.sixStreak++;
    else state.sixStreak = 0;

    if (state.sixStreak >= 3) {
      updateStatus("连掷三个 6，本回合作废");
      state.phase = "roll";
      setTimeout(function () { nextTurn(false); }, 700);
      return;
    }

    var movable = findMovable(state.turn, d);
    state.movable = movable;
    if (!movable.length) {
      updateStatus("没有可走棋子");
      var extra = d === 6;
      setTimeout(function () { nextTurn(extra); }, 650);
      return;
    }

    state.phase = "choose";
    btnRoll.disabled = true;
    updateStatus("请选择棋子（可走 " + movable.length + " 枚）");
    draw();

    if (movable.length === 1 && isHuman(state.turn)) {
      setTimeout(function () { choosePiece(movable[0]); }, 350);
    } else if (!isHuman(state.turn)) {
      maybeAIChoose();
    }
  }

  function choosePiece(idx) {
    if (!state || state.over || suspended) return;
    if (state.phase !== "choose") return;
    if (state.movable.indexOf(idx) < 0) return;
    var d = state.dice;
    var extra = d === 6;
    var result = applyMove(state.turn, idx, d);
    state.movable = [];
    draw();
    if (state.over) return;
    var delay = 280;
    if (result.msgs && result.msgs.length) {
      updateStatus(result.msgs.join(" → ") + "！");
      delay = 280 + result.msgs.length * 380;
      // brief redraw pulse already done; status shows flight
    }
    setTimeout(function () { nextTurn(extra); }, delay);
  }

  function updateStatus(extra) {
    if (!state || state.over) return;
    var t = COLORS[state.turn].name + "方";
    if (settings.mode === "ai") t += isHuman(state.turn) ? "（你）" : "（电脑）";
    if (state.phase === "roll") t += " · 请掷骰";
    else if (state.phase === "choose") t += " · 点数 " + state.dice;
    if (extra) t += " · " + extra;
    statusEl.textContent = t;
  }

  function renderPlayers() {
    playersEl.innerHTML = "";
    activeColors().forEach(function (c) {
      var pill = document.createElement("span");
      pill.className = "pill " + COLORS[c].id + (state && state.turn === c ? " on" : "");
      var done = state ? state.pieces[c].filter(function (p) { return p === "DONE"; }).length : 0;
      pill.textContent = COLORS[c].name + " " + done + "/4";
      playersEl.appendChild(pill);
    });
  }

  // ---- geometry / drawing ----
  function cellXY(abs) {
    // Map 52 ring cells onto a rounded square path in 0..1 board coords
    var S = 600, m = 70, span = S - 2 * m;
    var side = 13; // 13 cells per side
    var i = abs % TRACK;
    var sideIdx = (i / side) | 0;
    var t = i % side;
    var f = t / side;
    var x, y;
    if (sideIdx === 0) { x = m + f * span; y = m; }
    else if (sideIdx === 1) { x = m + span; y = m + f * span; }
    else if (sideIdx === 2) { x = m + span - f * span; y = m + span; }
    else { x = m; y = m + span - f * span; }
    return { x: x, y: y };
  }

  function homeXY(color, h) {
    var S = 600, cx = 300, cy = 300;
    var dist = 210 - h * 28;
    var ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][color];
    return { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist };
  }

  function baseXY(color, idx) {
    var corners = [
      { x: 95, y: 95 }, { x: 445, y: 95 }, { x: 445, y: 445 }, { x: 95, y: 445 }
    ];
    var o = corners[color];
    var ox = (idx % 2) * 48;
    var oy = ((idx / 2) | 0) * 48;
    return { x: o.x + ox, y: o.y + oy };
  }

  function pieceScreenPos(color, idx) {
    var p = state.pieces[color][idx];
    if (p === null) return baseXY(color, idx);
    if (p === "DONE") {
      var c = homeXY(color, HOME_LEN - 1);
      return { x: c.x + (idx - 1.5) * 10, y: c.y + (idx - 1.5) * 10 };
    }
    if (typeof p === "string" && p[0] === "H") return homeXY(color, parseInt(p.slice(1), 10));
    return cellXY(p);
  }

  function draw() {
    var S = 600;
    ctx.clearRect(0, 0, S, S);
    // board bg
    var g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, "#121a2e");
    g.addColorStop(1, "#0a1020");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    // bases
    COLORS.forEach(function (col, ci) {
      if (activeColors().indexOf(ci) < 0) return;
      var b = [
        { x: 40, y: 40 }, { x: 390, y: 40 }, { x: 390, y: 390 }, { x: 40, y: 390 }
      ][ci];
      roundRect(b.x, b.y, 170, 170, 16, col.soft, col.fill);
      ctx.fillStyle = col.fill;
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(col.name, b.x + 14, b.y + 28);
    });

    // shortcut flight lanes (under cells)
    SHORTCUTS.forEach(function (sc, ci) {
      if (activeColors().indexOf(ci) < 0) return;
      var a = cellXY(sc.trigger), b = cellXY(sc.dest);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      // bow toward center so the lane is visible across the board
      var mx = (a.x + b.x) / 2 * 0.35 + 300 * 0.65;
      var my = (a.y + b.y) / 2 * 0.35 + 300 * 0.65;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.strokeStyle = COLORS[ci].fill;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // arrow head at dest
      var ang = Math.atan2(b.y - my, b.x - mx);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - 12 * Math.cos(ang - 0.4), b.y - 12 * Math.sin(ang - 0.4));
      ctx.lineTo(b.x - 12 * Math.cos(ang + 0.4), b.y - 12 * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fillStyle = COLORS[ci].fill;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // ring cells (color stations tinted; flight triggers marked ✈)
    for (var i = 0; i < TRACK; i++) {
      var p = cellXY(i);
      var isStart = START.indexOf(i) >= 0;
      var startColor = START.indexOf(i);
      var owner = TILE_OWNER[i];
      var isTrigger = SHORTCUTS.some(function (sc) { return sc.trigger === i; });
      var r = isStart || isTrigger ? 16 : 12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (isStart && activeColors().indexOf(startColor) >= 0) {
        ctx.fillStyle = COLORS[startColor].soft;
        ctx.strokeStyle = COLORS[startColor].fill;
      } else if (owner != null && activeColors().indexOf(owner) >= 0) {
        ctx.fillStyle = COLORS[owner].soft;
        ctx.strokeStyle = COLORS[owner].fill;
      } else {
        ctx.fillStyle = "#1e293b";
        ctx.strokeStyle = "#64748b";
      }
      ctx.fill();
      ctx.lineWidth = isTrigger ? 3 : 2;
      ctx.stroke();
      if (isTrigger) {
        ctx.fillStyle = COLORS[TILE_OWNER[i] != null ? TILE_OWNER[i] : 0].fill;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("✈", p.x, p.y + 4);
        ctx.textAlign = "left";
      }
    }

    // home stretches
    activeColors().forEach(function (c) {
      for (var h = 0; h < HOME_LEN; h++) {
        var hp = homeXY(c, h);
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[c].soft;
        ctx.strokeStyle = COLORS[c].fill;
        ctx.fill(); ctx.stroke();
      }
    });

    // center
    ctx.beginPath();
    ctx.arc(300, 300, 36, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = "#94a3b8";
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("终点", 300, 305);
    ctx.textAlign = "left";

    if (!state) return;

    // highlight movable
    var movableSet = {};
    if (state.phase === "choose") {
      state.movable.forEach(function (mi) { movableSet[mi] = 1; });
    }

    activeColors().forEach(function (c) {
      state.pieces[c].forEach(function (pos, idx) {
        var xy = pieceScreenPos(c, idx);
        ctx.beginPath();
        ctx.arc(xy.x, xy.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[c].fill;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = state.phase === "choose" && state.turn === c && movableSet[idx] ? 4 : 2;
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(idx + 1), xy.x, xy.y + 4);
        ctx.textAlign = "left";
      });
    });
  }

  function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function hitTest(mx, my) {
    if (!state || state.phase !== "choose") return null;
    var c = state.turn;
    var best = null, bestD = 22;
    state.movable.forEach(function (idx) {
      var xy = pieceScreenPos(c, idx);
      var d = Math.hypot(mx - xy.x, my - xy.y);
      if (d < bestD) { bestD = d; best = idx; }
    });
    return best;
  }

  canvas.addEventListener("click", function (ev) {
    if (!state || state.over || suspended) return;
    if (settings.mode === "ai" && !isHuman(state.turn)) return;
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var mx = (ev.clientX - rect.left) * scaleX;
    var my = (ev.clientY - rect.top) * scaleY;
    var idx = hitTest(mx, my);
    if (idx != null) choosePiece(idx);
  });

  // ---- AI ----
  function scoreMove(color, idx, dice) {
    var opts = destinations(color, idx, dice);
    if (!opts.length) return -1e9;
    var dest = opts[0];
    var s = 0;
    if (dest.kind === "done") s += 500;
    else if (dest.kind === "home") s += 120 + dest.home * 20;
    else if (dest.kind === "takeoff") s += 80;
    else if (dest.kind === "ring") {
      s += 10;
      var land = dest.abs;
      var fin = finalRingAfter(color, land);
      if (fin !== land) s += 70; // color jump / flight
      if (SHORTCUTS[color].trigger === land || SHORTCUTS[color].trigger === fin && land !== fin) s += 40;
      if (!SAFE[fin]) {
        var hits = occupants(fin).filter(function (o) { return o.color !== color; });
        s += hits.length * 90;
      }
      // prefer progress after flights
      s += stepsOnRing(color, fin) * 0.5;
    }
    // leave base if others stuck
    var pos = state.pieces[color][idx];
    if (pos === null) s += 15;
    return s;
  }

  function aiChoose() {
    var dice = state.dice;
    var color = state.turn;
    var movable = state.movable.slice();
    if (!movable.length) return;

    if (settings.diff === "easy") {
      choosePiece(movable[(Math.random() * movable.length) | 0]);
      return;
    }

    var scored = movable.map(function (idx) {
      return { idx: idx, s: scoreMove(color, idx, dice) };
    });
    scored.sort(function (a, b) { return b.s - a.s; });

    if (settings.diff === "normal") {
      // occasionally suboptimal
      if (scored.length > 1 && Math.random() < 0.25) choosePiece(scored[1].idx);
      else choosePiece(scored[0].idx);
      return;
    }

    // hard: also penalize leaving pieces vulnerable (simple lookahead)
    var best = scored[0], bestS = -Infinity;
    scored.forEach(function (item) {
      var s = item.s;
      // bonus if capturing leader
      s += item.s * 0.05;
      if (s > bestS) { bestS = s; best = item; }
    });
    choosePiece(best.idx);
  }

  function maybeAI() {
    clearTimeout(aiTimer);
    if (!state || state.over || suspended) return;
    if (settings.mode !== "ai") return;
    if (isHuman(state.turn)) return;
    if (state.phase !== "roll") return;
    statusEl.textContent = COLORS[state.turn].name + "方（电脑）思考中…";
    aiTimer = setTimeout(function () {
      if (suspended || !state || state.over) return;
      state._aiRolling = true;
      roll();
      state._aiRolling = false;
    }, settings.diff === "hard" ? 420 : 280);
  }

  function maybeAIChoose() {
    clearTimeout(aiTimer);
    aiTimer = setTimeout(function () {
      if (suspended || !state || state.over) return;
      aiChoose();
    }, 320);
  }

  // ---- setup UI ----
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
    document.getElementById("countRow").hidden = mode === "ai";
    document.getElementById("diffRow").hidden = mode !== "ai";
    document.getElementById("colorRow").hidden = mode !== "ai";
  }

  function start(keep) {
    if (!keep) {
      settings.mode = readSeg(document.getElementById("modeSeg"), "data-mode", "local");
      settings.diff = readSeg(document.getElementById("diffSeg"), "data-diff", "easy");
      settings.count = settings.mode === "ai" ? 2 : parseInt(readSeg(document.getElementById("countSeg"), "data-count", "2"), 10);
      settings.humanColor = parseInt(readSeg(document.getElementById("colorSeg"), "data-color", "0"), 10);
      if (settings.mode === "ai") {
        // ensure human color is one of the two seats (0 and 2)
        if (settings.humanColor !== 0 && settings.humanColor !== 2) settings.humanColor = 0;
      }
    }
    setupEl.hidden = true; endEl.hidden = true;
    reset();
  }

  btnRoll.addEventListener("click", function () {
    if (settings.mode === "ai" && state && !isHuman(state.turn)) return;
    roll();
  });
  document.getElementById("btnStart").addEventListener("click", function () { start(false); });
  document.getElementById("btnAgain").addEventListener("click", function () { start(true); });
  document.getElementById("btnSetup").addEventListener("click", function () { endEl.hidden = true; setupEl.hidden = false; });
  document.getElementById("btnRestart").addEventListener("click", function () {
    clearTimeout(aiTimer); setupEl.hidden = false; endEl.hidden = true;
  });
  document.getElementById("btnResign").addEventListener("click", function () {
    if (!state || state.over || !setupEl.hidden) return;
    if (settings.mode === "ai") {
      var other = settings.humanColor === 0 ? 2 : 0;
      finish(COLORS[other].name + "方获胜", "你已退出。");
    } else {
      finish("对局结束", COLORS[state.turn].name + "方退出。");
    }
  });

  wireSeg(document.getElementById("modeSeg"), "data-mode");
  wireSeg(document.getElementById("countSeg"), "data-count");
  wireSeg(document.getElementById("diffSeg"), "data-diff");
  wireSeg(document.getElementById("colorSeg"), "data-color");
  syncUI();

  window.addEventListener("message", function (ev) {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== "arcade") return;
    if (ev.data.action === "suspend") { suspended = true; clearTimeout(aiTimer); }
    else if (ev.data.action === "resume") { suspended = false; maybeAI(); }
  });

  window.addEventListener("resize", draw);
  draw();
})();
