(() => {
  "use strict";

  const W = 640, H = 480;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");

  // Hi-DPI: backbuffer = logical 640×480 × devicePixelRatio (capped)
  let dpr = 1;
  function applyDpr() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  }
  applyDpr();

  // Gold frame — thicker candy border; lives in left outer margin
  const FX = 58, FY = 48, FW = 550, FH = 410;
  // Pads match assets/ui/gold-frame.webp hole (73/1100 × 73/790 @2×)
  const FRAME_PAD_X = FW * (73 / 1100);
  const FRAME_PAD_Y = FH * (73 / 790);
  const BORDER = FRAME_PAD_X; // horizontal pad; prefer FRAME_PAD_* for clips
  const PLAY = {
    x: FX + FRAME_PAD_X,
    y: FY + FRAME_PAD_Y,
    w: FW - FRAME_PAD_X * 2,
    h: FH - FRAME_PAD_Y * 2,
  };
  // Inner yellow edge (before dark rim/bevel) — fill here AFTER frame so blue flush-meets gold
  const FRAME_FILL_PAD_X = FW * (42 / 1100);
  const FRAME_FILL_PAD_Y = FH * (42 / 790);
  function fillFrameHole(x, y, w, h, style) {
    const fpx = w * (42 / 1100), fpy = h * (42 / 790);
    const ix = x + fpx, iy = y + fpy, iw = w - fpx * 2, ih = h - fpy * 2;
    const rr = Math.min(12, fpx * 0.4, fpy * 0.4);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ix + rr, iy);
    ctx.arcTo(ix + iw, iy, ix + iw, iy + ih, rr);
    ctx.arcTo(ix + iw, iy + ih, ix, iy + ih, rr);
    ctx.arcTo(ix, iy + ih, ix, iy, rr);
    ctx.arcTo(ix, iy, ix + iw, iy, rr);
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
    ctx.restore();
  }

  const keys = Object.create(null);
  let pointer = null;
  let pointerDown = false;
  let kbdActive = false; // arrow/WASD held → ignore pointer follow

  let mode = "loading"; // loading | title | help | play | over | win
  let paused = false;
  // Set when boot picks a screen, or when the player starts a round early
  // (help/over retry) so a late asset callback cannot snap back to the hash screen.
  let bootCommitted = false;

  // Virtual joystick (phone/tablet) — HTML overlay in letterbox, NOT on canvas
  const joypad = document.getElementById("joypad");
  const joycanvas = document.getElementById("joycanvas");
  const joyctx = joycanvas ? joycanvas.getContext("2d") : null;
  const joy = {
    enabled: false,
    active: false,
    touchId: null,
    ox: 0, oy: 0,   // nest center in joypad CSS px
    dx: 0, dy: 0,   // stick offset in joypad CSS px
    baseR: 48,
    stickR: 22,
    maxD: 36,
    cssSize: 120,
  };
  function detectTouchUI() {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const touchPts = (navigator.maxTouchPoints || 0) > 0;
    const small = Math.min(window.innerWidth, window.innerHeight) < 900;
    joy.enabled = !!(coarse || touchPts || ("ontouchstart" in window && small));
    layoutJoypad();
  }
  function safeInset(side) {
    // env() not readable from JS reliably; keep a modest pad for notches
    return 10;
  }
  /** Place stick in empty margin left/bottom of letterboxed stage (portrait & landscape). */
  function layoutJoypad() {
    if (!joypad || !joycanvas) return;
    if (!joy.enabled) {
      joypad.classList.remove("on");
      joypad.setAttribute("aria-hidden", "true");
      return;
    }
    const sr = stage.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const safeL = safeInset("left");
    const safeB = safeInset("bottom");
    const safeR = safeInset("right");
    const short = Math.min(vw, vh);
    const size = Math.round(Math.min(150, Math.max(104, short * 0.24)));
    joy.cssSize = size;
    joy.baseR = Math.round(size * 0.42);
    joy.stickR = Math.round(size * 0.20);
    joy.maxD = Math.round(size * 0.32);
    joy.ox = size / 2;
    joy.oy = size / 2;

    const gapBelow = vh - sr.bottom;
    const gapLeft = sr.left;
    const gapRight = vw - sr.right;
    let left, top;

    if (gapBelow >= size + safeB + 4) {
      // Portrait / tall: sit in bottom letterbox, left side
      left = Math.max(safeL, Math.min(sr.left + 4, vw - size - safeR));
      top = vh - size - safeB;
      if (top < sr.bottom + 2) top = sr.bottom + 2;
    } else if (gapLeft >= size + safeL + 4) {
      // Landscape: sit in left letterbox, lower end
      left = Math.max(safeL, sr.left - size - 8);
      top = Math.min(vh - size - safeB, Math.max(sr.top + 8, sr.bottom - size - 4));
    } else if (gapRight >= size + safeR + 4 && gapLeft < gapRight) {
      // Rare: more room on right — still prefer lower-left of viewport if possible
      left = safeL;
      top = vh - size - safeB;
      // If that overlaps stage heavily, fall back to right margin bottom
      if (left + size > sr.left + 8) {
        left = Math.min(vw - size - safeR, sr.right + 8);
        top = Math.min(vh - size - safeB, Math.max(sr.top + 8, sr.bottom - size - 4));
      }
    } else {
      // Tiny margins: park at viewport bottom-left, prefer below/left of stage chrome
      left = safeL;
      top = vh - size - safeB;
      if (gapBelow > 24) top = Math.max(top, sr.bottom + 2);
      if (gapLeft > 24) left = Math.max(safeL, sr.left - size - 4);
    }

    joypad.style.left = Math.round(left) + "px";
    joypad.style.top = Math.round(top) + "px";
    joypad.style.width = size + "px";
    joypad.style.height = size + "px";
    const d = Math.min(window.devicePixelRatio || 1, 3);
    joycanvas.width = Math.round(size * d);
    joycanvas.height = Math.round(size * d);
    if (joyctx) {
      joyctx.setTransform(d, 0, 0, d, 0, 0);
      joyctx.imageSmoothingEnabled = true;
    }
    syncJoypadVisibility();
    drawJoystick();
  }
  function syncJoypadVisibility() {
    if (!joypad) return;
    const show = joy.enabled && mode === "play" && !paused;
    joypad.classList.toggle("on", show);
    joypad.setAttribute("aria-hidden", show ? "false" : "true");
    if (!show && joy.active) {
      joy.active = false;
      joy.touchId = null;
      joy.dx = 0;
      joy.dy = 0;
    }
  }
  detectTouchUI();
  window.addEventListener("resize", detectTouchUI);
  window.addEventListener("orientationchange", () => setTimeout(detectTouchUI, 60));
  window.__bfQA = {
    over(){ deathFish = null; score = 12345; mode = "over"; syncJoypadVisibility(); },
    win(){ deathFish = { x: 420, y: 320, size: 52 }; score = 105756; mode = "win"; syncJoypadVisibility(); },
    play(){ startGame(); },
    joy(){ joy.enabled = true; layoutJoypad(); },
    pause(){ togglePause(); },
    state(){
      return {
        mode,
        paused,
        score,
        lives,
        timeSec,
        audio: audioCtx ? audioCtx.state : "none",
      };
    },
  };

  let score = 0;
  let lives = 3;
  let level = 1;
  let timeSec = 0;
  let playTime = 0;
  let invuln = 0;
  let growFlash = 0;
  let popups = [];
  let bubbles = [];
  let fish = [];
  let player = null;
  let btnHover = null;
  let deathFish = null;
  let shake = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function fitStage() {
    applyDpr();
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = `translate(-50%,-50%) scale(${s})`;
    layoutJoypad();
  }
  window.addEventListener("resize", fitStage);
  fitStage();

  // ─── Original SWF assets (WebP + phased load for slow nets) ───
  const ASSET_VER = "v24";
  const ASSET = {
    ready: false,       // title-critical ready
    playReady: false,   // enough to start a round
    deferReady: false,
    loadProgress: 0,    // 0..1 overall-ish
    loadLabel: "加载中…",
    npc: [],
    npcStill: [],
    npcSvg: [],
    player: { swim: [], chomp: [], hit: [], idle: null, chompStill: null, hurt: null, svg: null },
    sfx: {},
    sfxBuf: {},
    ui: {},
    seabed: {},
    digits: { score: [], timer: [], colon: null },
    eatMc: { digits: [], bang: null },
  };

  function assetUrl(path) {
    const p = path.startsWith("assets/") ? path : ("assets/" + path);
    return p + (p.includes("?") ? "&" : "?") + "v=" + ASSET_VER;
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = assetUrl(src);
    });
  }

  function loadAudio(src) {
    const a = new Audio(assetUrl(src));
    a.preload = "none";
    a.crossOrigin = "anonymous";
    return a;
  }

  let audioCtx = null;
  // True once beginRound/pause asked for music. Playback waits out autoplay.
  let bgmWanted = false;
  // Core SFX only — gulps unused; BGM deferred
  const SFX_CORE = {
    eat: "assets/sfx/Eat2.mp3",
    bonk: "assets/sfx/bonk.mp3",
    splash: "assets/sfx/_splash.mp3",
    sploosh: "assets/sfx/_sploosh.mp3",
    flash: "assets/sfx/flash.mp3",
  };
  const SFX_DEFER = {
    win: "assets/sfx/gamewin.mp3",
    lose: "assets/sfx/gameLost.mp3",
    bgm: "assets/sfx/_koi.mp3",
  };
  const SFX_URLS = Object.assign({}, SFX_CORE, SFX_DEFER);

  function ensureAudioCtx() {
    if (audioCtx) return audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
  }

  async function decodeSfxBuffer(name, url) {
    try {
      const ctx = ensureAudioCtx();
      if (!ctx) return null;
      const res = await fetch(assetUrl(url));
      const ab = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab.slice(0));
      ASSET.sfxBuf[name] = buf;
      return buf;
    } catch (_) {
      return null;
    }
  }

  function sliceAtlas(atlasImg, frames) {
    if (!atlasImg || !frames) return [];
    return frames.map((f) => {
      const c = document.createElement("canvas");
      c.width = f.w;
      c.height = f.h;
      const cctx = c.getContext("2d");
      cctx.drawImage(atlasImg, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      return c;
    });
  }

  async function loadDigitAtlases() {
    const [meta, scoreAtlas, timerAtlas, eatAtlas] = await Promise.all([
      fetch(assetUrl("assets/ui/atlases/digits.json")).then((r) => r.json()).catch(() => null),
      loadImage("assets/ui/atlases/score-digits.webp"),
      loadImage("assets/ui/atlases/timer-digits.webp"),
      loadImage("assets/ui/atlases/eat-digits.webp"),
    ]);
    if (meta && scoreAtlas) {
      ASSET.digits.score = sliceAtlas(scoreAtlas, meta.score.frames);
    }
    if (meta && timerAtlas) {
      const frames = sliceAtlas(timerAtlas, meta.timer.frames);
      ASSET.digits.timer = frames.slice(0, 10);
      ASSET.digits.colon = frames[10] || null;
    }
    if (meta && eatAtlas) {
      const frames = sliceAtlas(eatAtlas, meta.eat.frames);
      ASSET.eatMc.digits = frames.slice(0, 10);
      ASSET.eatMc.bang = frames[10] || null;
    }
  }

  function setProgress(p, label) {
    ASSET.loadProgress = clamp(p, 0, 1);
    if (label) ASSET.loadLabel = label;
  }

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    async function worker() {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }
    const n = Math.min(limit, items.length) || 1;
    await Promise.all(Array.from({ length: n }, worker));
    return out;
  }

  async function loadImageMap(entries, concurrency = 6) {
    const keys = Object.keys(entries);
    const vals = await mapLimit(keys, concurrency, (k) => loadImage(entries[k]));
    const out = {};
    keys.forEach((k, i) => { out[k] = vals[i]; });
    return out;
  }

  // Phase 1 — frame + water. Title buttons are not on the way into a round.
  async function loadCritical() {
    setProgress(0.05, "加载游戏…");
    const ui = await loadImageMap({
      logo: "assets/ui/logo.webp",
      goldFrame: "assets/ui/gold-frame.webp",
      bgBubbles: "assets/ui/bg-bubbles.webp",
    });
    Object.assign(ASSET.ui, ui);
    setProgress(0.22, "准备水域…");
    ASSET.ready = !!(ASSET.ui.goldFrame || ASSET.ui.logo || ASSET.ui.bgBubbles);
  }

  // Phase 2 — enough to play a round
  async function loadPlayPack() {
    setProgress(0.32, "加载游戏…");
    const ui = await loadImageMap({
      logoHud: "assets/ui/logo-hud.webp",
      clock: "assets/ui/clock.webp",
      scorePlaque: "assets/ui/score-plaque.webp",
      lifeFish: "assets/ui/life-fish.webp",
    });
    Object.assign(ASSET.ui, ui);
    ASSET.seabed.stripPlay = await loadImage("assets/seabed/strip-play.webp");
    setProgress(0.42, "加载字体…");
    await loadDigitAtlases();

    setProgress(0.5, "加载小鱼…");
    // HD @3x originals (pixel-identical to SWF sprites, sharp when large)
    const hdStills = await mapLimit([1,2,3,4,5,6,7,8], 4, (t) =>
      loadImage(`assets/fish/npc/type${t}/1.webp`));
    ASSET.npcStill = hdStills;
    ASSET.npcSvg = hdStills; // same art; kept for callers
    ASSET.npc = hdStills.map((im) => (im ? [im] : []));

    setProgress(0.62, "加载玩家…");
    const swim = await mapLimit([1,2,3,4,5,6], 4, (i) =>
      loadImage(`assets/fish/player/swim/${String(i).padStart(2, "0")}.webp`));
    ASSET.player.swim = swim.filter(Boolean);
    ASSET.player.svg = ASSET.player.swim[0] || await loadImage("assets/fish/svg-raster/player.webp");
    ASSET.player.idle = ASSET.player.svg || ASSET.player.swim[0] || null;
    // Life icons = player fish style
    ASSET.ui.lifeFish = ASSET.player.idle || ASSET.ui.lifeFish || await loadImage("assets/ui/life-fish.webp");

    for (const [k, url] of Object.entries(SFX_CORE)) {
      ASSET.sfx[k] = loadAudio(url);
    }
    // Decode eat ASAP after first gesture; prefetch buffers in background
    for (const [k, url] of Object.entries(SFX_CORE)) {
      decodeSfxBuffer(k, url);
    }

    setProgress(0.78, "即将开始");
    ASSET.playReady = !!(ASSET.player.idle || ASSET.npcStill.some(Boolean));
  }

  // Phase 3 — polish / help / game-over / anim frames / BGM
  async function loadDeferred() {
    setProgress(0.82, "加载动画…");
    const chomp = await mapLimit([1,2,3,4,5,6,7], 4, (i) =>
      loadImage(`assets/fish/player/chomp/${String(i).padStart(2, "0")}.webp`));
    const hit = await mapLimit([1,2,3,4,5,6,7], 4, (i) =>
      loadImage(`assets/fish/player/hit/${String(i).padStart(2, "0")}.webp`));
    ASSET.player.chomp = chomp.filter(Boolean);
    ASSET.player.hit = hit.filter(Boolean);
    ASSET.player.chompStill = ASSET.player.chomp[0] || null;
    ASSET.player.hurt = ASSET.player.hit[4] || ASSET.player.hit[0] || null;

    // Fill NPC swim cycles (frames 2–4)
    await mapLimit([1,2,3,4,5,6,7,8], 3, async (t) => {
      const more = await mapLimit([2,3,4], 3, (f) =>
        loadImage(`assets/fish/npc/type${t}/${f}.webp`));
      const base = ASSET.npc[t - 1] || [];
      ASSET.npc[t - 1] = base.concat(more.filter(Boolean));
    });

    setProgress(0.92, "加载界面…");
    const ui = await loadImageMap({
      btnStart: "assets/ui/btn-start-up.webp",
      btnStartOver: "assets/ui/btn-start-over.webp",
      btnStartDown: "assets/ui/btn-start-down.webp",
      btnHelp: "assets/ui/btn-help-up.webp",
      btnHelpOver: "assets/ui/btn-help-over.webp",
      btnHelpDown: "assets/ui/btn-help-down.webp",
      btnNext: "assets/ui/btn-next.webp",
      helpPanel: "assets/ui/help-panel.webp",
      gameOver: "assets/ui/game-over.webp",
      congratulation: "assets/ui/congratulation.webp",
      gameoverScore: "assets/ui/gameover-score.webp",
      gameoverLabel: "assets/ui/gameover-label.webp",
    });
    Object.assign(ASSET.ui, ui);
    if (!ASSET.seabed.stripTitle) {
      ASSET.seabed.stripTitle = await loadImage("assets/seabed/strip-title.webp");
    }

    for (const [k, url] of Object.entries(SFX_DEFER)) {
      ASSET.sfx[k] = loadAudio(url);
    }
    if (ASSET.sfx.bgm) {
      ASSET.sfx.bgm.loop = true;
      ASSET.sfx.bgm.volume = 0.35;
    }
    // Round may already be running; start music if autoplay allows, else the next gesture retries.
    if (bgmWanted) ensureBgm(true);
    for (const [k, url] of Object.entries(SFX_DEFER)) {
      if (k === "bgm") continue;
      decodeSfxBuffer(k, url);
    }

    setProgress(1, "完成");
    ASSET.deferReady = true;
  }

  let _playPackPromise = null;
  let _deferPromise = null;

  function bootQaMode() {
    const q = new URLSearchParams(location.search);
    if (q.get("qa") !== "1") return "";
    return q.get("mode") || "title";
  }

  // Fresh visits enter play. Hash screens and ?qa=1&mode=title stay available.
  function enterBootMode(bootHash) {
    if (bootCommitted) return;
    bootCommitted = true;
    const qaMode = bootQaMode();
    if (bootHash === "#over") {
      score = 12345; lives = 0;
      deathFish = { x: 560, y: 220, size: 18 };
      mode = "over";
      syncJoypadVisibility();
      return;
    }
    if (bootHash === "#win") {
      score = 105756; lives = 3;
      deathFish = { x: 560, y: 220, size: 80 };
      mode = "win";
      syncJoypadVisibility();
      return;
    }
    if (bootHash === "#help" || qaMode === "help") {
      mode = "help";
      syncJoypadVisibility();
      return;
    }
    if (qaMode === "title") {
      mode = "title";
      syncJoypadVisibility();
      return;
    }
    if (mode === "loading" || mode === "title") beginRound();
  }

  async function loadAssets() {
    mode = "loading";
    const bootHash = location.hash || "";
    try {
      await loadCritical();
      _playPackPromise = loadPlayPack().then(() => {
        _deferPromise = loadDeferred().catch(() => {});
      });
      await _playPackPromise;
      enterBootMode(bootHash);
    } catch (err) {
      console.warn("asset load", err);
      ASSET.ready = true;
      ASSET.playReady = true;
      enterBootMode(bootHash);
    }
  }

  function ensurePlayAssets() {
    if (ASSET.playReady) return Promise.resolve();
    return _playPackPromise || loadPlayPack();
  }

  function playSfx(name, { volume = 1 } = {}) {
    // Prefer WebAudio buffer (instant); fall back to cloned HTMLAudio
    const buf = ASSET.sfxBuf[name];
    const ctx = audioCtx || ensureAudioCtx();
    if (buf && ctx) {
      try {
        if (ctx.state === "suspended") {
          const resumed = ctx.resume();
          if (resumed && resumed.catch) resumed.catch(() => {});
          // Autoplay blocked. Drop this one-shot; the round keeps running.
          if (ctx.state !== "running") return;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(0);
        return;
      } catch (_) {}
    }
    const a = ASSET.sfx[name];
    if (!a) return;
    try {
      const node = a.cloneNode ? a.cloneNode(true) : a;
      node.volume = volume;
      const p = node.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }

  function playEatSfx(/* fishsize */) {
    // SWF: SFXburp.attachSound("eat2"); SFXburp.start() — immediate, no gulp delay
    playSfx("eat", { volume: 1 });
  }

  function ensureBgm(on) {
    bgmWanted = !!on;
    const a = ASSET.sfx.bgm;
    if (!a) return;
    if (on) {
      if (!a.paused) return;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      try { a.pause(); } catch (_) {}
    }
  }

  loadAssets();



  function initBubbles() {
    bubbles = [];
    for (let i = 0; i < 14; i++) {
      bubbles.push({
        x: rand(0, W),
        y: rand(0, H),
        r: rand(8, 36),
        vy: rand(-12, -3),
        a: rand(0.10, 0.28),
      });
    }
  }
  initBubbles();

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function lighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function drawAsset(img, x, y, w, h) {
    if (!img) return false;
    if (w == null) w = img.width;
    if (h == null) h = img.height;
    ctx.drawImage(img, x, y, w, h);
    return true;
  }

  function drawAssetCentered(img, cx, cy, scale) {
    if (!img) return false;
    scale = scale || 1;
    // scale may be a multiplier on *logical* size if asset is HD —
    // prefer drawAssetSized when you know the on-screen box.
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    return true;
  }

  function drawAssetSized(img, cx, cy, maxW, maxH) {
    if (!img) return false;
    let w = maxW, h = maxW * (img.height / img.width);
    if (maxH != null && h > maxH) {
      h = maxH;
      w = maxH * (img.width / img.height);
    }
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    return true;
  }

  // ─── Outer ambient ───────────────────────────────────────
  function drawOuterBg() {
    ctx.fillStyle = "#015BE6";
    ctx.fillRect(0, 0, W, H);
    const bub = ASSET.ui.bgBubbles;
    if (bub) {
      // Original SWF shape 300 bubble field (transparent extract)
      drawAsset(bub, 0, 0, W, H);
    }
    // Soft animated bubbles on top (sparse) for life
    for (const b of bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${b.a * 0.45})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.15, b.y - b.r * 0.15, b.r * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${b.a * 0.35})`;
      ctx.fill();
    }
  }


  // ─── Crisp calculator / 7-segment digits (vector, any DPR) ──
  const SEG7 = {
    "0": [1,1,1,1,1,1,0],
    "1": [0,1,1,0,0,0,0],
    "2": [1,1,0,1,1,0,1],
    "3": [1,1,1,1,0,0,1],
    "4": [0,1,1,0,0,1,1],
    "5": [1,0,1,1,0,1,1],
    "6": [1,0,1,1,1,1,1],
    "7": [1,1,1,0,0,0,0],
    "8": [1,1,1,1,1,1,1],
    "9": [1,1,1,1,0,1,1],
  };

  function segPath(ctx, x, y, w, h, t) {
    // Horizontal capsule
    const r = t * 0.5;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawSevenSegDigit(ch, x, y, dw, dh, onColor, offColor) {
    const bits = SEG7[ch];
    if (!bits) return;
    const t = Math.max(2.0, Math.min(dw, dh) * 0.20);
    const gap = t * 0.35;
    const ix = x + t * 0.55;
    const iy = y + t * 0.55;
    const iw = dw - t * 1.1;
    const ih = dh - t * 1.1;
    const midY = iy + ih * 0.5;
    const segs = [
      // a top
      [ix + gap, iy, iw - gap * 2, t],
      // b upper-right
      [ix + iw - t, iy + gap, t, ih * 0.5 - gap * 1.2],
      // c lower-right
      [ix + iw - t, midY + gap * 0.4, t, ih * 0.5 - gap * 1.2],
      // d bottom
      [ix + gap, iy + ih - t, iw - gap * 2, t],
      // e lower-left
      [ix, midY + gap * 0.4, t, ih * 0.5 - gap * 1.2],
      // f upper-left
      [ix, iy + gap, t, ih * 0.5 - gap * 1.2],
      // g middle
      [ix + gap, midY - t * 0.5, iw - gap * 2, t],
    ];
    for (let i = 0; i < 7; i++) {
      const [sx, sy, sw, sh] = segs[i];
      if (sw <= 0 || sh <= 0) continue;
      segPath(ctx, sx, sy, sw, sh, Math.min(sw, sh));
      ctx.fillStyle = bits[i] ? onColor : (offColor || "rgba(255,255,255,0.0)");
      ctx.fill();
    }
  }

  function measureSevenSeg(text, digW, gap) {
    let w = 0;
    for (const ch of text) {
      if (ch === ":") w += digW * 0.38 + gap * 0.4;
      else if (ch >= "0" && ch <= "9") w += digW + gap;
    }
    return Math.max(0, w - gap);
  }

  /** Draw calculator-style digit string. Returns end x. */
  function drawSevenSegString(text, x, y, digW, digH, gap, onColor, offColor) {
    let cx = x;
    for (const ch of text) {
      if (ch === ":") {
        const r = Math.max(1.2, digH * 0.09);
        ctx.fillStyle = onColor;
        ctx.beginPath(); ctx.arc(cx + digW * 0.16, y + digH * 0.32, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + digW * 0.16, y + digH * 0.68, r, 0, Math.PI * 2); ctx.fill();
        cx += digW * 0.38 + gap * 0.4;
        continue;
      }
      if (ch < "0" || ch > "9") continue;
      drawSevenSegDigit(ch, cx, y, digW, digH, onColor, offColor);
      cx += digW + gap;
    }
    return cx;
  }

  function drawLcdWell(x, y, w, h, radius) {
    // Recessed plaque well — soft navy/brown, not a floating black slab
    roundRect(x - 1, y - 1, w + 2, h + 2, (radius == null ? 4 : radius) + 1);
    ctx.fillStyle = "rgba(40, 22, 0, 0.35)";
    ctx.fill();
    roundRect(x, y, w, h, radius == null ? 4 : radius);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "#2A1A0A");
    g.addColorStop(0.5, "#1A1208");
    g.addColorStop(1, "#120C06");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 220, 120, 0.18)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Pause control fused beside TIME clock (top-right)
  function pauseBtnRect() {
    // Sit just left of vector clock body (ox = FX+FW-12, oy = FY+18, r=36)
    const ox = FX + FW - 12;
    const oy = FY + 18;
    const bw = 34, bh = 34;
    return { x: ox - 36 - bw - 8, y: oy - bh / 2, w: bw, h: bh };
  }

  function hitPauseBtn(p) {
    if (mode !== "play") return false;
    const r = pauseBtnRect();
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  function togglePause() {
    if (mode !== "play") return;
    paused = !paused;
    ensureBgm(!paused);
    syncJoypadVisibility();
  }

  function drawPauseBtn() {
    const r = pauseBtnRect();
    ctx.save();
    // Gold disc matching HUD chrome
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, "#FFE456");
    g.addColorStop(1, "#E0A000");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#3D2200";
    ctx.stroke();
    ctx.fillStyle = "#3D2200";
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (paused) {
      // play triangle
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 8);
      ctx.lineTo(cx - 5, cy + 8);
      ctx.lineTo(cx + 9, cy);
      ctx.closePath();
      ctx.fill();
    } else {
      // pause bars
      ctx.fillRect(cx - 7, cy - 8, 5, 16);
      ctx.fillRect(cx + 2, cy - 8, 5, 16);
    }
    ctx.restore();
  }

  function drawPauseOverlay() {
    if (!paused || mode !== "play") return;
    ctx.save();
    ctx.fillStyle = "rgba(8, 30, 70, 0.35)";
    roundRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h, 8);
    ctx.fill();
    ctx.font = "bold 28px Microsoft YaHei, PingFang SC, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0A2A5A";
    ctx.strokeText("暂停", PLAY.x + PLAY.w / 2, PLAY.y + PLAY.h / 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("暂停", PLAY.x + PLAY.w / 2, PLAY.y + PLAY.h / 2);
    ctx.font = "14px Microsoft YaHei, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("点击 ▶ 或按 P / Esc 继续", PLAY.x + PLAY.w / 2, PLAY.y + PLAY.h / 2 + 32);
    ctx.restore();
  }

  /** Draw SWF bitmap digit string. fonts = Image[10], optional colon Image */
  function drawBitmapDigits(fonts, text, x, y, h, gap, colonImg) {
    if (!fonts || !fonts.length) return x;
    let cx = x;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ":") {
        const img = colonImg;
        if (img) {
          const dw = h * (img.width / img.height);
          ctx.drawImage(img, cx, y, dw, h);
          cx += dw + gap * 0.35;
        } else {
          ctx.fillStyle = "#E8D84A";
          const r = Math.max(1.2, h * 0.08);
          ctx.beginPath(); ctx.arc(cx + r, y + h * 0.32, r, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + r, y + h * 0.68, r, 0, Math.PI * 2); ctx.fill();
          cx += r * 2.8 + gap * 0.35;
        }
        continue;
      }
      if (ch < "0" || ch > "9") continue;
      const img = fonts[ch | 0];
      if (!img) continue;
      const dw = h * (img.width / img.height);
      ctx.drawImage(img, cx, y, dw, h);
      cx += dw + gap;
    }
    return cx;
  }

  /**
   * SWF eat_mc popup — fish silhouette + bonus digits + !!
   * Timeline (DefineSprite_54, 15f @30fps): rise y 30→-20, alpha 0→1 over ~8f, hold.
   */
  function eatMcSample(age) {
    // Keyframes from FFDec SVG transforms / opacity on frames 1..9
    const keys = [
      { t: 0 / 30, y: 30, a: 0 },
      { t: 1 / 30, y: 18.3, a: 0.231 },
      { t: 2 / 30, y: 8.15, a: 0.435 },
      { t: 3 / 30, y: -0.45, a: 0.608 },
      { t: 4 / 30, y: -7.5, a: 0.749 },
      { t: 5 / 30, y: -12.95, a: 0.859 },
      { t: 6 / 30, y: -16.85, a: 0.937 },
      { t: 7 / 30, y: -19.2, a: 0.984 },
      { t: 8 / 30, y: -20, a: 1 },
      { t: 14 / 30, y: -20, a: 1 },
    ];
    if (age <= 0) return keys[0];
    for (let i = 1; i < keys.length; i++) {
      if (age <= keys[i].t) {
        const a0 = keys[i - 1], a1 = keys[i];
        const u = (age - a0.t) / Math.max(1e-6, a1.t - a0.t);
        return {
          y: a0.y + (a1.y - a0.y) * u,
          a: a0.a + (a1.a - a0.a) * u,
        };
      }
    }
    return keys[keys.length - 1];
  }

  function drawEatMc(p) {
    const samp = eatMcSample(p.age || 0);
    const cx = p.x;
    const cy = p.y + samp.y * 0.85; // slight scale into playfield
    ctx.save();
    ctx.globalAlpha = clamp(samp.a, 0, 1);

    const digH = 28;
    const digits = String(p.bonus | 0);
    const fonts = ASSET.eatMc.digits;
    const bang = ASSET.eatMc.bang;
    const gap = 1;

    // Measure digit strip
    let digW = 0;
    const digImgs = [];
    if (fonts && fonts.length) {
      for (const ch of digits) {
        const img = fonts[ch | 0];
        if (!img) continue;
        const dw = digH * (img.width / img.height);
        digImgs.push({ img, dw });
        digW += dw + gap;
      }
      if (digImgs.length) digW -= gap;
    }

    const bangH = 30;
    const bangW = bang ? bangH * (bang.width / bang.height) : 22;
    const fishH = 26;
    let fishImg = null;
    if (p.artType && ASSET.npcStill[p.artType - 1]) {
      fishImg = ASSET.npcStill[p.artType - 1];
    } else if (ASSET.npcStill[0]) {
      fishImg = ASSET.npcStill[0];
    }
    const fishW = fishImg ? fishH * (fishImg.width / fishImg.height) : 32;

    // Layout: [fish][digits][!!] centered on eat point (SWF: fish left, digits, bang)
    const totalW = fishW + 6 + digW + 4 + bangW;
    let x = cx - totalW / 2;
    const midY = cy;

    if (fishImg) {
      ctx.drawImage(fishImg, x, midY - fishH / 2, fishW, fishH);
    }
    x += fishW + 6;

    if (digImgs.length) {
      for (const d of digImgs) {
        ctx.drawImage(d.img, x, midY - digH / 2, d.dw, digH);
        x += d.dw + gap;
      }
    } else {
      // Fallback canvas text
      ctx.font = "bold 22px Impact, Arial Black, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#1a3a66";
      ctx.strokeText(digits, x, midY);
      ctx.fillStyle = "#E8F4FF";
      ctx.fillText(digits, x, midY);
      x += ctx.measureText(digits).width + 4;
    }

    if (bang) {
      ctx.drawImage(bang, x + 2, midY - bangH / 2, bangW, bangH);
    } else {
      ctx.font = "bold 26px Impact, sans-serif";
      ctx.fillStyle = "#FF8A00";
      ctx.strokeStyle = "#3D1A00";
      ctx.lineWidth = 3;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.strokeText("!!", x + 2, midY);
      ctx.fillText("!!", x + 2, midY);
    }

    ctx.restore();
  }

  // ─── Candy gold frame (original SWF shape, fallback vector) ──
  function drawGoldFrame() {
    const gf = ASSET.ui.goldFrame;
    if (gf) {
      // Under-paint, draw frame, then over-paint hole to yellow edge (covers dark rim)
      ctx.save();
      const wg = ctx.createLinearGradient(0, FY, 0, FY + FH);
      wg.addColorStop(0, "#5CC3FF");
      wg.addColorStop(0.45, "#40AAFF");
      wg.addColorStop(1, "#2A88DD");
      ctx.fillStyle = wg;
      ctx.fillRect(FX + 1, FY + 1, FW - 2, FH - 2);
      ctx.restore();
      drawAsset(gf, FX, FY, FW, FH);
      {
        const wg2 = ctx.createLinearGradient(0, FY, 0, FY + FH);
        wg2.addColorStop(0, "#5CC3FF");
        wg2.addColorStop(0.45, "#40AAFF");
        wg2.addColorStop(1, "#2A88DD");
        fillFrameHole(FX, FY, FW, FH, wg2);
      }
      return;
    }
    ctx.save();
    const rOut = 22, rIn = 10;
    roundRect(FX - 2, FY - 2, FW + 4, FH + 4, rOut + 2);
    ctx.fillStyle = "#3D2200";
    ctx.fill();
    roundRect(FX, FY, FW, FH, rOut);
    const body = ctx.createLinearGradient(FX, FY, FX, FY + FH);
    body.addColorStop(0, "#FFE456");
    body.addColorStop(0.35, "#FFD01F");
    body.addColorStop(0.7, "#F5B800");
    body.addColorStop(1, "#E0A000");
    ctx.fillStyle = body;
    ctx.fill();
    roundRect(FX + FRAME_PAD_X, FY + FRAME_PAD_Y, FW - FRAME_PAD_X * 2, FH - FRAME_PAD_Y * 2, rIn);
    const wg = ctx.createLinearGradient(0, FY, 0, FY + FH);
    wg.addColorStop(0, "#5CC3FF");
    wg.addColorStop(0.45, "#40AAFF");
    wg.addColorStop(1, "#2A88DD");
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.restore();
  }

  // ─── Seabed + props (vector props flush to gold-frame water; no nested strip frame) ────────
  function drawSeabed(clip) {
    ctx.save();
    if (clip) {
      roundRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h, 10);
      ctx.clip();
    }
    const left = PLAY.x;
    const right = PLAY.x + PLAY.w;
    const baseY = PLAY.y + PLAY.h - 2;
    // Intentionally skip strip-play.webp — it baked a nested black/gold mini-frame
    // that floated as a misaligned "half-frame" inside the playfield.
    // Fallback vector seabed
    ctx.beginPath();
    ctx.moveTo(left, baseY + 6);
    ctx.lineTo(left, baseY - 28);
    const pts = [
      [30, -22], [60, -36], [100, -20], [140, -42], [190, -18],
      [240, -34], [290, -16], [340, -38], [390, -20], [440, -30],
      [490, -18], [right - left, -24],
    ];
    for (const [x, dy] of pts) ctx.lineTo(left + x, baseY + dy);
    ctx.lineTo(right, baseY + 6);
    ctx.closePath();
    ctx.fillStyle = "#6B7388";
    ctx.fill();
    drawKelp(left + 28, baseY - 6, 1.55);
    drawKelp(left + 58, baseY - 2, 1.25);
    drawCrab(left + 120, baseY - 4, 1.35);
    drawClam(left + 195, baseY - 2, 1.3);
    drawAnemone(left + 270, baseY - 2, 1.35);
    drawSpottedShell(left + 345, baseY, 1.3);
    drawSmileStar(left + 415, baseY - 2, 1.25);
    drawKelp(right - 55, baseY - 4, 1.4);
    drawKelp(right - 28, baseY - 8, 1.6);
    ctx.restore();
  }

  function drawKelp(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0D3D0D";
    ctx.lineJoin = "round";
    // tall bubbly stalk — stacked rounded lobes with center crease
    const segs = [
      [0, 0, 13, 18], [-5, -20, 14, 20], [4, -42, 13, 19],
      [-3, -64, 12, 18], [3, -84, 11, 16], [-2, -102, 9, 14],
    ];
    for (const [ox, oy, rw, rh] of segs) {
      ctx.fillStyle = "#3ECB45";
      ctx.beginPath();
      ctx.ellipse(ox, oy, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // darker crease
      ctx.strokeStyle = "#1A7A22";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox, oy - rh * 0.6);
      ctx.lineTo(ox - 1, oy + rh * 0.5);
      ctx.stroke();
      ctx.strokeStyle = "#0D3D0D";
      ctx.lineWidth = 3;
      // highlight
      ctx.fillStyle = "rgba(180,255,160,0.35)";
      ctx.beginPath();
      ctx.ellipse(ox - rw * 0.35, oy - rh * 0.15, rw * 0.28, rh * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCrab(x, y, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.lineJoin = "round";
    // body
    ctx.fillStyle = "#E53935";
    ctx.beginPath();
    ctx.ellipse(0, 2, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // claws raised
    ctx.beginPath();
    ctx.ellipse(-24, -10, 10, 8, -0.6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(24, -10, 10, 8, 0.6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // claw tips
    ctx.beginPath();
    ctx.arc(-28, -16, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(28, -16, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // googly eyes looking UP
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-7, -12, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(7, -12, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(-6, -15, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(9, -14, 3.2, 0, Math.PI * 2); ctx.fill();
    // smile
    ctx.beginPath();
    ctx.arc(0, 4, 6, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    // legs
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#C62828";
    for (let i = 0; i < 3; i++) {
      const ox = -12 + i * 4;
      ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(ox - 18, 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(-ox + 18, 22); ctx.stroke();
    }
    ctx.restore();
  }

  function drawClam(x, y, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.lineJoin = "round";
    // wavy shell body
    ctx.fillStyle = "#6B9AC4";
    ctx.beginPath();
    ctx.moveTo(-26, 6);
    ctx.quadraticCurveTo(-30, -8, -18, -16);
    ctx.quadraticCurveTo(-8, -22, 0, -14);
    ctx.quadraticCurveTo(8, -22, 18, -16);
    ctx.quadraticCurveTo(30, -8, 26, 6);
    ctx.quadraticCurveTo(0, 14, -26, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // dark opening
    ctx.fillStyle = "#0A0A18";
    ctx.beginPath();
    ctx.ellipse(0, -2, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes peering out
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-6, -4, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(6, -4, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(-5, -4, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -3, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawAnemone(x, y, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.lineJoin = "round";
    // bumpy round body
    ctx.fillStyle = "#FF8A1A";
    ctx.beginPath();
    ctx.ellipse(0, 2, 20, 22, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // lumps
    ctx.fillStyle = "#FF7020";
    for (const [ox, oy, r] of [[-10, 0, 6], [10, 4, 5], [0, 10, 5]]) {
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.fill();
    }
    // yellow tentacles on top
    ctx.fillStyle = "#FFD54F";
    for (const [ox, oy] of [[-10, -20], [-2, -26], [8, -22], [14, -16]]) {
      ctx.beginPath();
      ctx.ellipse(ox, oy, 5, 9, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSpottedShell(x, y, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#F8F8F8";
    ctx.beginPath();
    ctx.moveTo(-22, 8);
    ctx.quadraticCurveTo(-26, -10, -10, -20);
    ctx.quadraticCurveTo(0, -28, 12, -18);
    ctx.quadraticCurveTo(28, -10, 22, 8);
    ctx.quadraticCurveTo(0, 16, -22, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // large irregular black spots
    ctx.fillStyle = "#1A1A1A";
    for (const [sx, sy, sr] of [
      [-8, -6, 5], [6, -10, 4.5], [0, 4, 3.5], [12, 0, 4], [-14, 2, 3.5], [8, 6, 3],
    ]) {
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawSmileStar(x, y, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#FF9800";
    // puffy arms
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      ctx.save();
      ctx.translate(Math.cos(a) * 10, Math.sin(a) * 10);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,220,120,0.5)";
    ctx.beginPath();
    ctx.ellipse(-3, -3, 6, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // face — slit eyes + open smile
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-6, -3); ctx.lineTo(-2, -3);
    ctx.moveTo(2, -3); ctx.lineTo(6, -3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 3, 5, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function puffyStarPath(cx, cy, points, outer, inner) {
    ctx.beginPath();
    const step = Math.PI / points;
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + i * step;
      // soften tips with slight inset
      const soft = i % 2 === 0 ? r * 0.92 : r;
      const x = cx + Math.cos(a) * soft;
      const y = cy + Math.sin(a) * soft;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // Extra-puffy starfish: fat elliptical arms + round core
  function drawPuffyStarfish(cx, cy, color, R) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    function body(ox, oy, fillStyle, strokeStyle, lw) {
      ctx.fillStyle = fillStyle;
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lw;
      // 5 long bulbous arms sticking out clearly
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        ctx.save();
        ctx.translate(ox + Math.cos(a) * R * 0.52, oy + Math.sin(a) * R * 0.52);
        ctx.rotate(a);
        ctx.beginPath();
        // tip-rounded sausage
        ctx.moveTo(-R * 0.22, 0);
        ctx.quadraticCurveTo(-R * 0.2, -R * 0.55, 0, -R * 0.62);
        ctx.quadraticCurveTo(R * 0.2, -R * 0.55, R * 0.22, 0);
        ctx.quadraticCurveTo(0, R * 0.12, -R * 0.22, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // round core
      ctx.beginPath();
      ctx.arc(ox, oy, R * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Drop shadow
    body(5, 6, "rgba(0,0,0,0.3)", "rgba(0,0,0,0)", 0);

    // Main
    const g = ctx.createRadialGradient(-R * 0.2, -R * 0.25, R * 0.05, 0, 0, R);
    g.addColorStop(0, lighten(color, 55));
    g.addColorStop(0.45, lighten(color, 12));
    g.addColorStop(1, color);
    body(0, 0, g, "#000", 3.5);

    // Arm highlights (top-left of each arm)
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      const hx = Math.cos(a) * R * 0.62 - 2;
      const hy = Math.sin(a) * R * 0.62 - 3;
      ctx.beginPath();
      ctx.ellipse(hx, hy, R * 0.1, R * 0.18, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(-R * 0.1, -R * 0.12, R * 0.18, R * 0.14, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
    ctx.restore();
  }

  function drawStarButton(cx, cy, color, label, hover, which) {
    const isHelp = which === "help" || label === "说明" || label === "도움말";
    const img = hover
      ? (isHelp ? (ASSET.ui.btnHelpOver || ASSET.ui.btnHelp) : (ASSET.ui.btnStartOver || ASSET.ui.btnStart))
      : (isHelp ? ASSET.ui.btnHelp : ASSET.ui.btnStart);
    if (img) {
      const s = hover ? 1.06 : 1;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
      // HD @2x source (642×534) drawn near native → crisp on hi-DPI
      drawAssetSized(img, cx, cy, 124 * s, 103 * s);
      ctx.restore();
      return;
    }
    const s = hover ? 1.07 : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    drawPuffyStarfish(0, 0, color, 58);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.font = "bold 17px Microsoft YaHei, PingFang SC, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }

  // ─── Logo: heavy block slabs + thick black offset shadow ──
  const LOGO_FONT = '"NanumGothic ExtraBold", NanumGothic, "Noto Sans CJK KR", "Gothic A1", "Microsoft YaHei", sans-serif';

  function drawLogoBlock(text, x, y, size, align) {
    ctx.save();
    ctx.font = `900 ${size}px ${LOGO_FONT}`;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const ox = Math.max(7, Math.round(size * 0.16));
    const oy = Math.max(7, Math.round(size * 0.16));

    // Heavy solid black OFFSET SLAB
    ctx.fillStyle = "#000000";
    for (let dx = 0; dx <= 4; dx++) {
      for (let dy = 0; dy <= 4; dy++) {
        ctx.fillText(text, x + ox + dx, y + oy + dy);
      }
    }

    // White outline via stroke only (keep orange face clean)
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(7, size * 0.2);
    ctx.strokeText(text, x, y);

    // Red→orange fill
    const metrics = ctx.measureText(text);
    const tw = metrics.width;
    let gx0 = x;
    if (align === "center") gx0 = x - tw / 2;
    else if (align === "right") gx0 = x - tw;
    const lg = ctx.createLinearGradient(0, y - size * 0.4, 0, y + size * 0.4);
    lg.addColorStop(0, "#FF1A00");
    lg.addColorStop(0.35, "#FF5200");
    lg.addColorStop(0.7, "#FF8A00");
    lg.addColorStop(1, "#FFB84A");
    ctx.fillStyle = lg;
    ctx.fillText(text, x, y);

    // White glint pills
    ctx.fillStyle = "#FFFFFF";
    const glints = Math.min(7, Math.max(3, Math.floor(tw / (size * 0.55))));
    for (let i = 0; i < glints; i++) {
      const gx = gx0 + tw * (0.1 + i * 0.14);
      const gy = y - size * 0.26;
      roundRect(gx, gy, Math.max(4, size * 0.09), Math.max(5, size * 0.15), 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLogo(x, y, scale) {
    drawLogoBlock("꼬기꼬기", x, y, Math.round(32 * (scale || 1)), "left");
  }

  function drawTitleLogo(cx, cy) {
    if (ASSET.ui.logo) {
      // Full title logo ~430×150 logical (asset is HD raster)
      drawAssetSized(ASSET.ui.logo, cx, cy - 4, 460, 170);
      ctx.save();
      ctx.font = "bold 18px Microsoft YaHei, PingFang SC, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0A2A5A";
      ctx.strokeText("大鱼吃小鱼", cx, cy + 100);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("大鱼吃小鱼", cx, cy + 100);
      ctx.restore();
      return;
    }
    drawLogoBlock("꼬기꼬기", cx, cy, 62, "center");
    ctx.save();
    ctx.font = "bold 18px Microsoft YaHei, PingFang SC, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0A2A5A";
    ctx.strokeText("大鱼吃小鱼", cx, cy + 50);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("大鱼吃小鱼", cx, cy + 50);
    ctx.restore();
  }

  // ─── SCORE plaque (bitmap digits from SWF score_mc) ──────
  function drawScorePlaque() {
    const pw = 178;
    const ph = 58;
    const px = FX + FW / 2 - pw / 2;
    const py = FY - ph * 0.58;
    const text = String(Math.min(score, 999999)).padStart(6, "0");

    // Crisp vector plaque (no baked black digit slab)
    ctx.save();
    roundRect(px - 1.5, py - 1.5, pw + 3, ph + 3, 9);
    ctx.fillStyle = "#3D2200";
    ctx.fill();
    roundRect(px, py, pw, ph, 8);
    const body = ctx.createLinearGradient(px, py, px, py + ph);
    body.addColorStop(0, "#FFE456");
    body.addColorStop(0.45, "#FFD01F");
    body.addColorStop(1, "#E8A800");
    ctx.fillStyle = body;
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 12px Arial Black, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "1px";
    ctx.fillText("SCORE", px + pw / 2, py + 13);

    const lcdX = px + 12, lcdY = py + 22, lcdW = pw - 24, lcdH = 28;
    drawLcdWell(lcdX, lcdY, lcdW, lcdH, 4);
    const digW = 18, digH = 22, gap = 3;
    const totalW = measureSevenSeg(text, digW, gap);
    const startX = lcdX + (lcdW - totalW) / 2;
    drawSevenSegString(text, startX, lcdY + (lcdH - digH) / 2, digW, digH, gap, "#FFF8E7", "rgba(255,248,231,0.0)");
    ctx.restore();
  }


  // ─── TIME alarm clock (vector chrome — sharp on hi-DPI) ─────
  function drawTimeClock() {
    const cx = FX + FW - 4;
    const cy = FY + 8;
    const total = Math.max(0, timeSec);
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = Math.floor(total % 60);
    // Fit LCD: omit hours until >= 1h (original plaque is tiny)
    const tstr = hh > 0
      ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
      : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

    const r = 38;
    const ox = cx - 8, oy = cy + 10;
    ctx.save();
    // feet
    ctx.fillStyle = "#C0C4CC";
    ctx.strokeStyle = "#3D2200";
    ctx.lineWidth = 2;
    for (const dx of [-14, 14]) {
      ctx.beginPath();
      ctx.moveTo(ox + dx - 5, oy + r - 2);
      ctx.lineTo(ox + dx - 2, oy + r + 10);
      ctx.lineTo(ox + dx + 2, oy + r + 10);
      ctx.lineTo(ox + dx + 5, oy + r - 2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    // bell
    ctx.beginPath();
    ctx.arc(ox + 10, oy - r + 4, 9, 0, Math.PI * 2);
    const bell = ctx.createLinearGradient(ox, oy - r - 6, ox, oy - r + 12);
    bell.addColorStop(0, "#FFE456");
    bell.addColorStop(1, "#E0A000");
    ctx.fillStyle = bell;
    ctx.fill();
    ctx.strokeStyle = "#3D2200";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // hammer
    ctx.strokeStyle = "#8A9098";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ox + 16, oy - r + 2);
    ctx.quadraticCurveTo(ox + 34, oy - r - 10, ox + 30, oy - r + 8);
    ctx.stroke();
    ctx.fillStyle = "#A0A6AE";
    ctx.beginPath();
    ctx.arc(ox + 30, oy - r + 8, 4, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    const body = ctx.createLinearGradient(ox - r, oy - r, ox + r, oy + r);
    body.addColorStop(0, "#FFE456");
    body.addColorStop(0.45, "#FFD01F");
    body.addColorStop(1, "#E8A800");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#3D2200";
    ctx.stroke();
    // face disk
    ctx.beginPath();
    ctx.arc(ox, oy, r * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = "#F3CA2A";
    ctx.fill();
    // TIME label
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 11px Arial Black, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TIME", ox, oy - r * 0.38);
    // LCD well spans most of the yellow face; digits auto-fit with padding
    const lcdW = r * 1.55, lcdH = r * 0.40;
    const lcdX = ox - lcdW / 2, lcdY = oy + 1;
    drawLcdWell(lcdX, lcdY, lcdW, lcdH, 3.5);
    let digW = 8.2, digH = 13.5, gap = 1.0;
    let tw = measureSevenSeg(tstr, digW, gap);
    const maxTw = lcdW - 8;
    if (tw > maxTw) {
      const s = maxTw / tw;
      digW *= s; digH *= s; gap *= s;
      tw = measureSevenSeg(tstr, digW, gap);
    }
    drawSevenSegString(tstr, lcdX + (lcdW - tw) / 2, lcdY + (lcdH - digH) / 2, digW, digH, gap, "#F5E84A", "rgba(245,232,74,0.0)");
    ctx.restore();
    drawPauseBtn();
  }

  function drawLives() {
    for (let i = 0; i < lives; i++) {
      const lx = 28, ly = 100 + i * 50;
      // Must match player fish art (not a different life icon style)
      const img = ASSET.player.svg || ASSET.player.idle || ASSET.ui.lifeFish;
      if (img) {
        drawFishImage(img, lx, ly, 15, 1, false, i * 0.7, 1);
      } else {
        drawVectorFish(lx, ly, 15, 1, "player", false, i * 0.7, 1);
      }
    }
  }



  // ─── Fish art (original SWF sprites via FFDec PNG) ────
  // Frame 1..8 → art types; SWF can request 9..10 → clamp to 8
  function artTypeForFrame(frame) {
    return clamp(frame | 0, 1, 8);
  }

  function drawFishImage(img, x, y, size, facing, dead, wobble, alpha) {
    if (!img) return false;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing < 0 ? -1 : 1, 1);
    if (dead) ctx.rotate(Math.PI / 2);
    if (wobble) ctx.rotate(Math.sin(wobble) * 0.06);
    if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
    // size ≈ Flash radius-ish; full sprite width ~2.2× that (body+tail)
    const dw = Math.max(8, size * 2.2);
    const dh = dw * (img.height / img.width);
    ctx.drawImage(img, -dw * 0.55, -dh * 0.5, dw, dh);
    ctx.restore();
    return true;
  }

  function pickNpcFrame(artType, wobble) {
    const frames = ASSET.npc[artType - 1];
    if (frames && frames.length) {
      const i = Math.floor(Math.abs(wobble) * 2.2) % frames.length;
      return frames[i];
    }
    return ASSET.npcStill[artType - 1] || null;
  }

  function pickPlayerFrame(dead, chompT, hurtT, wobble) {
    if (dead) return ASSET.player.hurt || ASSET.player.idle;
    if (hurtT > 0 && ASSET.player.hit.length) {
      const i = Math.min(ASSET.player.hit.length - 1, Math.floor((1.2 - Math.min(1.2, hurtT)) / 1.2 * ASSET.player.hit.length));
      return ASSET.player.hit[Math.max(0, i)];
    }
    if (chompT > 0 && ASSET.player.chomp.length) {
      const i = Math.min(ASSET.player.chomp.length - 1, Math.floor((0.35 - Math.min(0.35, chompT)) / 0.35 * ASSET.player.chomp.length));
      return ASSET.player.chomp[Math.max(0, i)];
    }
    if (ASSET.player.swim.length) {
      const i = Math.floor(Math.abs(wobble) * 3) % ASSET.player.swim.length;
      return ASSET.player.swim[i];
    }
    return ASSET.player.idle;
  }

  // Fallback vector art if PNGs not ready
  function fishPalette(kind) {
    switch (kind) {
      case "player": return { body: "#FF8A00", belly: "#FFE8C8", fin: "#E65100", eye: "big", face: "happy" };
      case "pink":
      case "red":    return { body: "#FF80AB", belly: "#FCE4EC", fin: "#EC407A", eye: "small", face: "sleepy" };
      case "yellow": return { body: "#FFD54F", belly: "#FFF3E0", fin: "#FFB300", eye: "half", face: "smug" };
      case "blue":
      case "navy":   return { body: "#42A5F5", belly: "#BBDEFB", fin: "#1565C0", eye: "angry", face: "grumpy" };
      case "green":  return { body: "#66BB6A", belly: "#C8E6C9", fin: "#2E7D32", eye: "angry", face: "teeth" };
      case "purple": return { body: "#AB47BC", belly: "#E1BEE7", fin: "#6A1B9A", eye: "angry", face: "teeth" };
      case "tiny":   return { body: "#AED581", belly: "#F1F8E9", fin: "#7CB342", eye: "dot", face: "simple" };
      default:       return { body: "#90CAF9", belly: "#E3F2FD", fin: "#1976D2", eye: "small", face: "simple" };
    }
  }

  const KIND_TO_ART = { tiny: 1, pink: 2, yellow: 6, blue: 4, green: 5, purple: 8, player: 0 };

  function drawVectorFish(x, y, size, facing, kind, dead, wobble, alpha) {
    const p = fishPalette(kind === "player" ? "player" : (kind || "tiny"));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing < 0 ? -1 : 1, 1);
    if (dead) ctx.rotate(Math.PI / 2);
    if (wobble) ctx.rotate(Math.sin(wobble) * 0.07);
    if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
    const s = Math.max(4, size);
    const lw = Math.max(1.6, s * 0.1);
    ctx.lineWidth = lw;
    ctx.strokeStyle = "#1A1208";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Tail
    ctx.fillStyle = p.fin;
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, 0);
    ctx.lineTo(-s * 1.25, -s * 0.55);
    ctx.quadraticCurveTo(-s * 0.95, 0, -s * 1.25, s * 0.55);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Dorsal
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.55);
    ctx.quadraticCurveTo(s * 0.15, -s * 1.05, s * 0.45, -s * 0.5);
    ctx.quadraticCurveTo(s * 0.1, -s * 0.7, -s * 0.1, -s * 0.55);
    ctx.closePath();
    ctx.fillStyle = p.fin;
    ctx.fill(); ctx.stroke();

    // Body
    const bw = kind === "player" ? s * 1.05 : s * 0.98;
    const bh = kind === "player" ? s * 0.68 : s * 0.58;
    const grad = ctx.createLinearGradient(0, -bh, 0, bh);
    grad.addColorStop(0, p.body);
    grad.addColorStop(0.55, p.body);
    grad.addColorStop(1, p.belly);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Belly highlight
    ctx.fillStyle = p.belly;
    ctx.globalAlpha = (alpha != null ? alpha : 1) * 0.9;
    ctx.beginPath();
    ctx.ellipse(s * 0.08, s * 0.18, s * 0.55, s * 0.28, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha != null ? alpha : 1;

    // Side fin
    ctx.fillStyle = p.fin;
    ctx.beginPath();
    ctx.moveTo(s * 0.05, s * 0.05);
    ctx.quadraticCurveTo(-s * 0.15, s * 0.45, s * 0.25, s * 0.55);
    ctx.quadraticCurveTo(s * 0.2, s * 0.25, s * 0.05, s * 0.05);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Eye
    const ex = s * 0.48, ey = -s * 0.12;
    if (dead) {
      ctx.strokeStyle = "#1A1208";
      ctx.lineWidth = Math.max(1.4, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(ex - s * 0.16, ey - s * 0.16);
      ctx.lineTo(ex + s * 0.16, ey + s * 0.16);
      ctx.moveTo(ex + s * 0.16, ey - s * 0.16);
      ctx.lineTo(ex - s * 0.16, ey + s * 0.16);
      ctx.stroke();
    } else {
      const er = Math.max(2.2, s * 0.22);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#1A1208";
      ctx.lineWidth = Math.max(1.2, lw * 0.7);
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#1A1208";
      ctx.beginPath();
      ctx.arc(ex + er * 0.22, ey, er * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex + er * 0.4, ey - er * 0.28, er * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    // Smile / mouth for player
    if (kind === "player" && !dead) {
      ctx.strokeStyle = "#1A1208";
      ctx.lineWidth = Math.max(1.3, s * 0.08);
      ctx.beginPath();
      ctx.arc(s * 0.72, s * 0.08, s * 0.18, 0.15, Math.PI - 0.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFishSprite(x, y, size, facing, kind, dead, wobble, opts) {
    opts = opts || {};
    const alpha = opts.alpha;
    // Faithful art: SVG-raster traces of original sprites (identical look, sharp when huge).
    // Generic cartoon vector is fallback only.
    let img = null;
    if (kind === "player" || opts.player) {
      // HD @3x original frames (pixel-faithful). Anim when available.
      img = pickPlayerFrame(!!dead, opts.chompT || 0, opts.hurtT || 0, wobble || 0)
        || ASSET.player.svg || ASSET.player.idle;
    } else {
      let art = opts.artType || KIND_TO_ART[kind] || 1;
      art = clamp(art, 1, 8);
      // Prefer swim-cycle HD frames (same art as original bitmaps, sharp when huge)
      img = pickNpcFrame(art, wobble || 0)
        || (ASSET.npcSvg && ASSET.npcSvg[art - 1])
        || (ASSET.npcStill && ASSET.npcStill[art - 1]);
    }
    if (drawFishImage(img, x, y, size, facing, dead, wobble, alpha)) return;
    const k = (kind === "player" || opts.player) ? "player" : (kind || "tiny");
    let kk = k;
    if (!opts.player && opts.artType) {
      const map = ["tiny","pink","red","blue","green","yellow","navy","purple"];
      kk = map[(opts.artType - 1) | 0] || k;
      if (kk === "red") kk = "pink";
      if (kk === "navy") kk = "blue";
    }
    drawVectorFish(x, y, size, facing, kk, !!dead, wobble || 0, alpha);
  }


  // ─── Entities (SWF-faithful logic; see SWF_LOGIC.md) ──
  // Original stage 550×400 @ 30fps. Positions live in SWF space; drawn into PLAY.
  const SWF = {
    W: 550,
    H: 400,
    FPS: 30,
    DRAG: 0.93,
    SWIM: 0.25,
    SWIM_TURBO: 0.5,
    F_SIZE0: 15,
    F_WIN: 250,
    NPC: 10,
    WRAP_L: 0,
    WRAP_R: 550,
    Y_MIN: 70,
    Y_MAX: 360,
    SPAWN_Y0: 95,
    SPAWN_YH: 240,
  };

  // Flash fish frame (1..10) → art type (8 SWF looks; 9–10 clamp)
  const FRAME_KIND = [
    "tiny", "pink", "red", "blue", "green",
    "yellow", "navy", "purple", "purple", "purple",
  ];

  function toScreenX(x) { return PLAY.x + (x / SWF.W) * PLAY.w; }
  function toScreenY(y) { return PLAY.y + (y / SWF.H) * PLAY.h; }
  function toSwfX(px) { return ((px - PLAY.x) / PLAY.w) * SWF.W; }
  function toSwfY(py) { return ((py - PLAY.y) / PLAY.h) * SWF.H; }
  /** Map Flash _xscale units to on-screen radius-ish size */
  function scaleToPx(fSize) {
    return Math.max(4, (fSize / SWF.W) * PLAY.w);
  }

  function rollFishSize(fSize) {
    const rSize = Math.min(fSize, 100);
    // Flash random(n) → [0, n); fishsize = random(39+int(rSize/3)) + 5
    const span = 39 + ((rSize / 3) | 0);
    return ((Math.random() * span) | 0) + 5;
  }

  function rollFishSpeed(fSize) {
    const rSpd = Math.min(fSize, 150);
    let spd = (((Math.random() * 6) | 0) - 3) * (1.1 + rSpd / 300);
    if (spd === 0) spd = 2;
    return spd;
  }

  function frameForSize(fishsize) {
    return ((fishsize / 8) | 0) + 1; // 1..10
  }

  function kindForFrame(frame) {
    return FRAME_KIND[clamp(frame, 1, 10) - 1];
  }

  function placeFishSlot(slot, fSize) {
    const fishsize = rollFishSize(fSize);
    let fishspeed = rollFishSpeed(fSize);
    const frame = frameForSize(fishsize);
    const fromLeft = fishspeed > 0;
    if (!fromLeft && fishspeed === 0) fishspeed = 2;
    slot.fishsize = fishsize;
    slot.fishspeed = fishspeed;
    slot.frame = frame;
    slot.artType = artTypeForFrame(frame);
    slot.kind = kindForFrame(frame);
    slot.x = fromLeft ? -90 : 640;
    slot.y = SWF.SPAWN_Y0 + ((Math.random() * SWF.SPAWN_YH) | 0);
    slot.facing = fromLeft ? 1 : -1;
    slot.size = scaleToPx(fishsize);
    slot.wobble = rand(0, Math.PI * 2);
    slot.alive = true;
  }

  function makeNpcSlots(fSize) {
    const slots = [];
    for (let i = 1; i <= SWF.NPC; i++) {
      const slot = { id: i };
      placeFishSlot(slot, fSize);
      slots.push(slot);
    }
    return slots;
  }

  function makePlayer() {
    return {
      x: 200,
      y: 180,
      xmove: 0,
      ymove: 7, // SWF init downward drift
      f_size: SWF.F_SIZE0,
      size: scaleToPx(SWF.F_SIZE0),
      facing: 1,
      kind: "player",
      wobble: 0,
    };
  }

  let won = false;

  function startGame() {
    unlockAudio();
    bootCommitted = true;
    if (!ASSET.playReady) {
      mode = "loading";
      ASSET.loadLabel = "准备游戏…";
      ensurePlayAssets().then(() => {
        if (mode === "loading" || mode === "title" || mode === "help" || mode === "over" || mode === "win") beginRound();
      });
      return;
    }
    beginRound();
  }

  function beginRound() {
    mode = "play";
    syncJoypadVisibility();
    drawJoystick();
    score = 0;
    lives = 3;
    level = 1;
    timeSec = 0;
    playTime = 0;
    invuln = 0;
    growFlash = 0;
    popups = [];
    player = makePlayer();
    player.chompT = 0;
    player.hurtT = 0;
    fish = makeNpcSlots(player.f_size);
    deathFish = null;
    paused = false;
    shake = 0;
    won = false;
    playSfx("splash", { volume: 0.8 });
    ensureBgm(true);
  }

  // ─── Input ───────────────────────────────────────────────
  window.addEventListener("keydown", (e) => {
    unlockAudio();
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
      kbdActive = true;
    }
    if (mode === "title" && (e.code === "Enter" || e.code === "Space")) { unlockAudio(); startGame(); }
    if (mode === "help" && (e.code === "Enter" || e.code === "Space" || e.code === "Escape")) startGame();
    if ((mode === "over" || mode === "win") && (e.code === "Enter" || e.code === "Space")) startGame();
    if (mode === "play" && (e.code === "KeyP" || e.code === "Escape")) { e.preventDefault(); togglePause(); }
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
    const any =
      keys.ArrowLeft || keys.ArrowRight || keys.ArrowUp || keys.ArrowDown ||
      keys.KeyA || keys.KeyD || keys.KeyW || keys.KeyS;
    if (!any) kbdActive = false;
  });

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    const sx = W / r.width, sy = H / r.height;
    const cx = (e.clientX !== undefined ? e.clientX : e.touches[0].clientX);
    const cy = (e.clientY !== undefined ? e.clientY : e.touches[0].clientY);
    return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
  }

  function canvasPosFromTouch(t) {
    const r = canvas.getBoundingClientRect();
    const sx = W / r.width, sy = H / r.height;
    return { x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy };
  }

  function joyPadPosFromTouch(t) {
    const r = joypad.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  function joySetFromPoint(p) {
    const ox = joy.ox, oy = joy.oy;
    let dx = p.x - ox, dy = p.y - oy;
    const len = Math.hypot(dx, dy);
    if (len > joy.maxD) {
      dx = (dx / len) * joy.maxD;
      dy = (dy / len) * joy.maxD;
    }
    joy.dx = dx;
    joy.dy = dy;
  }

  function joyAxes() {
    if (!joy.enabled || !joy.active) return { l: false, r: false, u: false, d: false };
    const dead = joy.maxD * 0.2;
    return {
      l: joy.dx < -dead,
      r: joy.dx > dead,
      u: joy.dy < -dead,
      d: joy.dy > dead,
    };
  }

  function drawJoystick() {
    if (!joyctx || !joypad) return;
    syncJoypadVisibility();
    if (!joy.enabled || mode !== "play") return;
    const size = joy.cssSize;
    const cx = joy.ox, cy = joy.oy;
    const sx = cx + (joy.active ? joy.dx : 0);
    const sy = cy + (joy.active ? joy.dy : 0);
    joyctx.clearRect(0, 0, size, size);
    // Base nest
    joyctx.beginPath();
    joyctx.arc(cx, cy, joy.baseR, 0, Math.PI * 2);
    joyctx.fillStyle = "rgba(0,0,0,0.22)";
    joyctx.fill();
    joyctx.lineWidth = 3;
    joyctx.strokeStyle = "rgba(255,255,255,0.32)";
    joyctx.stroke();
    joyctx.beginPath();
    joyctx.arc(cx, cy, joy.maxD, 0, Math.PI * 2);
    joyctx.strokeStyle = "rgba(255,255,255,0.14)";
    joyctx.lineWidth = 2;
    joyctx.stroke();
    joyctx.beginPath();
    joyctx.arc(sx, sy, joy.stickR, 0, Math.PI * 2);
    joyctx.fillStyle = joy.active ? "rgba(255,220,80,0.5)" : "rgba(255,255,255,0.32)";
    joyctx.fill();
    joyctx.strokeStyle = "rgba(255,255,255,0.45)";
    joyctx.lineWidth = 2;
    joyctx.stroke();
  }

  function hitStarBtn(p, cx, cy) {
    return Math.hypot(p.x - cx, p.y - cy) < 60;
  }

  canvas.addEventListener("mousemove", (e) => {
    const p = canvasPos(e);
    pointer = p;
    if (mode === "title") {
      if (hitStarBtn(p, W * 0.35, H * 0.52)) btnHover = "start";
      else if (hitStarBtn(p, W * 0.65, H * 0.52)) btnHover = "help";
      else btnHover = null;
      canvas.style.cursor = btnHover ? "pointer" : "default";
    } else if (mode === "help") {
      btnHover = (p.x > W - 90 && p.y > H - 90) ? "next" : null;
      canvas.style.cursor = btnHover ? "pointer" : "default";
    } else if (mode === "over" || mode === "win") {
      const r = overPanelMetrics().retry;
      btnHover = (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) ? "retry" : null;
      canvas.style.cursor = btnHover ? "pointer" : "default";
    } else if (mode === "play") {
      canvas.style.cursor = hitPauseBtn(p) ? "pointer" : "default";
    } else {
      canvas.style.cursor = "default";
    }
  });

  canvas.addEventListener("mousedown", (e) => {
    pointerDown = true;
    pointer = canvasPos(e);
    handleClick(pointer);
  });
  canvas.addEventListener("mouseup", () => { pointerDown = false; });
  canvas.addEventListener("mouseleave", () => { pointer = null; pointerDown = false; });

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    unlockAudio();
    for (const t of e.changedTouches) {
      const p = canvasPosFromTouch(t);
      pointerDown = true;
      pointer = p;
      handleClick(p);
    }
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      pointer = canvasPosFromTouch(t);
    }
  }, { passive: false });
  canvas.addEventListener("touchend", (e) => {
    if (!e.touches || e.touches.length === 0) {
      pointerDown = false;
      pointer = null;
    }
  });
  canvas.addEventListener("touchcancel", () => { pointerDown = false; pointer = null; });

  // Stick input only on the letterbox overlay (never steals canvas touches)
  if (joypad) {
    joypad.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      unlockAudio();
      if (mode !== "play" || !joy.enabled) return;
      for (const t of e.changedTouches) {
        if (joy.active) break;
        joy.active = true;
        joy.touchId = t.identifier;
        joy.ox = joy.cssSize / 2;
        joy.oy = joy.cssSize / 2;
        joySetFromPoint(joyPadPosFromTouch(t));
        drawJoystick();
      }
    }, { passive: false });
    joypad.addEventListener("touchmove", (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches) {
        if (joy.active && t.identifier === joy.touchId) {
          joySetFromPoint(joyPadPosFromTouch(t));
          drawJoystick();
        }
      }
    }, { passive: false });
    function endPadTouch(e) {
      for (const t of e.changedTouches) {
        if (joy.active && t.identifier === joy.touchId) {
          joy.active = false;
          joy.touchId = null;
          joy.dx = 0;
          joy.dy = 0;
          drawJoystick();
        }
      }
    }
    joypad.addEventListener("touchend", endPadTouch);
    joypad.addEventListener("touchcancel", endPadTouch);
  }

  let audioUnlocked = false;
  function unlockAudio() {
    const ctx = ensureAudioCtx();
    if (ctx && ctx.state === "suspended") {
      const resumed = ctx.resume();
      if (resumed && resumed.catch) resumed.catch(() => {});
    }
    // A load-time call leaves the context suspended. Do not latch until output
    // is actually allowed, so the first real gesture can still unlock sound.
    const canOutput = !ctx || ctx.state === "running";
    if (canOutput && !audioUnlocked) {
      audioUnlocked = true;
      for (const [k, url] of Object.entries(SFX_URLS)) {
        if (k === "bgm") continue;
        if (!ASSET.sfxBuf[k]) decodeSfxBuffer(k, url);
      }
      for (const a of Object.values(ASSET.sfx)) {
        if (!a || a === ASSET.sfx.bgm) continue;
        try {
          const wasVol = a.volume;
          a.muted = true;
          const p = a.play();
          const done = () => {
            try { a.pause(); a.currentTime = 0; a.muted = false; a.volume = wasVol; } catch (_) {}
          };
          if (p && p.then) p.then(done).catch(() => { try { a.muted = false; } catch (_) {} });
          else done();
        } catch (_) {}
      }
    }
    // play() must run in this gesture, not after resume() resolves.
    if (bgmWanted && mode === "play" && !paused) ensureBgm(true);
  }

  function handleClick(p) {
    unlockAudio();
    if (mode === "play" && hitPauseBtn(p)) { togglePause(); return; }
    if (mode === "title") {
      if (hitStarBtn(p, W * 0.35, H * 0.52)) startGame();
      else if (hitStarBtn(p, W * 0.65, H * 0.52)) {
        if (ASSET.ui.helpPanel) mode = "help";
        else {
          mode = "loading";
          ASSET.loadLabel = "加载说明…";
          (_deferPromise || loadDeferred()).then(() => { mode = "help"; });
        }
      }
    } else if (mode === "help") {
      startGame();
    } else if (mode === "over" || mode === "win") {
      const r = overPanelMetrics().retry;
      if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) startGame();
    }
  }

  // ─── Update (SWF enterFrame model @ 30fps, integrated with dt) ──
  function update(dt) {
    for (const b of bubbles) {
      b.y += b.vy * dt;
      if (b.y < -b.r) { b.y = H + b.r; b.x = rand(0, W); }
    }

    if (mode !== "play" || !player) {
      if ((mode === "over" || mode === "win") && deathFish) {
        deathFish.y += Math.sin(performance.now() / 400) * 0.15;
      }
      return;
    }

    if (paused) return;

    playTime += dt;
    timeSec = playTime;
    invuln = Math.max(0, invuln - dt);
    growFlash = Math.max(0, growFlash - dt);
    shake = Math.max(0, shake - dt);
    if (player) {
      player.chompT = Math.max(0, (player.chompT || 0) - dt);
      player.hurtT = Math.max(0, (player.hurtT || 0) - dt);
    }

    // How many Flash frames elapsed this tick
    let frames = dt * SWF.FPS;
    if (frames > 3) frames = 3; // avoid spiral on tab-switch

    const left = keys.ArrowLeft || keys.KeyA;
    const right = keys.ArrowRight || keys.KeyD;
    const up = keys.ArrowUp || keys.KeyW;
    const down = keys.ArrowDown || keys.KeyS;
    const turbo = keys.ShiftLeft || keys.ShiftRight;
    const usingKbd = left || right || up || down || kbdActive;
    const jx = joyAxes();

    // Touch: virtual joystick is primary; pointer-follow only if joy idle
    let pLeft = false, pRight = false, pUp = false, pDown = false;
    if (!usingKbd) {
      if (joy.enabled && joy.active) {
        pLeft = jx.l; pRight = jx.r; pUp = jx.u; pDown = jx.d;
      } else if (pointer && !joy.enabled) {
        // Desktop mouse follow only (phones use joystick)
        const want = (pointerDown) || (
          pointer.x > PLAY.x && pointer.x < PLAY.x + PLAY.w &&
          pointer.y > PLAY.y && pointer.y < PLAY.y + PLAY.h
        );
        if (want) {
          const tx = toSwfX(pointer.x), ty = toSwfY(pointer.y);
          const dx = tx - player.x, dy = ty - player.y;
          const dead = pointerDown ? 6 : 14;
          if (Math.hypot(dx, dy) > dead) {
            if (Math.abs(dx) >= Math.abs(dy) * 0.35) {
              if (dx < 0) pLeft = true; else pRight = true;
            }
            if (Math.abs(dy) >= Math.abs(dx) * 0.35) {
              if (dy < 0) pUp = true; else pDown = true;
            }
          }
        }
      }
    }

    const goL = left || pLeft;
    const goR = right || pRight;
    const goU = up || pUp;
    const goD = down || pDown;

    // Step in Flash-frame units (fractional OK)
    const swim = turbo ? SWF.SWIM_TURBO : SWF.SWIM;
    const dragPow = Math.pow(SWF.DRAG, frames);

    player.xmove *= dragPow;
    player.ymove *= dragPow;

    if (goL) {
      player.facing = -1;
      player.xmove -= swim * frames;
    }
    if (goR) {
      player.facing = 1;
      player.xmove += swim * frames;
    }
    if (goU) player.ymove -= swim * frames;
    if (goD) player.ymove += swim * frames;

    player.x += player.xmove * frames;
    // Horizontal wrap at visible gold-frame inner edges (PLAY maps 0..SWF.W)
    if (player.x > SWF.WRAP_R) player.x = SWF.WRAP_L;
    if (player.x < SWF.WRAP_L) player.x = SWF.WRAP_R;

    const nextY = player.y + player.ymove * frames;
    if (nextY < SWF.Y_MAX && nextY > SWF.Y_MIN) {
      player.y = nextY;
    } else if (player.ymove !== 0) {
      // SWF clamps Y and trail-bubble reset plays bonk; remake: bonk on bound hit
      player.ymove = 0;
      playSfx("bonk", { volume: 0.55 });
    }

    player.size = scaleToPx(player.f_size) + (growFlash > 0 ? 2 : 0);
    player.wobble += dt * 8;

    // NPC move + respawn (10 fixed slots)
    for (const f of fish) {
      f.x += f.fishspeed * frames;
      f.wobble += dt * 5;
      f.facing = f.fishspeed >= 0 ? 1 : -1;
      f.size = scaleToPx(f.fishsize);
      if (f.x > 650 || f.x < -100) {
        placeFishSlot(f, player.f_size);
      }
    }

    // Collisions — SWF: eat iff f_size > fishsize; else life.reduce
    const pSx = toScreenX(player.x);
    const pSy = toScreenY(player.y);
    // Body ellipses (exclude fins/tail padding). Sprite width ≈ 2.2×size,
    // body ≈ 1.25×size half-width horizontally, 0.8×size vertically; body
    // centre shifted toward the head (facing direction).
    const pFace = player.facing || 1;
    const pBx = pSx + pFace * player.size * 0.1;
    const pA = player.size * 0.8, pB = player.size * 0.62;
    const pts = [];
    // SWF-style sample points on player outline (6 pts + centre)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push([pBx + Math.cos(a) * pA, pSy + Math.sin(a) * pB]);
    }
    pts.push([pBx, pSy]);

    for (const f of fish) {
      const fSx = toScreenX(f.x);
      const fSy = toScreenY(f.y);
      const fFace = f.facing || 1;
      const fBx = fSx + fFace * f.size * 0.1;
      const fA = f.size * 0.8, fB = f.size * 0.62;
      if (Math.abs(pBx - fBx) > pA + fA || Math.abs(pSy - fSy) > pB + fB) continue;
      // hitTest(x,y,true)-like: any player sample point inside the fish body,
      // or the fish's centre inside player's body (small fish case)
      let hit = false;
      for (const [qx, qy] of pts) {
        const ex = (qx - fBx) / fA, ey = (qy - fSy) / fB;
        if (ex * ex + ey * ey < 1) { hit = true; break; }
      }
      if (!hit) {
        const ex = (fBx - pBx) / pA, ey = (fSy - pSy) / pB;
        hit = ex * ex + ey * ey < 1;
      }
      if (!hit) continue;

      if (player.f_size > f.fishsize) {
        const bonus = (f.fishsize * 6) | 0;
        score += bonus;
        // SWF eat_mc: 15 frames @30fps ≈ 0.5s, fade-in while rising
        popups.push({
          x: toScreenX(player.x),
          y: toScreenY(player.y),
          bonus,
          artType: f.artType,
          age: 0,
          life: 15 / SWF.FPS,
        });
        player.f_size += f.fishsize / 75;
        player.size = scaleToPx(player.f_size);
        growFlash = 0.35;
        player.chompT = 0.35;
        playEatSfx(f.fishsize);
        // Park offscreen like mc._x = 700; next loop respawns
        f.x = 700;
        f.fishspeed = 2;

        if (player.f_size > SWF.F_WIN) {
          won = true;
          deathFish = {
            x: toScreenX(player.x),
            y: toScreenY(player.y),
            size: player.size,
          };
          mode = "win";
          ensureBgm(false);
          playSfx("win", { volume: 0.85 });
          break;
        }
      } else if (invuln <= 0) {
        // Hurt (SWF has no invuln; brief remake grace so one overlap ≠ multi-hit)
        lives -= 1;
        invuln = 1.2;
        player.hurtT = 1.2;
        shake = 0.4;
        playSfx("flash", { volume: 0.75 });
        f.x = 700;
        if (lives <= 0) {
          deathFish = {
            x: toScreenX(player.x),
            y: toScreenY(player.y),
            size: player.size,
          };
          mode = "over";
          ensureBgm(false);
          playSfx("sploosh", { volume: 0.9 });
          setTimeout(() => playSfx("lose", { volume: 0.85 }), 180);
          break;
        }
        // Soft reset position (SWF only plays hit anim / life icon)
        player.x = 200;
        player.y = 180;
        player.xmove = 0;
        player.ymove = 0;
      }
    }

    // Rough level label from size (HUD only; SWF has no level var)
    level = 1 + Math.min(9, ((player.f_size - SWF.F_SIZE0) / 25) | 0);

    for (const p of popups) {
      p.age = (p.age || 0) + dt;
      p.life -= dt;
    }
    popups = popups.filter((p) => p.life > 0);
  }

  // ─── Screens ─────────────────────────────────────────────
  function drawTitleSeabed() {
    // Vector seabed only — strip assets bake a nested black/gold mini-frame
    const baseY = H - 4;
    ctx.beginPath();
    ctx.moveTo(0, baseY + 4);
    ctx.lineTo(0, baseY - 40);
    const pts = [
      [40, -30], [90, -48], [150, -28], [220, -52], [300, -26],
      [380, -46], [460, -28], [540, -42], [620, -30], [W, -36],
    ];
    for (const [x, dy] of pts) ctx.lineTo(x, baseY + dy);
    ctx.lineTo(W, baseY + 4);
    ctx.closePath();
    ctx.fillStyle = "#6B7388";
    ctx.fill();
    drawKelp(32, baseY - 30, 2.0);
    drawCrab(155, baseY - 20, 1.75);
    drawClam(245, baseY - 16, 1.65);
    drawAnemone(330, baseY - 18, 1.7);
    drawSpottedShell(415, baseY - 14, 1.65);
    drawSmileStar(495, baseY - 16, 1.55);
    drawKelp(565, baseY - 28, 1.85);
  }

  function drawLoading() {
    drawOuterBg();
    // Soft underwater wash while assets stream in
    if (ASSET.ui.bgBubbles) {
      try { drawAsset(ASSET.ui.bgBubbles, 0, 0, W, H); } catch (_) {}
    }
    if (ASSET.ui.logo) {
      drawAssetSized(ASSET.ui.logo, W / 2, H * 0.38, 420, 150);
    } else {
      ctx.fillStyle = "#FFE082";
      ctx.font = "bold 36px Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("꼬기꼬기", W / 2, H * 0.38);
    }
    const bw = 280, bh = 16;
    const bx = (W - bw) / 2, by = H * 0.62;
    roundRect(bx - 2, by - 2, bw + 4, bh + 4, 10);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    roundRect(bx, by, bw, bh, 8);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fill();
    const pw = Math.max(4, bw * (ASSET.loadProgress || 0));
    roundRect(bx, by, pw, bh, 8);
    const bar = ctx.createLinearGradient(bx, by, bx + bw, by);
    bar.addColorStop(0, "#FFD54F");
    bar.addColorStop(1, "#FF8C00");
    ctx.fillStyle = bar;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(ASSET.loadLabel || "加载中…", W / 2, by + bh + 12);
    const pct = Math.round((ASSET.loadProgress || 0) * 100);
    ctx.font = "13px Microsoft YaHei, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(pct + "%", W / 2, by + bh + 34);
  }

  function drawTitle() {
    drawOuterBg();
    drawTitleSeabed();
    drawTitleLogo(W / 2, H * 0.26);
    drawStarButton(W * 0.35, H * 0.52, "#FF8C00", "开始", btnHover === "start", "start");
    drawStarButton(W * 0.65, H * 0.52, "#43A047", "说明", btnHover === "help", "help");
  }

  function drawHelp() {
    drawOuterBg();
    drawTitleSeabed();
    const panel = ASSET.ui.helpPanel;
    if (panel) {
      const pw = Math.min(560, W - 40);
      const ph = pw * (panel.height / panel.width);
      const px = (W - pw) / 2;
      const py = 28;
      drawAsset(panel, px, py, pw, ph);
      // Chinese caption under Korean original for the kid
      ctx.save();
      ctx.font = "bold 13px Microsoft YaHei, PingFang SC, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.strokeStyle = "#0A2A5A";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      const tip = "比自己小才能吃 · 撞大鱼会丢命 · 方向键移动";
      ctx.strokeText(tip, W / 2, py + ph + 18);
      ctx.fillText(tip, W / 2, py + ph + 18);
      ctx.restore();
      const next = ASSET.ui.btnNext;
      if (next) drawAssetSized(next, W - 55, H - 55, 48, 48);
      else {
        ctx.beginPath();
        ctx.arc(W - 55, H - 55, 28, 0, Math.PI * 2);
        ctx.fillStyle = btnHover === "next" ? "#FFA726" : "#FF8C00";
        ctx.fill();
      }
      return;
    }
    // Fallback vector help (kept for missing assets)
    const px = 50, py = 36, pw = 540, ph = 340;
    roundRect(px, py, pw, ph, 16);
    ctx.fillStyle = "#FFD01F";
    ctx.fill();
    roundRect(px + 14, py + 14, pw - 28, ph - 28, 10);
    ctx.fillStyle = "#A8D4F0";
    ctx.fill();
    ctx.fillStyle = "#1a3a5c";
    ctx.font = "bold 15px Microsoft YaHei, sans-serif";
    ctx.fillText("比自己小才能吃；撞大鱼会丢命；方向键移动", px + 40, py + 70);
    ctx.beginPath();
    ctx.arc(W - 55, H - 55, 28, 0, Math.PI * 2);
    ctx.fillStyle = "#FF8C00";
    ctx.fill();
  }

  function drawSign(x, y, ch, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#8D6E63";
    ctx.fillRect(-3, 0, 6, 28);
    ctx.fillStyle = "#D7CCC8";
    ctx.strokeStyle = "#5D4037";
    ctx.lineWidth = 2;
    roundRect(-18, -22, 36, 28, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "bold 20px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, 0, -8);
    ctx.restore();
  }

  function drawArrowKeys(cx, cy) {
    const keysPos = [
      [0, -22, "▲"],
      [-22, 0, "◀"],
      [0, 0, "▼"],
      [22, 0, "▶"],
    ];
    for (const [ox, oy, ch] of keysPos) {
      roundRect(cx + ox - 12, cy + oy - 12, 24, 24, 4);
      ctx.fillStyle = "#B0BEC5";
      ctx.fill();
      ctx.strokeStyle = "#546E7A";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#263238";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch, cx + ox, cy + oy + 1);
    }
  }

  function drawPlay() {
    drawOuterBg();
    const ox = shake > 0 ? rand(-3, 3) : 0;
    const oy = shake > 0 ? rand(-3, 3) : 0;
    ctx.save();
    ctx.translate(ox, oy);
    drawGoldFrame();
    drawSeabed(true);

    ctx.save();
    roundRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h, 10);
    ctx.clip();

    const all = fish.slice().sort((a, b) => a.y - b.y);
    for (const f of all) {
      if (f.y < (player ? player.y : 0)) {
        drawFishSprite(toScreenX(f.x), toScreenY(f.y), f.size, f.facing, f.kind, false, f.wobble, { artType: f.artType });
      }
    }
    if (player) {
      const blink = invuln > 0 && Math.floor(invuln * 8) % 2 === 0;
      if (!blink) {
        drawFishSprite(toScreenX(player.x), toScreenY(player.y), player.size, player.facing, "player", false, player.wobble, { player: true, chompT: player.chompT, hurtT: player.hurtT });
      }
    }
    for (const f of all) {
      if (f.y >= (player ? player.y : 0)) {
        drawFishSprite(toScreenX(f.x), toScreenY(f.y), f.size, f.facing, f.kind, false, f.wobble, { artType: f.artType });
      }
    }
    ctx.restore();

    for (const p of popups) {
      drawEatMc(p);
    }

    ctx.restore();

    // HUD: original logo + SCORE + TIME + lives
    if (ASSET.ui.logoHud) {
      // Logical HUD logo ~110×48 (asset may be 3× vector raster)
      drawAsset(ASSET.ui.logoHud, FX - 10, FY - 18, 110, 48);
    } else if (ASSET.ui.logo) {
      drawAsset(ASSET.ui.logo, FX - 16, FY - 28, 140, 70);
    } else {
      drawLogo(FX - 6, FY - 4, 1.05);
    }
    drawScorePlaque();
    drawTimeClock();
    drawLives();
    drawPauseOverlay();
  }


  function overPanelMetrics() {
    const px = 70, py = 62, pw = 500, ph = 270;
    const padX = pw * (73 / 1100), padY = ph * (73 / 790);
    const innerX = px + padX, innerY = py + padY;
    const innerW = pw - padX * 2, innerH = ph - padY * 2;
    const btnY = innerY + innerH - 56;
    return { px, py, pw, ph, padX, padY, innerX, innerY, innerW, innerH, btnY,
      retry: { x: W / 2 - 70, y: btnY, w: 140, h: 40 } };
  }

  function drawOver() {
    drawOuterBg();
    drawTitleSeabed();

    const px = 70, py = 62, pw = 500, ph = 270;
    // Match gold-frame.webp hole ratios (not SWF 22/422 guess)
    const padX = pw * (73 / 1100), padY = ph * (73 / 790);
    const innerX = px + padX, innerY = py + padY;
    const innerW = pw - padX * 2, innerH = ph - padY * 2;

    // Victorious / defeated fish peeks under the plaque (alive on win)
    if (deathFish) {
      const isWin = mode === "win";
      const sz = Math.max(42, (deathFish.size || 18) * (isWin ? 1.5 : 1.15));
      drawFishSprite(
        W / 2 + (isWin ? 120 : 150),
        py + ph + 6,
        sz,
        -1,
        "player",
        !isWin,
        isWin ? performance.now() / 180 : 0,
        { player: true, forceBitmap: false }
      );
    }

    if (ASSET.ui.goldFrame) {
      // Under-paint, frame, then over-paint to yellow edge so blue flush-meets gold
      ctx.save();
      ctx.fillStyle = "#A8D4F0";
      ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.restore();
      drawAsset(ASSET.ui.goldFrame, px, py, pw, ph);
      fillFrameHole(px, py, pw, ph, "#A8D4F0");
    } else {
      roundRect(px, py, pw, ph, 16);
      ctx.fillStyle = "#FFD01F";
      ctx.fill();
      roundRect(innerX, innerY, innerW, innerH, 10);
      ctx.fillStyle = "#A8D4F0";
      ctx.fill();
    }

    // Clip all plaque content to the visible inner panel
    ctx.save();
    roundRect(innerX + 2, innerY + 2, innerW - 4, innerH - 4, 6);
    ctx.clip();

    if (mode === "win" && ASSET.ui.congratulation) {
      drawAssetSized(ASSET.ui.congratulation, W / 2, innerY + 40, Math.min(320, innerW - 24), 58);
    } else if (ASSET.ui.gameOver) {
      drawAssetSized(ASSET.ui.gameOver, W / 2, innerY + 40, Math.min(240, innerW - 24), 48);
    } else {
      ctx.font = "bold 36px Impact, Arial Black, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(mode === "win" ? "CLEAR!" : "GAME OVER", W / 2, innerY + 44);
    }

    // Flush score strip: orange tag + LCD share one rounded bar (fit inside innerW)
    const text = String(Math.min(score, 999999)).padStart(6, "0");
    const rowW = Math.min(320, innerW - 36), rowH = 46;
    const gx = W / 2 - rowW / 2;
    const gy = innerY + innerH * 0.48;
    const tagW = 88;
    roundRect(gx, gy, rowW, rowH, 12);
    ctx.fillStyle = "#1A1208";
    ctx.fill();
    // Orange tag flush left
    ctx.save();
    roundRect(gx, gy, tagW, rowH, 12);
    ctx.clip();
    roundRect(gx, gy, tagW + 16, rowH, 12);
    const og = ctx.createLinearGradient(gx, gy, gx, gy + rowH);
    og.addColorStop(0, "#FFB74D");
    og.addColorStop(1, "#F57C00");
    ctx.fillStyle = og;
    ctx.fill();
    ctx.restore();
    // seam
    ctx.fillStyle = "#F57C00";
    ctx.fillRect(gx + tagW - 8, gy, 10, rowH);
    for (const [sx, sy] of [[10, 10], [tagW - 14, 10], [10, rowH - 10], [tagW - 14, rowH - 10]]) {
      ctx.beginPath();
      ctx.arc(gx + sx, gy + sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#FFE0B2";
      ctx.fill();
      ctx.strokeStyle = "#5D3200";
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.fillStyle = "#1A1208";
    ctx.font = "bold 24px Malgun Gothic, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("점수", gx + tagW / 2 - 2, gy + rowH / 2 + 1);

    const lcdX = gx + tagW + 4, lcdW = rowW - tagW - 10;
    const digW = 26, digH = 30, gap = 4;
    const tw = measureSevenSeg(text, digW, gap);
    // Yellow calculator digits (match original win plaque)
    drawSevenSegString(text, lcdX + (lcdW - tw) / 2, gy + (rowH - digH) / 2, digW, digH, gap, "#FFE566", "rgba(255,229,102,0.0)");

    // Outer stroke for whole strip
    roundRect(gx, gy, rowW, rowH, 12);
    ctx.strokeStyle = "#3D2200";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const btnY = innerY + innerH - 56;
    roundRect(W / 2 - 70, btnY, 140, 40, 12);
    ctx.fillStyle = btnHover === "retry" ? "#FFA726" : "#FF8C00";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("再玩一次", W / 2, btnY + 20);
    ctx.restore(); // end inner-panel clip
  }



  // ─── Loop ────────────────────────────────────────────────
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    ctx.clearRect(0, 0, W, H);
    if (mode === "loading") drawLoading();
    else if (mode === "title") drawTitle();
    else if (mode === "help") drawHelp();
    else if (mode === "play") drawPlay();
    else if (mode === "over" || mode === "win") drawOver();
    // Keep letterbox stick visible only during play (and redraw while held)
    if (mode === "play") drawJoystick();
    else syncJoypadVisibility();
    requestAnimationFrame(frame);
  }
  // Normal visits stay on the loader until enterBootMode() starts the round.
  // Do not call startGame() here — that would try to unlock audio before a gesture.
  if (location.hash === "#help") mode = "help";
  else if (location.hash === "#over") {
    score = 12345; lives = 0; deathFish = { x: 560, y: 220, size: 18 }; mode = "over";
  }

  requestAnimationFrame(frame);


  // ─── QA capture hooks (safe no-op unless ?qa=1) ───────────
  (function qaHooks() {
    const q = new URLSearchParams(location.search);
    if (q.get("qa") !== "1") return;
    const want = q.get("mode") || "title";
    const started = performance.now();
    function markReady() { window.__qaReady = true; }
    function waitPlayReady(then) {
      if (ASSET.playReady) { then(); return; }
      const w2 = setInterval(() => {
        if (ASSET.playReady || performance.now() - started > 35000) {
          clearInterval(w2);
          then();
        }
      }, 150);
    }
    const iv = setInterval(() => {
      if (!ASSET.ready) {
        if (performance.now() - started > 30000) clearInterval(iv);
        return;
      }
      clearInterval(iv);
      if (want === "title") {
        mode = "title";
        markReady();
      } else if (want === "play") {
        waitPlayReady(() => {
          try { startGame(); } catch (e) {}
          setTimeout(() => {
            paused = true;
            timeSec = 65;
            score = 123456;
            lives = 2;
            markReady();
          }, 1200);
        });
      } else if (want === "over" || want === "win") {
        waitPlayReady(() => {
          try { startGame(); } catch (e) {}
          setTimeout(() => {
            score = want === "win" ? 23456 : 12345;
            deathFish = { size: want === "win" ? 40 : 22 };
            mode = want;
            paused = false;
            markReady();
          }, 900);
        });
      } else {
        markReady();
      }
    }, 150);
  })();



  let shellHold = false;
  let shellPausedUs = false;
  window.addEventListener("message", (ev) => {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== "arcade") return;
    if (ev.data.action === "suspend") {
      if (shellHold) return;
      shellHold = true;
      shellPausedUs = mode === "play" && !paused;
      if (shellPausedUs) togglePause();
      else ensureBgm(false);
      if (audioCtx && audioCtx.state === "running") audioCtx.suspend().catch(() => {});
    } else if (ev.data.action === "resume") {
      if (!shellHold) return;
      shellHold = false;
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      if (shellPausedUs && mode === "play" && paused) togglePause();
      else if (mode === "play" && !paused) ensureBgm(true);
      shellPausedUs = false;
    }
  });

})();
