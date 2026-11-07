(function () {
  "use strict";
  /* UI + AI around lengyanyu258/xiangqi.js (BSD-2-Clause). See THIRD_PARTY.md */

  var RED = "r", BLACK = "b";
  var LABEL = {
    p: "卒", c: "炮", r: "车", n: "马", b: "象", a: "士", k: "将",
    P: "兵", C: "炮", R: "车", N: "马", B: "相", A: "仕", K: "帅"
  };
  var FILES = "abcdefghi";

  var boardEl = document.getElementById("board");
  var statusEl = document.getElementById("status");
  var setupEl = document.getElementById("setup");
  var endEl = document.getElementById("end");
  var cells = [];
  var game = null;
  var selected = null;
  var lastPlaced = null;
  var dests = [];
  var over = false;
  var suspended = false;
  var aiTimer = null;
  var settings = { mode: "local", diff: "easy", humanSide: RED };

  var VAL = { p: 30, c: 285, r: 600, n: 270, b: 120, a: 120, k: 10000 };

  function sq(r, c) { return FILES[c] + r; } // r is rank 0-9 as in ICCS from red bottom
  // xiangqi.js algebraic: a9 top-left (black), i0 bottom-right (red)
  // Our display: rank 9 at top, file a at left → algebraic file + rank number
  function toAlg(rank, file) { return FILES[file] + String(rank); }
  function fromAlg(alg) {
    return { c: FILES.indexOf(alg[0]), r: parseInt(alg.slice(1), 10) };
  }
  function nameSide(color) { return color === RED ? "红方" : "黑方"; }
  function opp(c) { return c === RED ? BLACK : RED; }

  function build() {
    boardEl.innerHTML = "";
    var river = document.createElement("div");
    river.className = "river-label";
    river.innerHTML = "<span>楚 河</span><span>汉 界</span>";
    boardEl.appendChild(river);
    var grid = document.createElement("div");
    grid.className = "grid";
    cells = [];
    for (var rank = 9; rank >= 0; rank--) {
      for (var file = 0; file < 9; file++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.rank = rank;
        cell.dataset.file = file;
        cell.addEventListener("click", onCell);
        grid.appendChild(cell);
        cells.push(cell);
      }
    }
    boardEl.appendChild(grid);
  }

  function pieceAt(rank, file) {
    var p = game.get(toAlg(rank, file));
    return p || null;
  }

  function legalFrom(rank, file) {
    var moves = game.moves({ square: toAlg(rank, file), verbose: true }) || [];
    return moves.map(function (m) { return fromAlg(m.to); });
  }

  function allVerbose() {
    return game.moves({ verbose: true }) || [];
  }

  function render() {
    var destSet = {};
    dests.forEach(function (d) { destSet[d.r + "," + d.c] = 1; });
    var i = 0;
    for (var rank = 9; rank >= 0; rank--) {
      for (var file = 0; file < 9; file++) {
        var cell = cells[i++];
        var p = pieceAt(rank, file);
        var cls = "cell";
        if (selected && selected.r === rank && selected.c === file) cls += " sel";
        if (destSet[rank + "," + file]) cls += p ? " cap" : " dest";
        cell.className = cls;
        cell.innerHTML = "";
        if (p) {
          var ch = p.color === RED ? p.type.toUpperCase() : p.type;
          var el = document.createElement("span");
          el.className = "piece " + (p.color === RED ? "red" : "black");
          if (!over && game.in_check() && p.type === "k" && p.color === game.turn()) {
            el.classList.add("check");
          }
          if (lastPlaced && lastPlaced.r === rank && lastPlaced.c === file) {
            el.classList.add("placed");
          }
          el.textContent = LABEL[ch] || ch;
          cell.appendChild(el);
        }
      }
    }
  }

  function pulseStatus() {
    statusEl.classList.remove("pulse");
    void statusEl.offsetWidth;
    statusEl.classList.add("pulse");
  }

  function updateStatus(extra) {
    if (over) return;
    var t = nameSide(game.turn()) + "行棋";
    if (settings.mode === "ai") {
      t += game.turn() === settings.humanSide ? "（你）" : "（电脑）";
    }
    if (game.in_check()) t += " · 被将军！";
    if (extra) t += " · " + extra;
    statusEl.textContent = t;
    pulseStatus();
  }

  function finish(title, msg) {
    over = true; selected = null; dests = [];
    render();
    statusEl.textContent = title;
    document.getElementById("endTitle").textContent = title;
    document.getElementById("endMsg").textContent = msg;
    endEl.hidden = false;
  }

  function afterMove() {
    selected = null; dests = [];
    if (game.in_checkmate()) {
      finish(nameSide(opp(game.turn())) + "胜利", nameSide(game.turn()) + "被将死。");
      return;
    }
    if (game.in_stalemate && game.in_stalemate()) {
      finish("和棋", nameSide(game.turn()) + "困毙。");
      return;
    }
    if (game.game_over && game.game_over()) {
      finish("对局结束", "棋局已终。");
      return;
    }
    // no legal moves
    if (allVerbose().length === 0) {
      if (game.in_check()) finish(nameSide(opp(game.turn())) + "胜利", nameSide(game.turn()) + "被将死。");
      else finish("和棋", nameSide(game.turn()) + "无子可动。");
      return;
    }
    render();
    updateStatus();
    scheduleAI();
  }

  function tryMove(from, to) {
    var m = game.move({ from: from, to: to });
    if (!m) return false;
    var dest = fromAlg(to);
    lastPlaced = { r: dest.r, c: dest.c };
    render();
    setTimeout(function () { lastPlaced = null; }, 400);
    afterMove();
    return true;
  }

  function onCell(ev) {
    if (over || suspended || !game) return;
    if (settings.mode === "ai" && game.turn() !== settings.humanSide) return;
    var rank = +ev.currentTarget.dataset.rank;
    var file = +ev.currentTarget.dataset.file;
    var alg = toAlg(rank, file);
    var p = pieceAt(rank, file);

    if (selected) {
      var can = dests.some(function (d) { return d.r === rank && d.c === file; });
      if (can) {
        tryMove(toAlg(selected.r, selected.c), alg);
        return;
      }
      if (p && p.color === game.turn()) {
        selected = { r: rank, c: file };
        dests = legalFrom(rank, file);
        render();
        return;
      }
      selected = null; dests = []; render();
      return;
    }
    if (p && p.color === game.turn()) {
      selected = { r: rank, c: file };
      dests = legalFrom(rank, file);
      render();
    }
  }

  function boardMaterial(side) {
    var s = 0;
    for (var rank = 0; rank <= 9; rank++) {
      for (var file = 0; file < 9; file++) {
        var p = pieceAt(rank, file);
        if (!p) continue;
        var v = VAL[p.type] || 0;
        s += p.color === side ? v : -v;
      }
    }
    return s;
  }

  function pickEasy() {
    var moves = allVerbose();
    var caps = moves.filter(function (m) { return m.captured; });
    if (caps.length && Math.random() < 0.4) return caps[(Math.random() * caps.length) | 0];
    return moves[(Math.random() * moves.length) | 0];
  }

  function pickNormal() {
    var moves = allVerbose();
    var best = moves[0], bestS = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      game.move(m);
      var s = boardMaterial(opp(game.turn())); // after move, turn flipped; evaluate for mover
      if (game.in_check()) s += 40;
      if (m.captured) s += (VAL[m.captured] || 0) * 0.2;
      game.undo();
      if (s > bestS) { bestS = s; best = m; }
    }
    return best;
  }

  function minimax(depth, alpha, beta, maximizing, aiColor) {
    if (game.in_checkmate()) return maximizing ? -50000 + depth : 50000 - depth;
    var moves = allVerbose();
    if (!moves.length) return 0;
    if (depth === 0) return boardMaterial(aiColor) + (game.in_check() ? (game.turn() === aiColor ? -25 : 25) : 0);

    moves.sort(function (a, b) {
      return (b.captured ? VAL[b.captured] || 0 : 0) - (a.captured ? VAL[a.captured] || 0 : 0);
    });
    if (moves.length > 26) moves = moves.slice(0, 26);

    if (maximizing) {
      var maxE = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        game.move(moves[i]);
        var v = minimax(depth - 1, alpha, beta, false, aiColor);
        game.undo();
        if (v > maxE) maxE = v;
        if (v > alpha) alpha = v;
        if (beta <= alpha) break;
      }
      return maxE;
    }
    var minE = Infinity;
    for (var j = 0; j < moves.length; j++) {
      game.move(moves[j]);
      var v2 = minimax(depth - 1, alpha, beta, true, aiColor);
      game.undo();
      if (v2 < minE) minE = v2;
      if (v2 < beta) beta = v2;
      if (beta <= alpha) break;
    }
    return minE;
  }

  function pickHard() {
    var moves = allVerbose();
    moves.sort(function (a, b) {
      return (b.captured ? VAL[b.captured] || 0 : 0) - (a.captured ? VAL[a.captured] || 0 : 0);
    });
    var best = moves[0], bestV = -Infinity;
    var aiColor = game.turn();
    for (var i = 0; i < moves.length; i++) {
      game.move(moves[i]);
      var v = minimax(1, -Infinity, Infinity, false, aiColor);
      game.undo();
      if (v > bestV) { bestV = v; best = moves[i]; }
    }
    return best;
  }

  function aiPick() {
    if (settings.diff === "easy") return pickEasy();
    if (settings.diff === "normal") return pickNormal();
    return pickHard();
  }

  function scheduleAI() {
    clearTimeout(aiTimer);
    if (over || suspended || settings.mode !== "ai" || !game) return;
    if (game.turn() !== settings.humanSide) {
      statusEl.textContent = "电脑思考中…";
      var delay = settings.diff === "hard" ? 360 : settings.diff === "normal" ? 200 : 120;
      aiTimer = setTimeout(function () {
        if (over || suspended) return;
        var m = aiPick();
        if (m) {
          game.move(m);
          var dest = fromAlg(m.to);
          lastPlaced = { r: dest.r, c: dest.c };
          render();
          setTimeout(function () { lastPlaced = null; }, 400);
          afterMove();
        }
      }, delay);
    }
  }

  function reset() {
    game = new Xiangqi();
    selected = null; dests = []; lastPlaced = null; over = false;
    render(); updateStatus();
  }

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
      settings.humanSide = readSeg(document.getElementById("sideSeg"), "data-side", "human") === "ai" ? BLACK : RED;
    }
    setupEl.hidden = true; endEl.hidden = true;
    reset(); scheduleAI();
  }

  document.getElementById("btnStart").addEventListener("click", function () { start(false); });
  document.getElementById("btnAgain").addEventListener("click", function () { start(true); });
  document.getElementById("btnSetup").addEventListener("click", function () { endEl.hidden = true; setupEl.hidden = false; });
  document.getElementById("btnRestart").addEventListener("click", function () {
    clearTimeout(aiTimer); setupEl.hidden = false; endEl.hidden = true;
  });
  document.getElementById("btnResign").addEventListener("click", function () {
    if (over || !setupEl.hidden || !game) return;
    var loser = settings.mode === "ai" ? settings.humanSide : game.turn();
    finish(nameSide(opp(loser)) + "胜利", nameSide(loser) + "认输。");
  });
  wireSeg(document.getElementById("modeSeg"), "data-mode");
  wireSeg(document.getElementById("diffSeg"), "data-diff");
  wireSeg(document.getElementById("sideSeg"), "data-side");
  syncUI();

  window.addEventListener("message", function (ev) {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== "arcade") return;
    if (ev.data.action === "suspend") { suspended = true; clearTimeout(aiTimer); }
    else if (ev.data.action === "resume") { suspended = false; scheduleAI(); }
  });

  build();
  // preview empty until start — still show start position under setup
  game = new Xiangqi();
  render();
})();
