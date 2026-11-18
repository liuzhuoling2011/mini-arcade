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
  var prevBoard = null;
  var animating = false;

  function idx(r, c) { return r * N + c; }
  function inb(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
  function opp(s) { return s === BLACK ? WHITE : BLACK; }
  function name(s) { return s === BLACK ? "黑棋" : "白棋"; }

  function build() {
    boardEl.innerHTML = "";
    cells = [];
    diskEls = [];
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
    turn = BLACK; over = false; animating = false; clearAnims(); setHot(-1);
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

  var diskEls = []; // persistent .disk nodes per cell

  var FLIP_MS = 300;
  var PLACE_MS = 280;
  var STAGGER_MS = 58;
  var anims = [];
  var rafId = 0;
  var hotCell = -1;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function faceAngle(color) {
    return color === BLACK ? 0 : 180;
  }
  function setDiskAngle(d, ang, lift, bright) {
    var extra = "";
    if (lift) extra += " translateZ(" + lift + "px)";
    d.style.transform = "rotateY(" + ang + "deg)" + extra;
    if (bright != null) d.style.filter = "brightness(" + bright + ")";
    else d.style.filter = "";
  }
  function settleDisk(d, color) {
    d.classList.remove("placed");
    d.classList.toggle("b", color === BLACK);
    d.classList.toggle("w", color === WHITE);
    setDiskAngle(d, faceAngle(color), 0, null);
    d.style.filter = "";
  }
  function tickAnims(now) {
    rafId = 0;
    if (!anims.length) return;
    var still = [];
    for (var i = 0; i < anims.length; i++) {
      var a = anims[i];
      if (a.start == null) a.start = now + (a.delay || 0);
      var t = (now - a.start) / a.dur;
      if (t < 0) { still.push(a); continue; }
      if (t > 1) t = 1;
      if (a.type === "place") {
        var e = easeOutBack(t);
        var y = (1 - e) * -16;
        var sc = 0.55 + 0.45 * e;
        a.el.style.opacity = String(Math.min(1, t * 2.2));
        a.el.style.transform = "rotateY(" + a.ang + "deg) translateY(" + y + "px) scale(" + sc + ")";
        if (t < 1) still.push(a);
        else {
          a.el.style.opacity = "";
          settleDisk(a.el, a.color);
        }
      } else if (a.type === "flip") {
        var p = easeInOutCubic(t);
        var ang = a.fromAng + (a.toAng - a.fromAng) * p;
        var mid = Math.sin(p * Math.PI);
        var lift = mid * 12;
        var bright = 0.72 + 0.28 * Math.abs(Math.cos(ang * Math.PI / 180));
        setDiskAngle(a.el, ang, lift, bright);
        if (t < 1) still.push(a);
        else settleDisk(a.el, a.color);
      }
    }
    anims = still;
    if (anims.length) rafId = requestAnimationFrame(tickAnims);
  }
  function kickAnims() {
    if (!rafId) rafId = requestAnimationFrame(tickAnims);
  }
  function clearAnims() {
    anims = [];
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function ensureDisk(p) {
    if (diskEls[p]) return diskEls[p];
    var wrap = document.createElement("div");
    wrap.className = "disk-wrap";
    var d = document.createElement("div");
    d.className = "disk b";
    var rim = document.createElement("div");
    rim.className = "rim";
    var front = document.createElement("div");
    front.className = "face front";
    var back = document.createElement("div");
    back.className = "face back";
    d.appendChild(rim);
    d.appendChild(front);
    d.appendChild(back);
    wrap.appendChild(d);
    cells[p].appendChild(wrap);
    diskEls[p] = d;
    return d;
  }

  function syncLegalsAndScores() {
    var legals = over || animating ? [] : legalMoves(turn);
    var legalSet = {};
    for (var i = 0; i < legals.length; i++) legalSet[legals[i]] = 1;
    for (var p = 0; p < 64; p++) {
      cells[p].classList.toggle("legal", !!legalSet[p]);
    }
    scoreB.querySelector("strong").textContent = count(BLACK);
    scoreW.querySelector("strong").textContent = count(WHITE);
    scoreB.classList.toggle("active", !over && turn === BLACK);
    scoreW.classList.toggle("active", !over && turn === WHITE);
  }

  function render() {
    clearAnims();
    for (var p = 0; p < 64; p++) {
      if (!board[p]) {
        if (diskEls[p]) {
          diskEls[p].parentNode.style.display = "none";
          settleDisk(diskEls[p], BLACK);
        }
        continue;
      }
      var d = ensureDisk(p);
      d.parentNode.style.display = "";
      settleDisk(d, board[p]);
    }
    syncLegalsAndScores();
  }

  function pulseStatus() {
    statusEl.classList.remove("pulse");
    void statusEl.offsetWidth;
    statusEl.classList.add("pulse");
  }

  function updateStatus(extra) {
    if (over) return;
    var t = name(turn) + "行棋";
    if (settings.mode === "ai") t += turn === settings.humanSide ? "（你）" : "（电脑）";
    var n = legalMoves(turn).length;
    t += " · 可落 " + n + " 处";
    if (extra) t += " · " + extra;
    statusEl.textContent = t;
    pulseStatus();
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
    if (over || suspended || animating) return;
    var color = turn;
    var flips = flipsAt(pos, color);
    if (!flips.length) return;

    board[pos] = color;
    var placed = ensureDisk(pos);
    placed.parentNode.style.display = "";
    placed.style.opacity = "0";
    settleDisk(placed, color);
    anims.push({ type: "place", el: placed, color: color, ang: faceAngle(color), delay: 0, dur: PLACE_MS, start: null });

    animating = true;
    syncLegalsAndScores();

    var r0 = (pos / N) | 0, c0 = pos % N;
    flips = flips.slice().sort(function (a, b) {
      var da = Math.abs(((a / N) | 0) - r0) + Math.abs((a % N) - c0);
      var db = Math.abs(((b / N) | 0) - r0) + Math.abs((b % N) - c0);
      return da - db || a - b;
    });

    var maxEnd = PLACE_MS;
    flips.forEach(function (fp) {
      var from = board[fp];
      board[fp] = color;
      var d = ensureDisk(fp);
      d.parentNode.style.display = "";
      var dist = Math.abs(((fp / N) | 0) - r0) + Math.abs((fp % N) - c0);
      var delay = 70 + Math.max(0, dist - 1) * STAGGER_MS;
      var fromAng = faceAngle(from);
      var toAng = from === BLACK && color === WHITE ? 180
        : from === WHITE && color === BLACK ? 360
        : faceAngle(color);
      setDiskAngle(d, fromAng, 0, null);
      anims.push({ type: "flip", el: d, color: color, fromAng: fromAng, toAng: toAng, delay: delay, dur: FLIP_MS, start: null });
      maxEnd = Math.max(maxEnd, delay + FLIP_MS);
    });
    kickAnims();

    setTimeout(function () {
      animating = false;
      afterMove();
    }, maxEnd + 40);
  }

  function cellFromEvent(ev) {
    var x = ev.clientX, y = ev.clientY;
    if (x == null && ev.changedTouches && ev.changedTouches[0]) {
      x = ev.changedTouches[0].clientX;
      y = ev.changedTouches[0].clientY;
    }
    if (x == null) return -1;
    if (document.elementsFromPoint) {
      var stack = document.elementsFromPoint(x, y);
      for (var i = 0; i < stack.length; i++) {
        var node = stack[i];
        var el = node && node.closest ? node.closest(".cell") : null;
        if (el && el.dataset && el.dataset.i != null && boardEl.contains(el)) return +el.dataset.i;
      }
    }
    for (var p = 0; p < 64; p++) {
      var r = cells[p].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return p;
    }
    return -1;
  }

  function setHot(p) {
    if (hotCell === p) return;
    if (hotCell >= 0 && cells[hotCell]) cells[hotCell].classList.remove("hot");
    hotCell = p;
    if (hotCell >= 0 && cells[hotCell]) cells[hotCell].classList.add("hot");
  }

  function canHumanPlay() {
    if (over || suspended || animating) return false;
    if (settings.mode === "ai" && turn !== settings.humanSide) return false;
    return true;
  }

  function tryPlayAt(ev) {
    if (!canHumanPlay()) return;
    var p = cellFromEvent(ev);
    if (p < 0) return;
    play(p);
  }

  function onClick(ev) {
    ev.preventDefault();
    tryPlayAt(ev);
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

  boardEl.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ev.preventDefault();
    tryPlayAt(ev);
  });
  boardEl.addEventListener("pointermove", function (ev) {
    if (!canHumanPlay()) { setHot(-1); return; }
    var p = cellFromEvent(ev);
    if (p >= 0 && cells[p].classList.contains("legal")) setHot(p);
    else setHot(-1);
  });
  boardEl.addEventListener("pointerleave", function () { setHot(-1); });

  build(); reset();
})();
