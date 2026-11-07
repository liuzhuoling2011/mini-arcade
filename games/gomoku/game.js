(function () {
  "use strict";
  /* 五子棋规则：末子四向五连（freestyle）。AI 自写。参考 MIT 实现思路见 THIRD_PARTY.md */

  var N = 15;
  var EMPTY = 0, BLACK = 1, WHITE = 2;
  var STARS = { "3,3":1, "3,7":1, "3,11":1, "7,3":1, "7,7":1, "7,11":1, "11,3":1, "11,7":1, "11,11":1 };
  var DIRS = [[1,0],[0,1],[1,1],[1,-1]];

  var boardEl = document.getElementById("board");
  var statusEl = document.getElementById("status");
  var setupEl = document.getElementById("setup");
  var endEl = document.getElementById("end");
  var endTitle = document.getElementById("endTitle");
  var endMsg = document.getElementById("endMsg");

  var cells = [];
  var board = [];
  var turn = BLACK;
  var lastMove = null;
  var over = false;
  var suspended = false;
  var aiTimer = null;
  var settings = { mode: "local", diff: "easy", humanSide: BLACK };

  function idx(r, c) { return r * N + c; }
  function inb(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

  function buildBoard() {
    boardEl.innerHTML = "";
    var grid = document.createElement("div");
    grid.className = "grid";
    cells = [];
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.r = r;
        cell.dataset.c = c;
        if (STARS[r + "," + c]) {
          var star = document.createElement("span");
          star.className = "star";
          cell.appendChild(star);
        }
        cell.addEventListener("click", onCellClick);
        grid.appendChild(cell);
        cells.push(cell);
      }
    }
    boardEl.appendChild(grid);
  }

  function resetBoard() {
    board = new Array(N * N).fill(EMPTY);
    turn = BLACK;
    lastMove = null;
    over = false;
    render();
    updateStatus();
  }

  function render() {
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var v = board[i];
      cell.innerHTML = "";
      if (STARS[(i / N | 0) + "," + (i % N)] && !v) {
        var star = document.createElement("span");
        star.className = "star";
        cell.appendChild(star);
      }
      if (v) {
        var s = document.createElement("span");
        s.className = "stone " + (v === BLACK ? "b" : "w");
        if (lastMove && lastMove === i) s.classList.add("last");
        cell.appendChild(s);
      }
    }
  }

  function sideName(s) { return s === BLACK ? "黑棋" : "白棋"; }

  function updateStatus(extra) {
    if (over) return;
    var t = sideName(turn) + "行棋";
    if (settings.mode === "ai") {
      t += turn === settings.humanSide ? "（你）" : "（电脑）";
    }
    if (extra) t += " · " + extra;
    statusEl.textContent = t;
  }

  function countDir(r, c, dr, dc, color) {
    var n = 0;
    var rr = r + dr, cc = c + dc;
    while (inb(rr, cc) && board[idx(rr, cc)] === color) {
      n++; rr += dr; cc += dc;
    }
    return n;
  }

  function isWin(r, c, color) {
    for (var i = 0; i < DIRS.length; i++) {
      var d = DIRS[i];
      var n = 1 + countDir(r, c, d[0], d[1], color) + countDir(r, c, -d[0], -d[1], color);
      if (n >= 5) return true;
    }
    return false;
  }

  function isFull() {
    for (var i = 0; i < board.length; i++) if (!board[i]) return false;
    return true;
  }

  function legalMoves() {
    var m = [];
    for (var i = 0; i < board.length; i++) if (!board[i]) m.push(i);
    return m;
  }

  function hasNeighbor(r, c, dist) {
    for (var dr = -dist; dr <= dist; dr++) {
      for (var dc = -dist; dc <= dist; dc++) {
        if (!dr && !dc) continue;
        var rr = r + dr, cc = c + dc;
        if (inb(rr, cc) && board[idx(rr, cc)]) return true;
      }
    }
    return false;
  }

  function candidateMoves(radius) {
    var empties = legalMoves();
    if (empties.length === N * N) return [idx(7, 7)];
    var out = [];
    for (var i = 0; i < empties.length; i++) {
      var p = empties[i];
      var r = (p / N) | 0, c = p % N;
      if (hasNeighbor(r, c, radius)) out.push(p);
    }
    return out.length ? out : empties;
  }

  function lineScore(count, open) {
    if (count >= 5) return 100000;
    if (count === 4) return open === 2 ? 10000 : open === 1 ? 1200 : 0;
    if (count === 3) return open === 2 ? 800 : open === 1 ? 120 : 0;
    if (count === 2) return open === 2 ? 80 : open === 1 ? 20 : 0;
    if (count === 1) return open === 2 ? 10 : 2;
    return 0;
  }

  function evalPoint(r, c, color) {
    var score = 0;
    for (var i = 0; i < DIRS.length; i++) {
      var dr = DIRS[i][0], dc = DIRS[i][1];
      var cnt = 1;
      var o1 = 0, o2 = 0;
      var rr = r + dr, cc = c + dc;
      while (inb(rr, cc) && board[idx(rr, cc)] === color) { cnt++; rr += dr; cc += dc; }
      if (inb(rr, cc) && board[idx(rr, cc)] === EMPTY) o1 = 1;
      rr = r - dr; cc = c - dc;
      while (inb(rr, cc) && board[idx(rr, cc)] === color) { cnt++; rr -= dr; cc -= dc; }
      if (inb(rr, cc) && board[idx(rr, cc)] === EMPTY) o2 = 1;
      score += lineScore(cnt, o1 + o2);
    }
    return score;
  }

  function evaluateBoard(forColor) {
    var opp = forColor === BLACK ? WHITE : BLACK;
    var s = 0;
    for (var i = 0; i < board.length; i++) {
      if (!board[i]) continue;
      var r = (i / N) | 0, c = i % N;
      var v = evalPoint(r, c, board[i]) * 0.15;
      s += board[i] === forColor ? v : -v;
    }
    return s;
  }

  function immediateWinOrBlock(color) {
    var moves = candidateMoves(2);
    var opp = color === BLACK ? WHITE : BLACK;
    var win = null, block = null, bestWin = -1, bestBlock = -1;
    for (var i = 0; i < moves.length; i++) {
      var p = moves[i];
      var r = (p / N) | 0, c = p % N;
      board[p] = color;
      var sw = evalPoint(r, c, color);
      board[p] = EMPTY;
      if (sw >= 100000 && sw > bestWin) { bestWin = sw; win = p; }
      board[p] = opp;
      var sb = evalPoint(r, c, opp);
      board[p] = EMPTY;
      if (sb >= 100000 && sb > bestBlock) { bestBlock = sb; block = p; }
    }
    if (win != null) return win;
    if (block != null) return block;
    return null;
  }

  function pickEasy(color) {
    var forced = immediateWinOrBlock(color);
    if (forced != null && Math.random() < 0.35) return forced;
    var moves = candidateMoves(2);
    if (!moves.length) moves = legalMoves();
    return moves[(Math.random() * moves.length) | 0];
  }

  function pickNormal(color) {
    var forced = immediateWinOrBlock(color);
    if (forced != null) return forced;
    var moves = candidateMoves(2);
    var opp = color === BLACK ? WHITE : BLACK;
    var best = moves[0], bestScore = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var p = moves[i];
      var r = (p / N) | 0, c = p % N;
      board[p] = color;
      var s = evalPoint(r, c, color) * 1.2;
      board[p] = EMPTY;
      board[p] = opp;
      s += evalPoint(r, c, opp);
      board[p] = EMPTY;
      // prefer center
      s -= (Math.abs(r - 7) + Math.abs(c - 7)) * 2;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    return best;
  }

  function minimax(depth, alpha, beta, maximizing, aiColor) {
    if (depth === 0) return evaluateBoard(aiColor);
    var color = maximizing ? aiColor : (aiColor === BLACK ? WHITE : BLACK);
    var moves = candidateMoves(1);
    if (moves.length > 24) moves = moves.slice(0, 24);
    if (!moves.length) return 0;
    // order by heuristic
    var scored = moves.map(function (p) {
      var r = (p / N) | 0, c = p % N;
      board[p] = color;
      var sc = evalPoint(r, c, color);
      board[p] = EMPTY;
      return { p: p, sc: sc };
    });
    scored.sort(function (a, b) { return b.sc - a.sc; });
    if (maximizing) {
      var maxE = -Infinity;
      for (var i = 0; i < scored.length; i++) {
        var p = scored[i].p;
        var r = (p / N) | 0, c = p % N;
        board[p] = color;
        var val;
        if (isWin(r, c, color)) val = 100000 - (3 - depth);
        else val = minimax(depth - 1, alpha, beta, false, aiColor);
        board[p] = EMPTY;
        if (val > maxE) maxE = val;
        if (val > alpha) alpha = val;
        if (beta <= alpha) break;
      }
      return maxE;
    } else {
      var minE = Infinity;
      for (var j = 0; j < scored.length; j++) {
        var p2 = scored[j].p;
        var r2 = (p2 / N) | 0, c2 = p2 % N;
        board[p2] = color;
        var val2;
        if (isWin(r2, c2, color)) val2 = -100000 + (3 - depth);
        else val2 = minimax(depth - 1, alpha, beta, true, aiColor);
        board[p2] = EMPTY;
        if (val2 < minE) minE = val2;
        if (val2 < beta) beta = val2;
        if (beta <= alpha) break;
      }
      return minE;
    }
  }

  function pickHard(color) {
    var forced = immediateWinOrBlock(color);
    if (forced != null) return forced;
    var moves = candidateMoves(2);
    var scored = moves.map(function (p) {
      var r = (p / N) | 0, c = p % N;
      board[p] = color;
      var sc = evalPoint(r, c, color);
      board[p] = EMPTY;
      var opp = color === BLACK ? WHITE : BLACK;
      board[p] = opp;
      sc += evalPoint(r, c, opp) * 0.95;
      board[p] = EMPTY;
      return { p: p, sc: sc };
    });
    scored.sort(function (a, b) { return b.sc - a.sc; });
    scored = scored.slice(0, 18);
    var best = scored[0].p, bestVal = -Infinity;
    for (var i = 0; i < scored.length; i++) {
      var p = scored[i].p;
      var r = (p / N) | 0, c = p % N;
      board[p] = color;
      var val;
      if (isWin(r, c, color)) val = 100000;
      else val = minimax(2, -Infinity, Infinity, false, color);
      board[p] = EMPTY;
      if (val > bestVal) { bestVal = val; best = p; }
    }
    return best;
  }

  function aiPick(color) {
    if (settings.diff === "easy") return pickEasy(color);
    if (settings.diff === "normal") return pickNormal(color);
    return pickHard(color);
  }

  function finish(title, msg) {
    over = true;
    statusEl.textContent = title;
    endTitle.textContent = title;
    endMsg.textContent = msg;
    endEl.hidden = false;
  }

  function place(r, c) {
    if (over || suspended) return false;
    var p = idx(r, c);
    if (board[p]) return false;
    board[p] = turn;
    lastMove = p;
    render();
    if (isWin(r, c, turn)) {
      finish(sideName(turn) + "获胜", sideName(turn) + "连成五子！");
      return true;
    }
    if (isFull()) {
      finish("和棋", "棋盘已满，无人五连。");
      return true;
    }
    turn = turn === BLACK ? WHITE : BLACK;
    updateStatus();
    scheduleAI();
    return true;
  }

  function onCellClick(ev) {
    if (over || suspended) return;
    if (settings.mode === "ai" && turn !== settings.humanSide) return;
    var r = +ev.currentTarget.dataset.r;
    var c = +ev.currentTarget.dataset.c;
    place(r, c);
  }

  function scheduleAI() {
    clearTimeout(aiTimer);
    if (over || suspended || settings.mode !== "ai") return;
    if (turn === settings.humanSide) return;
    statusEl.textContent = "电脑思考中…";
    var delay = settings.diff === "hard" ? 280 : settings.diff === "normal" ? 180 : 120;
    aiTimer = setTimeout(function () {
      if (over || suspended) return;
      var p = aiPick(turn);
      var r = (p / N) | 0, c = p % N;
      place(r, c);
    }, delay);
  }

  function readSeg(seg, attr, fallback) {
    var active = seg.querySelector("button.active");
    return active ? active.getAttribute(attr) : fallback;
  }

  function wireSeg(seg, attr) {
    seg.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button");
      if (!btn || !btn.hasAttribute(attr)) return;
      seg.querySelectorAll("button").forEach(function (b) { b.classList.toggle("active", b === btn); });
      syncSetupUI();
    });
  }

  function syncSetupUI() {
    var mode = readSeg(document.getElementById("modeSeg"), "data-mode", "local");
    document.getElementById("diffRow").hidden = mode !== "ai";
    document.getElementById("sideRow").hidden = mode !== "ai";
  }

  function startGame(keepSettings) {
    if (!keepSettings) {
      settings.mode = readSeg(document.getElementById("modeSeg"), "data-mode", "local");
      settings.diff = readSeg(document.getElementById("diffSeg"), "data-diff", "easy");
      var side = readSeg(document.getElementById("sideSeg"), "data-side", "human");
      settings.humanSide = side === "ai" ? WHITE : BLACK;
    }
    setupEl.hidden = true;
    endEl.hidden = true;
    resetBoard();
    scheduleAI();
  }

  document.getElementById("btnStart").addEventListener("click", function () { startGame(false); });
  document.getElementById("btnAgain").addEventListener("click", function () { startGame(true); });
  document.getElementById("btnSetup").addEventListener("click", function () {
    endEl.hidden = true;
    setupEl.hidden = false;
  });
  document.getElementById("btnRestart").addEventListener("click", function () {
    clearTimeout(aiTimer);
    setupEl.hidden = false;
    endEl.hidden = true;
  });
  document.getElementById("btnResign").addEventListener("click", function () {
    if (over || !setupEl.hidden) return;
    var loser = turn;
    if (settings.mode === "ai" && turn !== settings.humanSide) loser = settings.humanSide;
    var winner = loser === BLACK ? WHITE : BLACK;
    finish(sideName(winner) + "获胜", sideName(loser) + "认输。");
  });

  wireSeg(document.getElementById("modeSeg"), "data-mode");
  wireSeg(document.getElementById("diffSeg"), "data-diff");
  wireSeg(document.getElementById("sideSeg"), "data-side");
  syncSetupUI();

  window.addEventListener("message", function (ev) {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== "arcade") return;
    if (ev.data.action === "suspend") {
      suspended = true;
      clearTimeout(aiTimer);
    } else if (ev.data.action === "resume") {
      suspended = false;
      scheduleAI();
    }
  });

  buildBoard();
  resetBoard();
})();
