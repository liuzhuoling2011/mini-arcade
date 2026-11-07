(function () {
  "use strict";
  /* 黑白棋规则：八向夹击翻转、跳过、双方无子终局。AI 自写。参考见 THIRD_PARTY.md */

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

  var boardEl = document.getElementById("board");
  var statusEl = document.getElementById("status");
  var scoreB = document.getElementById("scoreB");
  var scoreW = document.getElementById("scoreW");
  var setupEl = document.getElementById("setup");
  var endEl = document.getElementById("end");

  var cells = [];
  var board = [];
  var turn = BLACK;
  var over = false;
  var suspended = false;
  var aiTimer = null;
  var settings = { mode: "local", diff: "easy", humanSide: BLACK };

  function idx(r, c) { return r * N + c; }
  function inb(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
  function opp(s) { return s === BLACK ? WHITE : BLACK; }
  function name(s) { return s === BLACK ? "黑棋" : "白棋"; }

  function build() {
    boardEl.innerHTML = "";
    cells = [];
    for (var i = 0; i < 64; i++) {
      var cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.i = i;
      cell.addEventListener("click", onClick);
      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }

  function reset() {
    board = new Array(64).fill(EMPTY);
    board[idx(3,3)] = WHITE; board[idx(3,4)] = BLACK;
    board[idx(4,3)] = BLACK; board[idx(4,4)] = WHITE;
    turn = BLACK; over = false;
    render(); updateStatus();
  }

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

  function render() {
    var legals = over ? [] : legalMoves(turn);
    var legalSet = {};
    for (var i = 0; i < legals.length; i++) legalSet[legals[i]] = 1;
    for (var p = 0; p < 64; p++) {
      var cell = cells[p];
      cell.className = "cell" + (legalSet[p] ? " legal" : "");
      cell.innerHTML = "";
      if (board[p]) {
        var d = document.createElement("span");
        d.className = "disk " + (board[p] === BLACK ? "b" : "w");
        cell.appendChild(d);
      }
    }
    scoreB.querySelector("strong").textContent = count(BLACK);
    scoreW.querySelector("strong").textContent = count(WHITE);
    scoreB.classList.toggle("active", !over && turn === BLACK);
    scoreW.classList.toggle("active", !over && turn === WHITE);
  }

  function updateStatus(extra) {
    if (over) return;
    var t = name(turn) + "行棋";
    if (settings.mode === "ai") t += turn === settings.humanSide ? "（你）" : "（电脑）";
    var n = legalMoves(turn).length;
    t += " · 可落 " + n + " 处";
    if (extra) t += " · " + extra;
    statusEl.textContent = t;
  }

  function finish(title, msg) {
    over = true;
    render();
    statusEl.textContent = title;
    document.getElementById("endTitle").textContent = title;
    document.getElementById("endMsg").textContent = msg;
    endEl.hidden = false;
  }

  function endCheck() {
    var cb = count(BLACK), cw = count(WHITE);
    var title, msg;
    if (cb > cw) { title = "黑棋获胜"; msg = "黑 " + cb + " : 白 " + cw; }
    else if (cw > cb) { title = "白棋获胜"; msg = "黑 " + cb + " : 白 " + cw; }
    else { title = "和棋"; msg = "双方各 " + cb + " 子"; }
    finish(title, msg);
  }

  function applyMove(pos, color) {
    var flips = flipsAt(pos, color);
    if (!flips.length) return false;
    board[pos] = color;
    for (var i = 0; i < flips.length; i++) board[flips[i]] = color;
    return true;
  }

  function afterMove() {
    var next = opp(turn);
    if (legalMoves(next).length) {
      turn = next;
    } else if (legalMoves(turn).length) {
      updateStatus(name(next) + "无子可下，跳过");
      // turn stays
      render();
      scheduleAI();
      return;
    } else {
      endCheck();
      return;
    }
    render();
    updateStatus();
    scheduleAI();
  }

  function play(pos) {
    if (over || suspended) return;
    if (!applyMove(pos, turn)) return;
    render();
    afterMove();
  }

  function onClick(ev) {
    if (over || suspended) return;
    if (settings.mode === "ai" && turn !== settings.humanSide) return;
    play(+ev.currentTarget.dataset.i);
  }

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
    // rarely take corner if random, mostly random
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
      // apply on clone
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
        if (over || suspended) return;
        var moves = legalMoves(turn);
        if (!moves.length) { afterMove(); return; }
        play(aiPick(turn));
      }, delay);
    }
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
      settings.humanSide = readSeg(document.getElementById("sideSeg"), "data-side", "human") === "ai" ? WHITE : BLACK;
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
    if (over || !setupEl.hidden) return;
    var loser = settings.mode === "ai" ? settings.humanSide : turn;
    finish(name(opp(loser)) + "获胜", name(loser) + "认输。");
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

  build(); reset();
})();
