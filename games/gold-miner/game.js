'use strict';
/**
 * 黄金矿工 HTML5 remake — 4399 flash/1602
 * Physics/layouts/SFX from original SWF (CWS v6, 550×400 @18fps)
 */
const W = 550, H = 400, FPS = 18;
const ASSET_VER = '17';
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

let padsReady = false;
let dbgBtnReady = false;
function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = Math.min(window.innerWidth, window.innerHeight * W / H) + 'px';
  canvas.style.height = Math.min(window.innerHeight, window.innerWidth * H / W) + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (padsReady) layoutPads();
  if (typeof layoutDebugBtn === 'function' && dbgBtnReady) layoutDebugBtn();
}
fit();
addEventListener('resize', () => { fit(); });
addEventListener('orientationchange', () => setTimeout(fit, 60));

const images = {};
const TITLE_PACK = [
  ['titleScreen', 'assets/ui/title_screen.webp'],
];
const TITLE_PACK_2X = [
  ['titleScreen', 'assets/ui/title_screen@2x.webp'],
];
const PLAY_PACK = [
  ['playBg', 'assets/ui/play_bg.webp'],
  ['goalSplash', 'assets/ui/goal_splash.webp'],
  ['shopBg', 'assets/ui/shop_bg.webp'],
  ['shopBgHappy', 'assets/ui/shop_bg_happy.webp'],
  ['shopBgAngry', 'assets/ui/shop_bg_angry.webp'],
  ['shopDyn', 'assets/shop/dyn.webp'],
  ['shopStr', 'assets/shop/str.webp'],
  ['shopClover', 'assets/shop/clover.webp'],
  ['shopRock', 'assets/shop/rock.webp'],
  ['shopDia', 'assets/shop/dia.webp'],
  ['shopNext', 'assets/shop/next.webp'],
  ['minerIdle', 'assets/miner/idle.webp'],
  ['minerDown', 'assets/miner/down.webp'],
  ['minerUp', 'assets/miner/up.webp'],
  ['minerPull', 'assets/miner/pull.webp'],
  ['minerThrow1', 'assets/miner/throw1.webp'],
  ['minerThrow2', 'assets/miner/throw2.webp'],
  ['minerThrow3', 'assets/miner/throw3.webp'],
  ['hookOpen', 'assets/hook/open.webp'],
  ['hookClosed', 'assets/hook/closed.webp'],
  ['grab_2', 'assets/hook/grab_2.webp'],
  ['grab_3', 'assets/hook/grab_3.webp'],
  ['grab_4', 'assets/hook/grab_4.webp'],
  ['grab_5', 'assets/hook/grab_5.webp'],
  ['grab_6', 'assets/hook/grab_6.webp'],
  ['grab_7', 'assets/hook/grab_7.webp'],
  ['grab_8', 'assets/hook/grab_8.webp'],
  ['grab_9', 'assets/hook/grab_9.webp'],
  ['grab_10', 'assets/hook/grab_10.webp'],
  ['grab_11', 'assets/hook/grab_11.webp'],
  ['grab_12', 'assets/hook/grab_12.webp'],
  ['grab_13', 'assets/hook/grab_13.webp'],
  ['grab_14', 'assets/hook/grab_14.webp'],
  ['gold_s', 'assets/items/gold_s.webp'],
  ['gold_m', 'assets/items/gold_m.webp'],
  ['gold_l', 'assets/items/gold_l.webp'],
  ['gold_xl', 'assets/items/gold_xl.webp'],
  ['rock_m', 'assets/items/rock_m.webp'],
  ['rock_l', 'assets/items/rock_l.webp'],
  ['diamond_s', 'assets/items/diamond_s.webp'],
  ['diamond_m', 'assets/items/diamond_m.webp'],
  ['bag', 'assets/items/bag.webp'],
  ['bone', 'assets/items/bone.webp'],
  ['pig', 'assets/items/pig.webp'],
  ['skull', 'assets/items/skull.webp'],
  ['tnt', 'assets/items/tnt.webp'],
  ['dynStick', 'assets/fx/dyn_stick.webp'],
  ['dynBoom', 'assets/fx/dyn_boom.webp'],
];
const PLAY_PACK_2X = [
  ['playBg', 'assets/ui/play_bg@2x.webp'],
  ['shopBg', 'assets/ui/shop_bg@2x.webp'],
  ['shopBgHappy', 'assets/ui/shop_bg_happy@2x.webp'],
  ['shopBgAngry', 'assets/ui/shop_bg_angry@2x.webp'],
  ['shopNext', 'assets/shop/next@2x.webp'],
  ['minerIdle', 'assets/miner/idle@2x.webp'],
  ['minerDown', 'assets/miner/down@2x.webp'],
  ['minerUp', 'assets/miner/up@2x.webp'],
  ['minerPull', 'assets/miner/pull@2x.webp'],
  ['minerThrow1', 'assets/miner/throw1@2x.webp'],
  ['minerThrow2', 'assets/miner/throw2@2x.webp'],
  ['minerThrow3', 'assets/miner/throw3@2x.webp'],
];
const SFX_NAMES = ['level','win','money','click','grab','tick','throw','boom','drop','hit','score','pant'];

// Miner pull loop (sprite 238). Grab composites unused: they bake a rope stub that
// disconnects from the drawn rope when scaled; claw+item are drawn separately.
for (let i = 1; i <= 37; i++) {
  const id = String(i).padStart(2, '0');
  PLAY_PACK.push(['minerPull' + i, 'assets/miner/pull_frames/' + id + '.webp']);
  PLAY_PACK_2X.push(['minerPull' + i, 'assets/miner/pull_frames/' + id + '@2x.webp']);
}
for (const k of ['gold_s','gold_m','gold_l','gold_xl','rock_m','rock_l','diamond_s','diamond_m','bag','bone','pig','skull','tnt','shopDyn','shopStr','shopClover','shopRock','shopDia','hookOpen','hookClosed','grab_2','grab_3','grab_4','grab_5','grab_6','grab_7','grab_8','grab_9','grab_10','grab_11','grab_12','grab_13','grab_14','goalSplash','dynStick','dynBoom']) {
  const base = PLAY_PACK.find(p => p[0] === k);
  if (base) PLAY_PACK_2X.push([k, base[1].replace('.webp', '@2x.webp')]);
}

const TITLE_PACK_3X = TITLE_PACK_2X.map(([k, u]) => [k, u.replace('@2x.webp', '@3x.webp')]);
const PLAY_PACK_3X = PLAY_PACK_2X.map(([k, u]) => [k, u.replace('@2x.webp', '@3x.webp')]);
// Vector re-renders from SWF (FFDec -zoom): 1x = zoom3, @2x = zoom6 (serves 3x screens too)
for (let i = 1; i <= 7; i++) {
  PLAY_PACK.push(['mouse_' + i, 'assets/items/walk/mouse_' + i + '.webp']);
  PLAY_PACK.push(['mouseDia_' + i, 'assets/items/walk/mouse_dia_' + i + '.webp']);
  PLAY_PACK_2X.push(['mouse_' + i, 'assets/items/walk/mouse_' + i + '@2x.webp']);
  PLAY_PACK_2X.push(['mouseDia_' + i, 'assets/items/walk/mouse_dia_' + i + '@2x.webp']);
}
for (let i = 1; i <= 14; i++) {
  PLAY_PACK.push(['tntBoom' + i, 'assets/fx/tnt/boom_' + i + '.webp']);
  PLAY_PACK_2X.push(['tntBoom' + i, 'assets/fx/tnt/boom_' + i + '@2x.webp']);
}



function loadImage(key, url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { images[key] = im; res(im); };
    im.onerror = () => rej(new Error(url));
    im.src = url + (url.includes('?') ? '&' : '?') + 'v=' + ASSET_VER;
  });
}
async function loadPack(pack, pack2x, onProgress, pack3x) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const byKey = new Map(pack);
  if (dpr >= 1.5 && pack2x) {
    for (const [k, u] of pack2x) byKey.set(k, u);
  }
  if (dpr >= 2.5 && pack3x) {
    for (const [k, u] of pack3x) byKey.set(k, u);
  }
  const merged = [...byKey.entries()];
  let i = 0;
  for (const [k, u] of merged) {
    try {
      await loadImage(k, u);
    } catch (e) {
      // fall back: @3x → @2x → 1x
      const two = pack2x && pack2x.find(p => p[0] === k);
      const one = pack.find(p => p[0] === k);
      let ok = false;
      if (two && two[1] !== u) {
        try { await loadImage(k, two[1]); ok = true; } catch (e2) {}
      }
      if (!ok && one && one[1] !== u) {
        try { await loadImage(k, one[1]); ok = true; } catch (e2) { console.warn(e2); }
      }
      if (!ok) console.warn(e);
    }
    i++;
    if (onProgress) onProgress(i / merged.length);
  }
}

let audioCtx = null;
const audioBuffers = {};
const sfxLastAt = Object.create(null);   // debounce clock (AudioContext time)
const sfxActive = Object.create(null);   // exclusive one-shots we may stop
const SFX_DEBOUNCE = {
  pant: 0.68, drop: 0.55, hit: 0.14, grab: 0.14, money: 0.18,
  score: 0.14, click: 0.08, throw: 0.12, boom: 0.12, tick: 0.25,
  win: 0.6, level: 0.6,
};
const SFX_EXCLUSIVE = new Set(['pant', 'drop']);

function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended' && !shellHold) audioCtx.resume();
  return audioCtx;
}

/** Unlock autoplay policy on first user gesture (no setTimeout). */
function unlockAudio() {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const silent = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = silent;
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {}
}

/** Trim leading/trailing near-silence so one-shots fire immediately. */
function trimSilence(buf, thresh = 0.018) {
  if (!buf || !audioCtx) return buf;
  const nch = buf.numberOfChannels;
  const len = buf.length;
  const sr = buf.sampleRate;
  let start = 0;
  let end = len - 1;
  outerStart: for (let i = 0; i < len; i++) {
    for (let c = 0; c < nch; c++) {
      if (Math.abs(buf.getChannelData(c)[i]) > thresh) { start = i; break outerStart; }
    }
  }
  outerEnd: for (let i = len - 1; i >= start; i--) {
    for (let c = 0; c < nch; c++) {
      if (Math.abs(buf.getChannelData(c)[i]) > thresh) { end = i; break outerEnd; }
    }
  }
  const pad = Math.max(1, (sr * 0.004) | 0);
  start = Math.max(0, start - pad);
  end = Math.min(len - 1, end + pad);
  const outLen = Math.max(1, end - start + 1);
  if (outLen >= len - 8) return buf; // already tight
  const out = audioCtx.createBuffer(nch, outLen, sr);
  for (let c = 0; c < nch; c++) {
    out.getChannelData(c).set(buf.getChannelData(c).subarray(start, end + 1));
  }
  return out;
}

async function loadSfx(name) {
  try {
    const ctx = ensureAudio();
    if (!ctx) return;
    const r = await fetch('assets/sfx/' + name + '.mp3?v=' + ASSET_VER);
    const raw = await ctx.decodeAudioData(await r.arrayBuffer());
    audioBuffers[name] = trimSilence(raw);
  } catch (e) {}
}

function stopSfx(name) {
  const slot = sfxActive[name];
  if (!slot || !audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    slot.gain.gain.cancelScheduledValues(t);
    slot.gain.gain.setValueAtTime(0, t);
    slot.src.stop(t);
  } catch (e) {}
  if (sfxActive[name] === slot) delete sfxActive[name];
}

function stopPant() {
  stopSfx('pant');
  pantCool = 0;
}

/** Web Audio one-shot: pre-decoded, silence-trimmed, debounced, optional exclusive. */
function playSfx(name, vol = 0.55) {
  try {
    const ctx = ensureAudio();
    const buf = audioBuffers[name];
    if (!ctx || !buf) return;
    const now = ctx.currentTime;
    const gap = SFX_DEBOUNCE[name] != null ? SFX_DEBOUNCE[name] : 0.05;
    if (sfxLastAt[name] != null && now - sfxLastAt[name] < gap) return;
    if (SFX_EXCLUSIVE.has(name)) stopSfx(name);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(ctx.destination);
    src.onended = () => {
      if (sfxActive[name] && sfxActive[name].src === src) delete sfxActive[name];
    };
    src.start(0);
    sfxLastAt[name] = now;
    if (SFX_EXCLUSIVE.has(name)) sfxActive[name] = { src, gain: g };
  } catch (e) {}
}
function setLoad(p) {
  const bar = document.getElementById('bar');
  const pct = document.getElementById('pct');
  if (bar) bar.style.width = (p * 100).toFixed(0) + '%';
  if (pct) pct.textContent = (p * 100).toFixed(0) + '%';
}

// ----- SWF constants -----
const PIVOT = { x: 275.5, y: 48.6 };
const MINER_POS = { x: 285.85, y: 34.75, scale: 0.389 };
const MINER_NATIVE = { w: 139, h: 144 }; // DefineSprite_238 export size (all poses)
const MINER_DRAW_SCALE = 0.42; // ~SWF 0.389, slight bump for readability
const DROP_PX_PER_FRAME = 9.86;       // timeline Y step
const PULL_PX_PER_FRAME = 1.385;      // claw Y step on pull timeline
const BASE_STRENGTH = 10;
const MAX_LEVEL = 15; // original 10 + custom hard extras L11–L15
const LEN_MIN = 12.45;
const LEN_MAX = 407;
const PULL_FRAME_MAX = 20; // DefineSprite_238 pull loop before throw label
// SWF hitTest: tip PlaceObject(256)=shape40 12.4×12.4 vs item.ob.box (shape40 × scales below)
const TIP_HALF = 6.2;
const HOOK_OPEN_NATIVE = { w: 28, h: 18 }; // cropped DefineSprite_281/1
// Open/closed hook: native crop size + Y offset so metal hinge sits on rope tip.
const HOOK_OPEN_HINGE = 5;
const GRAB_LOGICAL = {
  2: { w: 20, h: 24, hingeY: 3, ox: -1 },
  3: { w: 32, h: 33, hingeY: 4, ox: -1 },
  4: { w: 58, h: 57, hingeY: 4, ox: -3 },
  5: { w: 74, h: 71, hingeY: 3, ox: 0 },
  6: { w: 32, h: 27, hingeY: 3, ox: -3 },
  7: { w: 29, h: 30, hingeY: 3, ox: 3 },
  8: { w: 45, h: 46, hingeY: 5, ox: 3 },
  9: { w: 22, h: 40, hingeY: 5, ox: 2 },
  10: { w: 36, h: 28, hingeY: 3, ox: -1 },
  11: { w: 20, h: 24, hingeY: 4, ox: -1 },
  12: { w: 37, h: 41, hingeY: 6, ox: 1 },
  13: { w: 29, h: 31, hingeY: 4, ox: -2 },
  14: { w: 33, h: 35, hingeY: 4, ox: 0 },
};
// Internal box scales on art sprites (FFDec PlaceObject name=box)
const ITEM_BOX = {
  gold_s:   { sx: 2.476, sy: 2.476, ox: 1.05, oy: -1.0 },
  gold_m:   { sx: 2.476, sy: 2.476, ox: 1.05, oy: -1.0 },
  gold_l:   { sx: 2.476, sy: 2.476, ox: 1.05, oy: -1.0 },
  gold_xl:  { sx: 2.476, sy: 2.476, ox: 1.05, oy: -1.0 },
  rock_m:   { sx: 3.368, sy: 2.781, ox: 4.30, oy: -7.65 },
  rock_l:   { sx: 2.960, sy: 2.960, ox: 5.85, oy: 10.2 },
  diamond_s:{ sx: 1.379, sy: 1.379, ox: -0.45, oy: 4.2 },
  diamond_m:{ sx: 2.032, sy: 2.032, ox: 0.15, oy: -1.0 },
  bag:      { sx: 3.250, sy: 3.250, ox: -0.45, oy: 1.8 },
  bone:     { sx: 2.540, sy: 1.355, ox: 3.65, oy: 4.25 },
  pig:      { sx: 2.032, sy: 2.032, ox: 0.15, oy: -1.0 },
  skull:    { sx: 2.282, sy: 2.282, ox: 0.55, oy: -0.8 },
  tnt:      { sx: 4.105, sy: 5.081, ox: 4.95, oy: 10.4 },
};

const ITEM_DEFS = {
  gold_s:   { object: 2,  price: 50,  weight: 3, r: 10, key: 'gold_s' },
  gold_m:   { object: 3,  price: 100, weight: 7, r: 14, key: 'gold_m' },
  gold_l:   { object: 4,  price: 250, weight: 8, r: 26, key: 'gold_l' },
  gold_xl:  { object: 5,  price: 500, weight: 9, r: 34, key: 'gold_xl' },
  rock_m:   { object: 14, price: 11, weight: 8, r: 22, key: 'rock_m', rock: true },
  rock_l:   { object: 8,  price: 20, weight: 9, r: 30, key: 'rock_l', rock: true },
  diamond_s:{ object: 11, price: 600, weight: 2, r: 10, key: 'diamond_s', diamond: true },
  diamond_m:{ object: 10, price: 602, weight: 5, r: 14, key: 'diamond_m', diamond: true },
  bag:      { object: 12, price: 0,   weight: 4, r: 22, key: 'bag', bag: true },
  bone:     { object: 7,  price: 7,   weight: 3, r: 14, key: 'bone' },
  pig:      { object: 6,  price: 2,   weight: 3, r: 12, key: 'pig' },
  skull:    { object: 13, price: 20,  weight: 2, r: 14, key: 'skull' },
  tnt:      { object: 9,  price: 1,   weight: 2, r: 18, key: 'tnt', tnt: true },
};

// Every T{n} wraps its art clip "ob" at this scale (DefineSprite_317/319/322/330…)
const OB_SCALE = 0.595932;
const OB_SCALE_BY_KEY = { gold_s: 0.3136444, gold_l: 1.1769714, gold_xl: 1.5345306 };

// ---- Mice: DefineSprite_316 (mouse) / 318 (diamond mouse), 213-frame timeline @18fps ----
// Walker (sprite 271/275, 7-frame leg cycle) is tweened along X; the art faces left.
//  f1–78   walk left  3.55 → −382.85 px (sprite-316 space)  ≈ 5.02 px/f
//  f79–102 stand, facing right; f80: gotoAndPlay(_currentframe + random(20) + 1)
//  f103–187 walk right −382.85 → −6.45                       = 4.60 px/f
//  f188–213 stand at 3.55, facing left; f189: same random skip; then loop to f1
// Stage = spot + spot.sx × OB_SCALE × local  → ≈2.99 / 2.74 px per frame, 230 px span.
const MOUSE_HOME_X = 3.55, MOUSE_FAR_X = -382.85, MOUSE_Y = 3.15;
const MOUSE_BOUNDS = { mouse: [-22.64, -17.15, 45.78, 33.73], mouseDia: [-24.68, -17.15, 47.82, 33.73] };
function mousePose(f) {
  if (f <= 78) return { x: MOUSE_HOME_X + (MOUSE_FAR_X - MOUSE_HOME_X) * (f - 1) / 77, face: 1, walk: true, anim: ((f - 1) % 7) + 1 };
  if (f <= 102) return { x: MOUSE_FAR_X, face: -1, walk: false, anim: 1 };
  if (f <= 187) return { x: MOUSE_FAR_X + 4.6 * (f - 103), face: -1, walk: true, anim: ((f - 103) % 7) + 1 };
  return { x: MOUSE_HOME_X, face: 1, walk: false, anim: 1 };
}
function advanceMouse(it) {
  let f = it.walkF + 1;
  if (f > 213) f = 1;
  // frame 80 / 189 DoAction: gotoAndPlay(_currentframe + random(20) + 1)
  if (f === 80 || f === 189) f = f + ((Math.random() * 20) | 0) + 1;
  it.walkF = f;
  const p = mousePose(f);
  it.walkX = p.x;
  it.face = p.face;
  it.anim = p.anim;
  // SWF keeps .ob.box at the spawn point; remake moves the hit box with the body
  it.x = it.baseX + it.sx * OB_SCALE * (p.x - MOUSE_HOME_X);
}

// ---- TNT: DefineSprite_330 frame 2 → explosion clip 253 @(3.65,2.85)×2.2416 + sound 254 ----
// Clip 253 frame 9 places "box" (shape40 ±6.2 px) @(0.3,−1.75) × (6.9598, 6.2580); frames 9–13
// its enterFrame hitTests every _root.T{n}.ob.box → T.gotoAndStop(2) (items vanish, TNT chains).
const TNT_FX = { x: 3.65, y: 2.85, s: 2.241623, bounds: [-66.33, -61.24, 130.48, 122.47] };
const TNT_BLAST = {
  ox: TNT_FX.x + 0.3 * TNT_FX.s,          // ≈ 4.32
  oy: TNT_FX.y - 1.75 * TNT_FX.s,         // ≈ −1.07
  hx: 6.2 * 6.9598236 * TNT_FX.s,         // ≈ 96.7 px half-width
  hy: 6.2 * 6.2580414 * TNT_FX.s,         // ≈ 87.0 px half-height
  frameOn: 9, frameOff: 13, frames: 14,
};
let explosions = [];

const SWING = (typeof GM_SWING !== 'undefined' && GM_SWING.length) ? GM_SWING : (() => {
  const a = [];
  for (let i = 0; i < 87; i++) a.push(Math.sin(i / 86 * Math.PI * 2) * 67);
  return a;
})();

// ----- State -----
let mode = 'title';
let shellHold = false;
let score = 0, goal = 650, level = 1, levelDis = 1;
let timeLeft = 60, stick = 0, minerStrength = BASE_STRENGTH;
let strengthBoost = 0, strengthFlag = 0;
let rockBonus = 0, diamondBonus = 0, cloverBonus = 0;
let goalAddOn = 275;
let items = [];
let claw = {
  swingFrame: 2, angleDeg: 0,
  state: 'swing', // swing | drop | pull
  len: LEN_MIN, caught: null, busy: 0,
  price: 0, weight: 0, stickBonus: 0,
};
let floatTexts = [];
let shopItems = [];
let shopSel = -1;
let shopBought = 0;
let shopFace = 'idle'; // idle | happy | angry
let shopExitTimer = 0;
let resultOk = false;
let lastTs = 0;
let logicAcc = 0;
let isTouch = matchMedia('(pointer:coarse)').matches || (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
// Phone/tablet virtual pads — HTML overlay in letterbox (bottom-right), NOT on 550×400 playfield
const padsEl = document.getElementById('pads');
const btnDrop = document.getElementById('btnDrop');
const btnDyn = document.getElementById('btnDyn');
const dynCountEl = document.getElementById('dynCount');
let padsEnabled = false;
let hintAlpha = 1;

function detectTouchUI() {
  const coarse = matchMedia('(pointer:coarse)').matches;
  const touchPts = (navigator.maxTouchPoints || 0) > 0;
  const small = Math.min(innerWidth, innerHeight) < 900;
  padsEnabled = !!(coarse || touchPts || ('ontouchstart' in window && small));
  isTouch = padsEnabled;
  layoutPads();
}
function safeInset() { return 10; }
/** Place dual pads in empty margin right/bottom of letterboxed canvas (portrait & landscape). */
function layoutPads() {
  if (!padsReady || !padsEl) return;
  if (!padsEnabled) {
    padsEl.classList.remove('on');
    padsEl.setAttribute('aria-hidden', 'true');
    return;
  }
  const sr = canvas.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight;
  const safe = safeInset();
  const short = Math.min(vw, vh);
  const btn = Math.round(Math.min(72, Math.max(56, short * 0.14)));
  const gap = 10;
  const stackH = btn * 2 + gap;
  const stackW = btn;

  const gapBelow = vh - sr.bottom;
  const gapRight = vw - sr.right;
  const gapLeft = sr.left;
  let left, top;

  if (gapBelow >= stackH + safe + 4) {
    // Portrait / tall: bottom letterbox, right side
    left = Math.min(vw - stackW - safe, Math.max(safe, sr.right - stackW));
    top = vh - stackH - safe;
    if (top < sr.bottom + 2) top = sr.bottom + 2;
  } else if (gapRight >= stackW + safe + 4) {
    // Landscape: right letterbox, lower end
    left = Math.min(vw - stackW - safe, sr.right + 8);
    top = Math.min(vh - stackH - safe, Math.max(sr.top + 8, sr.bottom - stackH - 4));
  } else if (gapLeft >= stackW + safe + 4 && gapLeft > gapRight) {
    // More room on left — still prefer bottom-right of viewport if possible
    left = Math.min(vw - stackW - safe, sr.right + 4);
    top = Math.min(vh - stackH - safe, Math.max(sr.top + 8, sr.bottom - stackH - 4));
    if (left + stackW > vw - 4 || left < sr.right - 4) {
      left = Math.max(safe, sr.left - stackW - 8);
      top = Math.min(vh - stackH - safe, Math.max(sr.top + 8, sr.bottom - stackH - 4));
    }
  } else {
    // No usable letterbox — hide rather than cover the 550×400 playfield
    padsEl.classList.remove('on');
    padsEl.setAttribute('aria-hidden', 'true');
    return;
  }

  padsEl.style.left = Math.round(left) + 'px';
  padsEl.style.top = Math.round(top) + 'px';
  padsEl.style.width = stackW + 'px';
  padsEl.style.gap = gap + 'px';
  for (const b of [btnDrop, btnDyn]) {
    if (!b) continue;
    b.style.width = btn + 'px';
    b.style.height = btn + 'px';
    b.style.fontSize = Math.round(btn * 0.22) + 'px';
  }
  syncPadsVisibility();
}
function syncPadsVisibility() {
  if (!padsEl) return;
  const show = padsEnabled && mode === 'play';
  padsEl.classList.toggle('on', show);
  padsEl.setAttribute('aria-hidden', show ? 'false' : 'true');
  refreshPadState();
}
function refreshPadState() {
  if (!padsReady || !btnDrop || !btnDyn) return;
  const swinging = mode === 'play' && claw && claw.state === 'swing';
  btnDrop.classList.toggle('armed', !!swinging);
  btnDyn.classList.toggle('armed', stick > 0);
  btnDyn.disabled = stick <= 0;
  if (dynCountEl) dynCountEl.textContent = String(stick);
}
padsReady = true;
detectTouchUI();
addEventListener('resize', detectTouchUI);
addEventListener('orientationchange', () => setTimeout(detectTouchUI, 60));
let minerPose = 'idle'; // idle | down | up | pull | throw
let throwTimer = 0;
let boomFx = null; // {x,y,life}
// SWF dynamite: sprite 238 frames 31–33 throw, frame 34 starts stick flight (DefineSprite_255/250), boom on claw hit
let dynToss = null; // {phase:'throw'|'fly', frame, x, y}
let goalTimer = 0;
let minerAnim = 1;      // sprite 238 frame 1..37
let pantCool = 0;

function resetRun() {
  score = 0; level = 1; levelDis = 1;
  timeLeft = 60; stick = 0;
  minerStrength = BASE_STRENGTH;
  strengthBoost = 0; strengthFlag = 0;
  rockBonus = 0; diamondBonus = 0; cloverBonus = 0;
  goalAddOn = 275; goal = 375 + goalAddOn;
  showGoal();
}
function showGoal() {
  mode = 'goal';
  goalTimer = 0;
  syncPadsVisibility();
}

function effectiveStrength() {
  return minerStrength + strengthBoost;
}

function priceOf(def) {
  if (def.rock && rockBonus) return def.key === 'rock_l' ? 60 : 33;
  if (def.diamond && diamondBonus) return def.key === 'diamond_m' ? 902 : 900;
  if (def.bag) return rollBag();
  return def.price;
}
function weightOf(def) {
  if (def.bag) {
    const w = (Math.random() * 4 | 0) + 1;
    if (w === 1) return (Math.random() * 9 | 0) + 1;
    if (w === 2) return -((Math.random() * 5 | 0) + 1);
    if (w === 3) return 9;
    return -1; // stickBonus fast pull
  }
  return def.weight;
}
function rollBag() {
  const w2 = (Math.random() * 6 | 0) + 1;
  if (cloverBonus) {
    if (w2 <= 2) return 'power';
    if (w2 <= 4) return stick <= 3 ? 'dynamite' : ((Math.random() * 300 | 0) + 300);
    return 700;
  }
  if (w2 <= 3) return (Math.random() * 600 | 0) + 1;
  if (w2 === 4) return 'power';
  if (w2 === 5) return stick <= 3 ? 'dynamite' : ((Math.random() * 100 | 0) + 100);
  return 800;
}

let forcedVariant = 0; // debug: 1..3 picks L{lv}_{v} once
function pickLevelLayout(lv) {
  if (forcedVariant && window.GM_LEVELS && GM_LEVELS['L' + lv + '_' + forcedVariant]) {
    const k = 'L' + lv + '_' + forcedVariant;
    forcedVariant = 0;
    return GM_LEVELS[k];
  }
  forcedVariant = 0;
  const variants = [1, 2, 3].map(v => 'L' + lv + '_' + v).filter(k => window.GM_LEVELS && GM_LEVELS[k]);
  if (!variants.length) return null;
  return GM_LEVELS[variants[(Math.random() * variants.length) | 0]];
}

function startLevel() {
  mode = 'play';
  syncPadsVisibility();
  timeLeft = 60;
  strengthFlag = 0;
  claw = {
    swingFrame: 2 + ((Math.random() * 80) | 0),
    angleDeg: 0, state: 'swing', len: LEN_MIN,
    caught: null, busy: 0, price: 0, weight: 0, stickBonus: 0,
  };
  claw.angleDeg = SWING[claw.swingFrame % SWING.length] || 0;
  floatTexts = [];
  boomFx = null;
  dynToss = null;
  minerPose = 'idle';
  throwTimer = 0;
  hintAlpha = 1;
  minerAnim = 1;
  stopPant();
  items = [];
  explosions = [];
  const layout = pickLevelLayout(level);
  if (layout) {
    for (const spot of layout) {
      const def = ITEM_DEFS[spot.key];
      if (!def) continue;
      // Flipped spots (sx = −1, e.g. right-walking mice) must not collapse to size 0
      const asx = Math.abs(spot.sx), asy = Math.abs(spot.sy);
      const sc = (asx + asy) / 2;
      const box = ITEM_BOX[def.key] || { sx: 2.5, sy: 2.5, ox: 0, oy: 0 };
      const walker = def.key === 'pig' || def.key === 'diamond_m';
      items.push({
        walker, walkF: 1, walkX: MOUSE_HOME_X, face: 1, anim: 1, baseX: spot.x,
        obScale: OB_SCALE_BY_KEY[def.key] || OB_SCALE,
        x: spot.x, y: spot.y,
        r: def.r * sc,
        sx: spot.sx, sy: spot.sy,
        key: def.key, def,
        price: priceOf(def), weight: weightOf(def),
        alive: true, object: def.object,
        // Flash AABB half-extents of .ob.box in stage px
        boxHx: TIP_HALF * box.sx * asx,
        boxHy: TIP_HALF * box.sy * asy,
        boxOx: box.ox * spot.sx,
        boxOy: box.oy * spot.sy,
      });
    }
  }
  playSfx('level', 0.45);
}

// ----- Pixel-shape collision (claw jaws vs item outline) -----
// Both shapes are alpha masks of the art exactly as drawn. Grid = HIT_RES cells per stage px.
const HIT_RES = 2;
const HIT_ALPHA = 128;           // "visible" pixel threshold
let showHitShapes = false;
let clawHit = null;              // { pts: Float32Array local [x,y,...], rad, src, ov }
const walkerMaskCache = new Map();
let maskCv = null, maskCtx = null;

function maskCanvas(w, h) {
  if (!maskCv) {
    maskCv = document.createElement('canvas');
    maskCtx = maskCv.getContext('2d', { willReadFrequently: true });
  }
  if (maskCv.width < w) maskCv.width = w;
  if (maskCv.height < h) maskCv.height = h;
  maskCtx.setTransform(1, 0, 0, 1, 0, 0);
  maskCtx.clearRect(0, 0, maskCv.width, maskCv.height);
  return maskCtx;
}
/** Rasterize drawCb (stage-space drawing) inside [x0,y0,w,h] into a 0/1 mask. */
function rasterMask(x0, y0, w, h, drawCb) {
  x0 = Math.floor(x0 * HIT_RES) / HIT_RES; y0 = Math.floor(y0 * HIT_RES) / HIT_RES;
  const cw = Math.max(1, Math.ceil((w + 1) * HIT_RES)), ch = Math.max(1, Math.ceil((h + 1) * HIT_RES));
  const g = maskCanvas(cw, ch);
  g.setTransform(HIT_RES, 0, 0, HIT_RES, -x0 * HIT_RES, -y0 * HIT_RES);
  drawCb(g);
  const px = g.getImageData(0, 0, cw, ch).data;
  const data = new Uint8Array(cw * ch);
  let n = 0;
  for (let i = 0, j = 3; i < data.length; i++, j += 4) if (px[j] >= HIT_ALPHA) { data[i] = 1; n++; }
  return { x0, y0, w: cw, h: ch, data, n };
}
function drawItemShape(g, it, im) {
  const s = it.r * 2.15;
  if (im) g.drawImage(im, it.x - s / 2, it.y - s / 2, s, s * (im.height / im.width));
  else { g.fillStyle = '#000'; g.beginPath(); g.arc(it.x, it.y, it.r, 0, Math.PI * 2); g.fill(); }
}
/** Mask of a walker frame in body-local stage px (origin = body origin, see drawMouse). */
function walkerMask(it) {
  const dia = it.key === 'diamond_m';
  const im = images[(dia ? 'mouseDia_' : 'mouse_') + (it.anim || 1)];
  const kx = it.sx * OB_SCALE * (it.face || 1), ky = Math.abs(it.sy) * OB_SCALE;
  const key = (dia ? 'd' : 'm') + (im ? it.anim : 's') + '|' + kx.toFixed(4) + '|' + ky.toFixed(4);
  let m = walkerMaskCache.get(key);
  if (m) return m;
  if (im) {
    const b = MOUSE_BOUNDS[dia ? 'mouseDia' : 'mouse'];
    const xs = [b[0] * kx, (b[0] + b[2]) * kx], ys = [b[1] * ky, (b[1] + b[3]) * ky];
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    m = rasterMask(x0, y0, Math.abs(xs[1] - xs[0]), Math.abs(ys[1] - ys[0]), (g) => {
      g.scale(kx, ky); g.drawImage(im, b[0], b[1], b[2], b[3]);
    });
  } else {
    const st = images[it.key];
    const w = 46, h = st ? w * st.height / st.width : 30;
    m = rasterMask(-w / 2, -h / 2, w, h, (g) => {
      if (st) g.drawImage(st, -w / 2, -h / 2, w, h); else g.fillRect(-w / 2, -h / 2, w, h);
    });
  }
  walkerMaskCache.set(key, m);
  return m;
}
/** World-space mask for an item: { m, ox, oy } (mask origin offset added to m.x0/y0). */
function itemHitMask(it) {
  if (it.walker) {
    const kx = it.sx * OB_SCALE, ky = Math.abs(it.sy) * OB_SCALE;
    return { m: walkerMask(it), ox: it.baseX + kx * it.walkX, oy: it.y + ky * MOUSE_Y };
  }
  const im = images[it.key] || null;
  if (!it._mask || it._maskIm !== im || it._maskX !== it.x || it._maskY !== it.y) {
    const s = it.r * 2.15, h = im ? s * im.height / im.width : s;
    const x0 = im ? it.x - s / 2 : it.x - it.r, y0 = im ? it.y - s / 2 : it.y - it.r;
    it._mask = rasterMask(x0, y0, im ? s : it.r * 2, im ? h : it.r * 2, (g) => drawItemShape(g, it, im));
    it._maskIm = im; it._maskX = it.x; it._maskY = it.y;
  }
  return { m: it._mask, ox: 0, oy: 0 };
}
/** Solid pixels of the open claw (hookOpen as drawn in drawClaw), claw-local stage px. */
function getClawHit() {
  const im = images.hookOpen || null;
  if (clawHit && clawHit.src === im) return clawHit;
  const nw = HOOK_OPEN_NATIVE.w, nh = HOOK_OPEN_NATIVE.h, hy = HOOK_OPEN_HINGE;
  const m = rasterMask(-nw / 2, -hy, nw, nh, (g) => {
    if (im) g.drawImage(im, -nw / 2, -hy, nw, nh);
    else g.fillRect(-TIP_HALF, -TIP_HALF, TIP_HALF * 2, TIP_HALF * 2);
  });
  const pts = [];
  let rad = 0;
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
    if (!m.data[j * m.w + i]) continue;
    const x = m.x0 + (i + 0.5) / HIT_RES, y = m.y0 + (j + 0.5) / HIT_RES;
    pts.push(x, y);
    rad = Math.max(rad, Math.hypot(x, y));
  }
  clawHit = { pts: new Float32Array(pts), rad: rad + 1, src: im, m, ov: null };
  return clawHit;
}
/** Number of open-claw pixels (at tip/angle) landing on the item's visible pixels. */
function clawOverlap(it, tip, angleDeg, stopAtFirst) {
  const ch = getClawHit();
  const { m, ox, oy } = itemHitMask(it);
  const mx0 = m.x0 + ox, my0 = m.y0 + oy;
  const mx1 = mx0 + m.w / HIT_RES, my1 = my0 + m.h / HIT_RES;
  if (tip.x + ch.rad < mx0 || tip.x - ch.rad > mx1 || tip.y + ch.rad < my0 || tip.y - ch.rad > my1) return 0;
  const a = angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const P = ch.pts, D = m.data, W = m.w, Hh = m.h;
  let n = 0;
  for (let k = 0; k < P.length; k += 2) {
    const wx = tip.x + P[k] * c - P[k + 1] * s;
    const wy = tip.y + P[k] * s + P[k + 1] * c;
    const i = ((wx - mx0) * HIT_RES) | 0, j = ((wy - my0) * HIT_RES) | 0;
    if (wx < mx0 || wy < my0 || i >= W || j >= Hh) continue;
    if (D[j * W + i]) { n++; if (stopAtFirst) return n; }
  }
  return n;
}
/** First item touched by the open claw at (len, angle); closest to the hinge wins ties. */
function clawHitAt(len, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const tip = { x: PIVOT.x - Math.sin(rad) * len, y: PIVOT.y + Math.cos(rad) * len };
  let best = null, bestD = Infinity;
  for (const it of items) {
    if (!it.alive || claw.caught === it) continue;
    if (clawOverlap(it, tip, angleDeg, true)) {
      const d = (it.x - tip.x) * (it.x - tip.x) + (it.y - tip.y) * (it.y - tip.y);
      if (d < bestD) { bestD = d; best = it; }
    }
  }
  return best;
}
function overlayCanvas(m, rgba) {
  const cv = document.createElement('canvas');
  cv.width = m.w; cv.height = m.h;
  const g = cv.getContext('2d');
  const id = g.createImageData(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) if (m.data[i]) id.data.set(rgba, i * 4);
  g.putImageData(id, 0, 0);
  return cv;
}
function drawHitShapes() {
  if (!showHitShapes || mode !== 'play') return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const it of items) {
    if (!it.alive || claw.caught === it) continue;
    const { m, ox, oy } = itemHitMask(it);
    if (!m.ov) m.ov = overlayCanvas(m, [0, 255, 255, 120]);
    ctx.drawImage(m.ov, m.x0 + ox, m.y0 + oy, m.w / HIT_RES, m.h / HIT_RES);
  }
  if (!claw.caught) {
    const ch = getClawHit();
    if (!ch.ov) ch.ov = overlayCanvas(ch.m, [255, 0, 80, 170]);
    const tip = clawTip();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(claw.angleDeg * Math.PI / 180);
    ctx.drawImage(ch.ov, ch.m.x0, ch.m.y0, ch.m.w / HIT_RES, ch.m.h / HIT_RES);
  }
  ctx.restore();
}

function clawTip() {
  // Flash _rotation: +deg = clockwise. With Y-down, local +Y maps to (-sin, +cos).
  // Tip must use the same mapping so the rope ends where the claw hinge faces.
  const rad = claw.angleDeg * Math.PI / 180;
  return {
    x: PIVOT.x - Math.sin(rad) * claw.len,
    y: PIVOT.y + Math.cos(rad) * claw.len,
  };
}

function dropClaw() {
  if (mode !== 'play' || claw.state !== 'swing') return;
  claw.state = 'drop';
  claw.busy = 0;
  minerPose = 'down';
  playSfx('drop', 0.45); // one-shot; no mid-drop retrigger (was stacking)
  hintAlpha = 0;
}

function useDynamite() {
  if (mode !== 'play' || stick < 1) return;
  if (claw.state !== 'pull' || !claw.caught) return;
  if (dynToss) return; // one toss at a time
  stick--;
  stopPant();
  // SWF: miner.m.gotoAndPlay("throw") → frames 31–33; boom waits until stick hits claw
  minerPose = 'throw';
  minerAnim = 31;
  throwTimer = 3 / FPS; // visual fallback for throw1/2/3 (~frames 31–33 @18fps)
  dynToss = {
    phase: 'throw', // then 'fly' after frame 34 trigger
    frame: 31,      // DefineSprite_238
    x: PIVOT.x,
    y: PIVOT.y + 8,
  };
  playSfx('throw', 0.5);
  // boom / destroy deferred to detonateDynamite() when stick reaches claw
}

function detonateDynamite() {
  const tip = clawTip();
  boomFx = { x: tip.x, y: tip.y, life: 0.45 };
  if (claw.caught) {
    claw.caught.alive = false;
    claw.caught = null;
  }
  claw.price = 0;
  claw.weight = 0;
  claw.stickBonus = 1;
  dynToss = null;
  throwTimer = 0;
  if (claw.state === 'pull') {
    minerPose = 'up';
    minerAnim = 1;
  }
  playSfx('boom', 0.7);
  // If rope already reeled in during flight, finish empty pull now
  if (claw.state === 'pull' && claw.len <= LEN_MIN) {
    finishPull();
    if (timeLeft <= 0) endLevel();
  }
}

function advanceDynamiteToss() {
  if (!dynToss) return;
  const tip = clawTip();
  if (dynToss.phase === 'throw') {
    // Sprite 238: 31,32,33 = throw poses; 34 starts stick flight; 35 → pull loop
    dynToss.frame++;
    minerAnim = dynToss.frame;
    if (dynToss.frame === 34) {
      dynToss.phase = 'fly';
      dynToss.x = PIVOT.x;
      dynToss.y = PIVOT.y + 10;
      // SWF frame_34: _root.C.cl.d.gotoAndStop(2)
    } else if (dynToss.frame >= 35) {
      // SWF frame_35: gotoAndPlay(1) — back to pull while stick still flies
      minerPose = 'pull';
      minerAnim = 1;
      throwTimer = 0;
    }
    return;
  }
  // During fly, miner already on pull loop (after frame 35)
  if (minerPose === 'throw') {
    minerPose = 'pull';
    minerAnim = 1;
    throwTimer = 0;
  }
  // DefineSprite_255/250: lerp 50% toward claw each enterFrame, boom on hitTest
  dynToss.x += (tip.x - dynToss.x) * 0.5;
  dynToss.y += (tip.y - dynToss.y) * 0.5;
  const dx = dynToss.x - tip.x;
  const dy = dynToss.y - tip.y;
  // hit when near tip (SWF hitTest claw.box ≈ tip AABB)
  if (dx * dx + dy * dy <= (TIP_HALF * 2.5) * (TIP_HALF * 2.5)) {
    detonateDynamite();
  }
}

function grabItem(it) {
  claw.busy = 1;
  claw.state = 'pull';
  claw.caught = it;
  claw.price = it.price;
  claw.weight = it.weight;
  claw.stickBonus = (it.weight === -1) ? 1 : 0;
  if (it.weight === -1) claw.weight = 0;
  it.alive = false;
  minerPose = 'pull';
  minerAnim = 1;
  throwTimer = 0; // never inherit throw pose from a prior dynamite toss
  dynToss = null;
  stopPant();
  playSfx('hit', 0.5);
  playSfx('grab', 0.35);
  // SWF 281 hitTest → T.gotoAndStop(2): TNT bursts where it stood; claw keeps debris (grab_9, $1, w2)
  if (it.def && it.def.tnt) explodeTnt(it);
}

function explodeTnt(it) {
  it.alive = false;
  explosions.push({ x: it.baseX != null ? it.baseX : it.x, y: it.y, sx: it.sx || 1, sy: it.sy || 1, f: 1 });
  playSfx('boom', 0.75);
}

/** Per-frame: advance explosion clips; blast box live on clip frames 9–13 (chain-reacts TNT). */
function advanceExplosions() {
  if (!explosions.length) return;
  const fresh = [];
  for (const ex of explosions) {
    ex.f++;
    if (ex.f >= TNT_BLAST.frameOn && ex.f <= TNT_BLAST.frameOff) {
      const ax = Math.abs(ex.sx), ay = Math.abs(ex.sy);
      const bx = ex.x + TNT_BLAST.ox * ex.sx, by = ex.y + TNT_BLAST.oy * ex.sy;
      const bhx = TNT_BLAST.hx * ax, bhy = TNT_BLAST.hy * ay;
      for (const it of items) {
        if (!it.alive || it === claw.caught) continue;
        // item .ob.box AABB in stage px (ITEM_BOX × ob clip scale)
        const ob = it.obScale || OB_SCALE;
        const cx = it.x + (it.boxOx || 0) * ob, cy = it.y + (it.boxOy || 0) * ob;
        const hx = (it.boxHx || it.r * 0.7) * ob, hy = (it.boxHy || it.r * 0.7) * ob;
        if (Math.abs(cx - bx) <= bhx + hx && Math.abs(cy - by) <= bhy + hy) {
          if (it.def && it.def.tnt) {
            it.alive = false;
            fresh.push({ x: it.baseX != null ? it.baseX : it.x, y: it.y, sx: it.sx || 1, sy: it.sy || 1, f: 1 });
          } else {
            it.alive = false;
          }
        }
      }
    }
  }
  explosions = explosions.filter(ex => ex.f <= TNT_BLAST.frames);
  if (fresh.length) {
    explosions.push(...fresh);
    playSfx('boom', 0.75);
  }
}

function finishPull() {
  stopPant();
  const price = claw.price;
  claw.state = 'swing';
  claw.len = LEN_MIN;
  claw.caught = null;
  claw.busy = 0;
  claw.stickBonus = 0;
  minerPose = 'idle';
  if (price === 'power') {
    strengthFlag = 1;
    floatTexts.push({ x: PIVOT.x, y: PIVOT.y + 36, t: '力气↑', life: 1.2 });
    playSfx('score');
  } else if (price === 'dynamite') {
    stick++;
    floatTexts.push({ x: PIVOT.x, y: PIVOT.y + 36, t: '炸药+1', life: 1.2 });
    playSfx('score');
  } else if (typeof price === 'number' && price > 0) {
    score += price;
    floatTexts.push({ x: PIVOT.x, y: PIVOT.y + 36, t: '$' + price, life: 1.2 });
    playSfx('money');
    playSfx('score', 0.4);
  } else {
    playSfx('click', 0.35);
  }
}

function endLevel() {
  strengthFlag = 0;
  rockBonus = 0; diamondBonus = 0; cloverBonus = 0;
  strengthBoost = 0;
  minerStrength = BASE_STRENGTH;
  resultOk = score >= goal;
  mode = 'result';
  syncPadsVisibility();
  playSfx(resultOk ? 'win' : 'tick');
}

function buildShop() {
  shopItems = [];
  shopBought = 0;
  shopFace = 'idle';
  shopExitTimer = 0;
  if (stick < 5) {
    const price = (Math.random() * 300 | 0) + 1 + level * 2;
    shopItems.push({ id: 'dyn', name: '炸药', desc: '抓到重物时可按↑炸掉，节省时间。', price, buy() { stick++; } });
  }
  if ((Math.random() * 10 | 0) + 1 < 5) {
    const price = (Math.random() * (level * 50) | 0) + 1 + level * 2;
    shopItems.push({ id: 'str', name: '生力水', desc: '下一关力气+2，拉得更快。', price, buy() { strengthBoost = 2; } });
  }
  if ((Math.random() * 10 | 0) + 1 < 6) {
    const price = (Math.random() * (level * 100) | 0) + 1 + 200;
    shopItems.push({ id: 'clover', name: '幸运草', desc: '下一关从色袋中更容易开到好东西。', price, buy() { cloverBonus = 1; } });
  }
  if ((Math.random() * 10 | 0) + 1 < 5) {
    const price = (Math.random() * 300 | 0) + 100;
    shopItems.push({ id: 'rock', name: '石头收藏书', desc: '下一关石头更值钱。', price, buy() { rockBonus = 1; } });
  }
  if ((Math.random() * 10 | 0) + 1 >= 7) {
    const price = (Math.random() * 150 | 0) + 1;
    shopItems.push({ id: 'dia', name: '优质钻石', desc: '下一关钻石相当值钱。', price, buy() { diamondBonus = 1; } });
  }
  shopItems.sort(() => Math.random() - 0.5);
  shopItems = shopItems.slice(0, 4);
  shopSel = -1;
  mode = 'shop';
  syncPadsVisibility();
}

function leaveShop() {
  if (shopExitTimer > 0) return;
  // SWF DefineButton2_78: bought==0 → angry (frame 26), else happy (frame 19)
  shopFace = shopBought ? 'happy' : 'angry';
  shopExitTimer = 0.85;
  playSfx(shopBought ? 'money' : 'tick', 0.4);
}

function nextLevel() {
  if (levelDis < MAX_LEVEL) goalAddOn += 270;
  goal += goalAddOn;
  levelDis += 1;
  level += 1;
  if (level > MAX_LEVEL) { mode = 'win'; syncPadsVisibility(); return; }
  showGoal();
}

// ----- Fixed 18fps logic step (matches SWF timeline) -----
function logicStep() {
  const dt = 1 / FPS;
  if (mode !== 'play') {
    if (throwTimer > 0) throwTimer -= dt;
    if (boomFx) { boomFx.life -= dt; if (boomFx.life <= 0) boomFx = null; }
    return;
  }

  if (throwTimer > 0) {
    throwTimer -= dt;
    // do not force pose here while dynToss owns throw→fly timing
    if (throwTimer <= 0 && !dynToss && claw.state === 'pull' && minerPose === 'throw') minerPose = 'up';
  }
  if (boomFx) { boomFx.life -= dt; if (boomFx.life <= 0) boomFx = null; }
  advanceDynamiteToss();
  for (const it of items) if (it.alive && it.walker) advanceMouse(it);
  advanceExplosions();

  // timer ~1s per SWF sprite 188 tick
  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    if (claw.state === 'swing') endLevel();
  }

  if (claw.state === 'swing') {
    claw.swingFrame = (claw.swingFrame + 1) % SWING.length;
    claw.angleDeg = SWING[claw.swingFrame];
    minerPose = 'idle';
  } else if (claw.state === 'drop') {
    // Sub-step ≤1 px along the rope so thin edges can't be tunnelled through.
    const from = claw.len, to = claw.len + DROP_PX_PER_FRAME;
    const steps = Math.ceil(DROP_PX_PER_FRAME / 1);
    let hit = null;
    for (let k = 1; k <= steps && !hit; k++) {
      const L = from + (to - from) * k / steps;
      if (L >= LEN_MAX) break;
      const rr = claw.angleDeg * Math.PI / 180;
      const ty = PIVOT.y + Math.cos(rr) * L, tx = PIVOT.x - Math.sin(rr) * L;
      if (ty > H - 6 || tx < 6 || tx > W - 6) break;
      hit = clawHitAt(L, claw.angleDeg);
      if (hit) claw.len = L;
    }
    if (!hit) claw.len = to;
    const tip = clawTip();
    if (hit) {
      grabItem(hit);
    } else if (tip.y > H - 6 || tip.x < 6 || tip.x > W - 6 || claw.len >= LEN_MAX) {
      claw.state = 'pull';
      claw.caught = null;
      claw.price = 0;
      claw.weight = 0;
      claw.stickBonus = 1; // empty return is fast (SWF stickBonus path)
      minerPose = 'up';
    }
  } else if (claw.state === 'pull') {
    let step;
    if (claw.stickBonus || strengthFlag) step = 15;
    else step = Math.max(1, effectiveStrength() - (claw.weight || 0));
    claw.len -= step * PULL_PX_PER_FRAME;
    if (claw.caught) {
      const tip = clawTip();
      const meta = GRAB_LOGICAL[claw.caught.object];
      claw.caught.x = tip.x;
      // Approx item center under grab composite (below hinge)
      claw.caught.y = tip.y + (meta ? meta.h * 0.55 : Math.max(10, claw.caught.r));
    }
    // SWF miner.gotoAndStop("up") → sprite 238 frames 1–20 loop (frame_20 → 1).
    // Frames 31–33 are the "throw" label (dynamite); never play them while pulling.
    if (minerPose !== 'throw') {
      minerPose = 'pull';
      minerAnim = (minerAnim % PULL_FRAME_MAX) + 1;
    }
    // Heavy pull (weight>1 and not fast path): pant like original effort
    const heavy = claw.caught && !claw.stickBonus && !strengthFlag && (claw.weight || 0) > 1;
    if (heavy) {
      pantCool -= dt;
      if (pantCool <= 0) {
        playSfx('pant', 0.42); // exclusive + debounced; restarts cleanly
        const pd = audioBuffers.pant ? audioBuffers.pant.duration : 0.71;
        pantCool = pd + 0.04; // no overlap with previous pant
      }
    } else {
      stopPant();
    }
    if (claw.len <= LEN_MIN) {
      claw.len = LEN_MIN;
      // Wait for in-flight dynamite so item does not score before boom
      if (dynToss && claw.caught) {
        /* hold at top until detonateDynamite */
      } else {
        finishPull(); // stopPant inside
        if (timeLeft <= 0) endLevel();
      }
    }
  }
  hintAlpha = Math.max(0, hintAlpha - dt * 0.25);
}

function update(dt) {
  if (shellHold || debugOpen) return; // modal pauses the game
  if (mode === 'shop' && shopExitTimer > 0) {
    shopExitTimer -= dt;
    if (shopExitTimer <= 0) {
      shopExitTimer = 0;
      nextLevel();
    }
  }
  logicAcc += dt;
  const step = 1 / FPS;
  let guard = 0;
  while (logicAcc >= step && guard++ < 5) {
    logicAcc -= step;
    logicStep();
  }
  for (const f of floatTexts) f.life -= dt;
  floatTexts = floatTexts.filter(f => f.life > 0);
}

// ----- Draw -----
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPlayBg() {
  if (images.playBg) ctx.drawImage(images.playBg, 0, 0, W, H);
  else {
    ctx.fillStyle = '#87b7e0'; ctx.fillRect(0, 0, W, 95);
    ctx.fillStyle = '#4a2e18'; ctx.fillRect(0, 95, W, H - 95);
    ctx.fillStyle = '#3d7a2a'; ctx.fillRect(0, 88, W, 12);
  }
}

function drawHUD() {
  // Original SWF: yellow top bar with 金钱/目标钱数 left, 时间/第N关 right
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px "Microsoft YaHei","PingFang SC",sans-serif';
  ctx.fillStyle = '#4a2e0a';
  ctx.fillText('金钱：', 12, 24);
  ctx.fillStyle = '#1dbd2a';
  ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
  ctx.fillText('$' + score, 58, 25);
  ctx.fillStyle = '#4a2e0a';
  ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
  ctx.fillText('目标钱数：', 12, 48);
  ctx.fillStyle = '#6b3f12';
  ctx.fillText('$' + goal, 88, 48);

  ctx.fillStyle = '#4a2e0a';
  ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
  ctx.fillText('时间：', W - 118, 24);
  ctx.fillStyle = timeLeft <= 10 ? '#e23a2a' : '#e07020';
  ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
  ctx.fillText(String(Math.ceil(timeLeft)), W - 72, 25);
  ctx.fillStyle = '#4a2e0a';
  ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
  ctx.fillText('第', W - 118, 48);
  ctx.fillStyle = '#e07020';
  ctx.font = 'bold 15px "Microsoft YaHei",sans-serif';
  ctx.fillText(String(levelDis), W - 96, 48);
  ctx.fillStyle = '#4a2e0a';
  ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
  ctx.fillText('关', W - 78, 48);

  // exit-level chip (visual only / tap returns to title)
  ctx.fillStyle = '#f0c040';
  roundRect(W - 200, 8, 56, 28, 6); ctx.fill();
  ctx.strokeStyle = '#a07820'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#5a3a10';
  ctx.font = '11px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('退出', W - 172, 20);
  ctx.fillText('本关', W - 172, 32);
  ctx.textAlign = 'left';

  if (stick > 0) {
    ctx.fillStyle = 'rgba(80,40,10,0.55)';
    roundRect(W - 200, 42, 56, 20, 5); ctx.fill();
    ctx.fillStyle = '#fff3c0';
    ctx.font = '11px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('炸药×' + stick, W - 172, 56);
    ctx.textAlign = 'left';
  }
}

function drawMiner() {
  let im = images.minerIdle;
  if (minerPose === 'down') im = images.minerDown || im;
  else if (minerPose === 'throw' || (dynToss && dynToss.phase === 'throw')) {
    // Sprite 238 frames 31–33 → throw1/2/3
    const f = (dynToss && dynToss.frame) || 31;
    const key = f <= 31 ? 'minerThrow1' : f === 32 ? 'minerThrow2' : 'minerThrow3';
    im = images[key] || images.minerPull || im;
  } else if (minerPose === 'pull' || minerPose === 'up') {
    const frame = ((minerAnim - 1) % PULL_FRAME_MAX) + 1;
    im = images['minerPull' + frame] || images.minerPull || images.minerUp || im;
  }
  if (!im) return;
  // All DefineSprite_238 frames are 139×144 — fixed stage size prevents flicker
  const mw = MINER_NATIVE.w * MINER_DRAW_SCALE;
  const mh = MINER_NATIVE.h * MINER_DRAW_SCALE;
  const x = MINER_POS.x - mw / 2;
  const y = Math.max(2, MINER_POS.y - mh * 0.42);
  ctx.drawImage(im, x, y, mw, mh);
}

function drawClaw() {
  const tip = clawTip();
  // rope to claw hinge (SWF tip/claw registration ≈ rope end)
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(PIVOT.x, PIVOT.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(PIVOT.x + 0.5, PIVOT.y);
  ctx.lineTo(tip.x + 0.5, tip.y);
  ctx.stroke();

  // SWF: claw.gotoAndStop(object) shows grab composite (claw+item baked).
  // Align composite hinge to rope tip — do not scale to item size (that
  // blew up the baked rope stub and floated the item under the tips).
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(claw.angleDeg * Math.PI / 180);

  const objId = claw.caught ? claw.caught.object : 0;
  const grabIm = objId ? images['grab_' + objId] : null;
  const grabMeta = objId ? GRAB_LOGICAL[objId] : null;

  if (claw.caught && grabIm && grabMeta) {
    const { w: gw, h: gh, hingeY: ghy, ox } = grabMeta;
    ctx.drawImage(grabIm, -gw / 2 + (ox || 0), -ghy, gw, gh);
  } else {
    let hk = images.hookOpen;
    let nw = HOOK_OPEN_NATIVE.w, nh = HOOK_OPEN_NATIVE.h;
    const hingeY = HOOK_OPEN_HINGE;
    if (claw.state === 'pull') hk = images.hookClosed || images.hookOpen;
    if (hk) {
      ctx.drawImage(hk, -nw / 2, -hingeY, nw, nh);
    } else {
      ctx.strokeStyle = '#9aa0a6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, 1); ctx.quadraticCurveTo(-11, 12, -3, 14);
      ctx.moveTo(8, 1); ctx.quadraticCurveTo(11, 12, 3, 14);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Flying dynamite stick along rope (SWF DefineSprite_250 after frame 34)
  if (dynToss && dynToss.phase === 'fly') {
    const tip2 = tip;
    const ang = Math.atan2(tip2.y - dynToss.y, tip2.x - dynToss.x);
    const stickIm = images.dynStick || images.shopDyn;
    ctx.save();
    ctx.translate(dynToss.x, dynToss.y);
    ctx.rotate(ang + Math.PI / 2);
    if (stickIm) {
      const sw = stickIm === images.dynStick ? 8 : 14;
      const sh = stickIm === images.dynStick ? 36 : 18;
      ctx.drawImage(stickIm, -sw / 2, -sh / 2, sw, sh);
    } else {
      ctx.fillStyle = '#c62828';
      ctx.fillRect(-2, -10, 4, 20);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-1, -10, 2, 4);
    }
    ctx.restore();
  }

  if (boomFx) {
    const a = Math.max(0, boomFx.life / 0.45);
    const boomIm = images.dynBoom;
    if (boomIm) {
      ctx.globalAlpha = a;
      const s = 28 + (1 - a) * 36;
      ctx.drawImage(boomIm, boomFx.x - s / 2, boomFx.y - s / 2, s, s);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ff8844';
      ctx.beginPath();
      ctx.arc(boomFx.x, boomFx.y, 18 + (1 - a) * 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath();
      ctx.arc(boomFx.x, boomFx.y, 8 + (1 - a) * 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawItems() {
  for (const it of items) {
    if (!it.alive) continue;
    if (claw.caught === it) continue; // drawn nested under claw in drawClaw
    if (it.walker) { drawMouse(it); continue; }
    const im = images[it.key];
    if (im) {
      const s = it.r * 2.15;
      ctx.drawImage(im, it.x - s / 2, it.y - s / 2, s, s * (im.height / im.width));
    } else {
      ctx.fillStyle = '#daa520';
      ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** Mouse / diamond mouse: SWF walker clip (271/275) at its tweened X, mirrored per facing. */
function drawMouse(it) {
  const dia = it.key === 'diamond_m';
  const im = images[(dia ? 'mouseDia_' : 'mouse_') + (it.anim || 1)];
  const k = it.sx * OB_SCALE, ky = Math.abs(it.sy) * OB_SCALE;
  ctx.save();
  ctx.translate(it.baseX, it.y);
  ctx.scale(k, ky);
  ctx.translate(it.walkX, MOUSE_Y);
  ctx.scale(it.face || 1, 1);
  if (im) {
    const b = MOUSE_BOUNDS[dia ? 'mouseDia' : 'mouse'];
    ctx.drawImage(im, b[0], b[1], b[2], b[3]);
  } else {
    const st = images[it.key];
    if (st) {
      const w = 46, h = w * st.height / st.width;
      ctx.drawImage(st, -w / 2, -h / 2, w, h);
    }
  }
  ctx.restore();
}

function drawExplosions() {
  for (const ex of explosions) {
    const im = images['tntBoom' + Math.min(14, Math.max(1, ex.f))];
    if (!im) continue;
    const b = TNT_FX.bounds;
    ctx.save();
    ctx.translate(ex.x, ex.y);
    ctx.scale(ex.sx, ex.sy);
    ctx.translate(TNT_FX.x, TNT_FX.y);
    ctx.scale(TNT_FX.s, TNT_FX.s);
    ctx.drawImage(im, b[0], b[1], b[2], b[3]);
    ctx.restore();
  }
}

function drawTitle() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (images.titleScreen) {
    ctx.drawImage(images.titleScreen, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#f5d76e';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('开始', 100, 160);
  }
}

function drawGoal() {
  if (images.goalSplash) ctx.drawImage(images.goalSplash, 0, 0, W, H);
  else {
    ctx.fillStyle = '#1a0a00'; ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = '#22cc33';
  ctx.font = 'bold 40px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeText('$' + goal, W / 2, 240);
  ctx.fillText('$' + goal, W / 2, 240);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(W / 2 - 110, 300, 220, 28, 8); ctx.fill();
  ctx.fillStyle = '#fff8d0';
  ctx.font = '14px "Microsoft YaHei",sans-serif';
  ctx.fillText(isTouch ? '点屏幕继续' : '点击或按 Enter 继续', W / 2, 320);
  ctx.textAlign = 'left';
}

function drawShop() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  // Face: idle shopkeeper; after buy → happy; leaving without buy → angry (SWF frames 19/26)
  let bg = images.shopBg;
  if (shopFace === 'happy') bg = images.shopBgHappy || bg;
  else if (shopFace === 'angry') bg = images.shopBgAngry || bg;
  if (bg) {
    // panels are ~550×347 — pin to bottom like original
    const bh = Math.min(H, bg.height * (W / bg.width));
    ctx.drawImage(bg, 0, H - bh, W, bh);
  }

  // money / tip banner (left) — one clear continue button on the right
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  roundRect(16, 10, W - 160, 70, 8); ctx.fill();
  ctx.strokeStyle = '#e0b84a'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#ffe9a0';
  ctx.font = 'bold 15px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('金钱 $' + score + '　　炸药 ×' + stick, 28, 34);
  ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#ddd';
  const sel = shopItems[shopSel];
  let tip = '点击下面的物品即可买卖，买好后点下一关';
  if (shopFace === 'happy' && shopExitTimer > 0) tip = '谢谢惠顾！下一关见～';
  else if (shopFace === 'angry' && shopExitTimer > 0) tip = '……一件都不买就走？哼。';
  else if (sel) tip = sel.name + ' $' + sel.price + ' — ' + sel.desc;
  wrapText(tip, 28, 54, W - 200, 16);

  // Single next-level button (SWF DefineButton2_78)
  const nb = { x: W - 140, y: 14, w: 124, h: 42 };
  if (images.shopNext) {
    ctx.drawImage(images.shopNext, nb.x, nb.y, nb.w, nb.h);
  } else {
    ctx.fillStyle = '#1a6b2a';
    roundRect(nb.x, nb.y, nb.w, nb.h, 6); ctx.fill();
    ctx.strokeStyle = '#3dff6a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('下一关', nb.x + nb.w / 2, nb.y + 28);
  }
  ctx.textAlign = 'left';

  if (shopExitTimer > 0) return; // freeze item shelf while face plays

  const iconKey = { dyn: 'shopDyn', str: 'shopStr', clover: 'shopClover', rock: 'shopRock', dia: 'shopDia' };
  shopItems.forEach((it, i) => {
    const x = 30 + i * 120, y = H - 150;
    ctx.fillStyle = score >= it.price ? 'rgba(90,60,25,0.85)' : 'rgba(40,40,40,0.75)';
    roundRect(x, y, 105, 100, 10); ctx.fill();
    ctx.strokeStyle = shopSel === i ? '#fff36a' : '#f5d76e';
    ctx.lineWidth = shopSel === i ? 2.5 : 1.2;
    ctx.stroke();
    const ik = images[iconKey[it.id]];
    if (ik) {
      const iw = 48, ih = iw * ik.height / ik.width;
      ctx.drawImage(ik, x + (105 - iw) / 2, y + 8, iw, ih);
    }
    ctx.fillStyle = '#ffe9a0';
    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(it.name, x + 52, y + 72);
    ctx.fillText('$' + it.price, x + 52, y + 90);
    ctx.textAlign = 'left';
  });
}

function wrapText(text, x, y, maxW, lineH) {
  const chars = text.split('');
  let line = '';
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, x, y);
      line = ch; y += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

function drawResult() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1a1208';
  roundRect(80, 100, W - 160, 200, 12); ctx.fill();
  ctx.strokeStyle = '#f5d76e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffe9a0';
  ctx.font = 'bold 28px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(resultOk ? '过关！' : '未达到目标', W / 2, 150);
  ctx.font = '18px sans-serif';
  ctx.fillText('金钱 $' + score + ' / 目标 $' + goal, W / 2, 190);
  ctx.fillStyle = '#2e8b57';
  roundRect(W / 2 - 70, 230, 140, 40, 8); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(resultOk ? '去商店' : '再试一次', W / 2, 256);
  ctx.textAlign = 'left';
}

function drawWin() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f5d76e';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('恭喜通关！', W / 2, 160);
  ctx.font = '20px sans-serif';
  ctx.fillText('共获得 $' + score, W / 2, 210);
  ctx.fillStyle = '#2e8b57';
  roundRect(W / 2 - 70, 250, 140, 40, 8); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText('再来一局', W / 2, 276);
  ctx.textAlign = 'left';
}

function drawTouchControls() {
  // Pads are HTML in letterbox; only a brief on-canvas hint remains
  refreshPadState();
  if (!padsEnabled || mode !== 'play') return;
  if (hintAlpha > 0 && claw.state === 'swing') {
    ctx.globalAlpha = Math.min(1, hintAlpha);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('点右下「放钩」或屏幕放钩子', W / 2, H - 24);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

function drawFloats() {
  for (const f of floatTexts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = '#ffe66d';
    ctx.font = 'bold 22px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3;
    const y = f.y - (1.2 - f.life) * 34;
    ctx.strokeText(f.t, f.x, y);
    ctx.fillText(f.t, f.x, y);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

function render() {
  if (mode === 'title') drawTitle();
  else if (mode === 'goal') drawGoal();
  else if (mode === 'shop') drawShop();
  else if (mode === 'result') { drawPlayBg(); drawMiner(); drawHUD(); drawResult(); }
  else if (mode === 'win') drawWin();
  else {
    drawPlayBg();
    drawItems();
    drawExplosions();
    drawClaw();
    drawHitShapes();
    drawMiner();
    drawHUD();
    drawFloats();
    drawTouchControls();
  }
}

// ----- Debug level jump (bottom-right chip inside the canvas) -----
const dbgBtn = document.getElementById('dbgBtn');
const dbgModal = document.getElementById('dbgModal');
const dbgLv = document.getElementById('dbgLv');
const dbgVar = document.getElementById('dbgVar');
const dbgGoalEl = document.getElementById('dbgGoal');
let debugOpen = false;
let dbgPickLv = 1, dbgPickVar = 0;
/** Goal/goalAddOn for level n (L1 goal 650, addOn 275, +270 per level through MAX_LEVEL). */
function goalForLevel(n) {
  let add = 275, g = 375 + add;
  for (let k = 2; k <= n; k++) { add += 270; g += add; }
  return { goal: g, goalAddOn: add };
}
function layoutDebugBtn() {
  if (!dbgBtn) return;
  const r = canvas.getBoundingClientRect();
  const bw = dbgBtn.offsetWidth || 48, bh = dbgBtn.offsetHeight || 20;
  const inset = Math.max(4, Math.round(r.width * 0.008));
  dbgBtn.style.left = Math.round(r.right - bw - inset) + 'px';
  dbgBtn.style.top = Math.round(r.bottom - bh - inset) + 'px';
}
function syncDebugBtn() {
  if (!dbgBtn) return;
  dbgBtn.classList.toggle('on', !debugOpen && document.getElementById('load').classList.contains('hide'));
  layoutDebugBtn();
}
function renderDebugPicker() {
  dbgLv.querySelectorAll('button').forEach(b => b.classList.toggle('sel', +b.dataset.lv === dbgPickLv));
  dbgVar.querySelectorAll('button').forEach(b => b.classList.toggle('sel', +b.dataset.v === dbgPickVar));
  const g = goalForLevel(dbgPickLv);
  const n = dbgPickVar ? ((GM_LEVELS['L' + dbgPickLv + '_' + dbgPickVar] || []).length) : 0;
  dbgGoalEl.textContent = '第 ' + dbgPickLv + ' 关 · 目标 $' + g.goal + (n ? ' · ' + n + ' 个物品' : '');
}
function openDebug() {
  debugOpen = true;
  dbgPickLv = Math.min(MAX_LEVEL, Math.max(1, level || 1));
  renderDebugPicker();
  dbgModal.classList.add('on');
  dbgModal.setAttribute('aria-hidden', 'false');
  syncDebugBtn();
}
function closeDebug() {
  debugOpen = false;
  dbgModal.classList.remove('on');
  dbgModal.setAttribute('aria-hidden', 'true');
  lastTs = 0; logicAcc = 0;
  syncDebugBtn();
}
function debugJump(lv, variant) {
  lv = Math.min(MAX_LEVEL, Math.max(1, lv | 0));
  if (mode === 'title' || mode === 'win') {
    score = 0; stick = 0;
    rockBonus = 0; diamondBonus = 0; cloverBonus = 0; strengthBoost = 0;
  }
  minerStrength = BASE_STRENGTH;
  strengthFlag = 0;
  const g = goalForLevel(lv);
  level = lv; levelDis = lv;
  goal = g.goal; goalAddOn = g.goalAddOn;
  forcedVariant = variant | 0;
  stopPant();
  dynToss = null; boomFx = null; explosions = [];
  shopExitTimer = 0;
  showGoal();
}
if (dbgLv) {
  for (let i = 1; i <= MAX_LEVEL; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.lv = String(i); b.textContent = String(i);
    dbgLv.appendChild(b);
  }
  const stop = (e) => { e.stopPropagation(); };
  dbgModal.addEventListener('mousedown', stop);
  dbgModal.addEventListener('touchstart', stop, { passive: true });
  dbgLv.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    dbgPickLv = +b.dataset.lv; renderDebugPicker();
  });
  dbgVar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    dbgPickVar = +b.dataset.v; renderDebugPicker();
  });
  document.getElementById('dbgGo').addEventListener('click', () => { closeDebug(); debugJump(dbgPickLv, dbgPickVar); });
  document.getElementById('dbgClose').addEventListener('click', closeDebug);
  const hitCb = document.getElementById('dbgHit');
  if (hitCb) {
    try { showHitShapes = localStorage.getItem('gm_hit') === '1'; } catch (e) {}
    hitCb.checked = showHitShapes;
    hitCb.addEventListener('change', () => {
      showHitShapes = hitCb.checked;
      try { localStorage.setItem('gm_hit', showHitShapes ? '1' : '0'); } catch (e) {}
    });
  }
  dbgModal.addEventListener('click', (e) => { if (e.target === dbgModal) closeDebug(); });
  dbgBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
  dbgBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); unlockAudio(); openDebug(); });
  addEventListener('resize', layoutDebugBtn);
  addEventListener('orientationchange', () => setTimeout(layoutDebugBtn, 80));
}

// ----- Input -----
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - r.left) * (W / r.width),
    y: (src.clientY - r.top) * (H / r.height),
  };
}

function onPointer(e) {
  unlockAudio();
  const p = canvasPos(e);
  if (mode === 'title') {
    // gold nugget start region (upper-left)
    if (p.x > 30 && p.x < 290 && p.y > 20 && p.y < 260) {
      resetRun();
    }
    return;
  }
  if (mode === 'goal') {
    startLevel();
    return;
  }
  if (mode === 'result') {
    if (p.y > 220 && p.y < 280 && p.x > W / 2 - 80 && p.x < W / 2 + 80) {
      if (resultOk) buildShop();
      else resetRun();
    }
    return;
  }
  if (mode === 'win') {
    if (p.y > 240 && p.y < 300) resetRun();
    return;
  }
  if (mode === 'shop') {
    if (shopExitTimer > 0) return;
    if (p.x > W - 148 && p.y < 64) { leaveShop(); return; }
    shopItems.forEach((it, i) => {
      const x = 30 + i * 120, y = H - 150;
      if (p.x > x && p.x < x + 105 && p.y > y && p.y < y + 100) {
        shopSel = i;
        if (score >= it.price) {
          score -= it.price;
          it.buy();
          shopBought = 1;
          shopFace = 'happy';
          shopItems.splice(i, 1);
          playSfx('money');
        }
      }
    });
    return;
  }
  if (mode === 'play') {
    if (p.x > W - 200 && p.x < W - 144 && p.y > 6 && p.y < 38) {
      mode = 'title';
      syncPadsVisibility();
      return;
    }
    dropClaw();
  }
}

function bindPad(el, fn) {
  if (!el) return;
  const fire = (e) => {
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    fn();
    refreshPadState();
  };
  el.addEventListener('pointerdown', fire);
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
}
bindPad(btnDrop, () => { if (mode === 'play') dropClaw(); });
bindPad(btnDyn, () => { if (mode === 'play') useDynamite(); });

canvas.addEventListener('mousedown', onPointer);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointer(e); }, { passive: false });
// Extra unlock path for browsers that suspend AudioContext until gesture
['pointerdown', 'touchstart', 'keydown'].forEach((ev) => {
  addEventListener(ev, unlockAudio, { once: true, passive: true });
});

addEventListener('keydown', (e) => {
  unlockAudio();
  if (debugOpen) {
    if (e.code === 'Escape') closeDebug();
    if (e.code === 'Enter') { closeDebug(); debugJump(dbgPickLv, dbgPickVar); }
    return;
  }
  if (e.code === 'ArrowDown' || e.code === 'Space') { e.preventDefault(); dropClaw(); }
  if (e.code === 'ArrowUp' || e.code === 'KeyD') { e.preventDefault(); useDynamite(); }
  // ←/→ force pull-up like SWF
  if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && claw.state === 'drop') {
    e.preventDefault();
    claw.state = 'pull';
    claw.caught = null;
    claw.price = 0;
    claw.weight = 0;
    claw.stickBonus = 1;
    minerPose = 'up';
  }
  if (e.code === 'Enter' && mode === 'title') resetRun();
  if (e.code === 'Enter' && mode === 'goal') startLevel();
  if (e.code === 'Enter' && mode === 'shop') leaveShop();
});

function frame(ts) {
  if (!lastTs) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (dt > 0.08) dt = 0.08;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

(async function boot() {
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const use2x = dpr >= 1.5;
    const use3x = dpr >= 2.5;
    // Phase 1: title only → playable shell
    const titleList = use3x ? TITLE_PACK_3X : (use2x ? TITLE_PACK_2X : TITLE_PACK);
    for (const [k, u] of titleList) {
      try { await loadImage(k, u); } catch (e) {
        try { if (use3x) await loadImage(k, TITLE_PACK_2X[0][1]);
        else if (use2x) await loadImage(k, TITLE_PACK[0][1]); } catch (e2) {
          await loadImage(k, TITLE_PACK[0][1]);
        }
      }
    }
    setLoad(0.12);
    document.getElementById('load').classList.add('hide');
    syncDebugBtn();
    requestAnimationFrame(frame);

    // Phase 2: critical play (bg + miner idle + hook + shop)
    const critical = new Set(['playBg','goalSplash','shopBg','shopBgHappy','shopBgAngry','shopNext',
      'minerIdle','minerDown','minerPull','minerUp','minerThrow1','minerThrow2','minerThrow3',
      'hookOpen','hookClosed','grab_2','grab_3','grab_4','grab_5','grab_6','grab_7','grab_8','grab_9','grab_10','grab_11','grab_12','grab_13','grab_14']);
    const phase2 = PLAY_PACK.filter(([k]) => critical.has(k) || k.startsWith('gold_') || k.startsWith('rock_') || k.startsWith('diamond_') || ['bag','bone','pig','skull','tnt'].includes(k) || k.startsWith('mouse') || k.startsWith('shop'));
    const phase3 = PLAY_PACK.filter(([k]) => !phase2.find(p => p[0] === k));

    let done = 0;
    const total = phase2.length + phase3.length + SFX_NAMES.length;
    await loadPack(phase2, use2x ? PLAY_PACK_2X : null, (p) => {
      done = Math.floor(p * phase2.length);
      setLoad(0.12 + 0.55 * (done / Math.max(1, phase2.length)));
    }, use3x ? PLAY_PACK_3X : null);
    // Phase 3: pull animation frames + remaining
    await loadPack(phase3, use2x ? PLAY_PACK_2X : null, (p) => {
      setLoad(0.67 + 0.2 * p);
    }, use3x ? PLAY_PACK_3X : null);
    ensureAudio();
    await Promise.all(SFX_NAMES.map(loadSfx));
    setLoad(1);
  } catch (err) {
    console.error(err);
    document.getElementById('pct').textContent = '加载出错，请刷新';
  }
})();

dbgBtnReady = true;
window.__GM = { clawHitAt, clawOverlap, itemHitMask, getClawHit, get showHitShapes(){return showHitShapes}, debugJump, goalForLevel, get explosions(){return explosions}, resetRun, dropClaw, useDynamite, layoutPads, detectTouchUI, get mode(){return mode}, get items(){return items}, get claw(){return claw} };


window.addEventListener("message", (ev) => {
  if (ev.origin !== location.origin || !ev.data || ev.data.type !== "arcade") return;
  if (ev.data.action === "suspend") {
    if (shellHold) return;
    shellHold = true;
    try { stopPant(); } catch (e) {}
    if (audioCtx && audioCtx.state === "running") audioCtx.suspend();
  } else if (ev.data.action === "resume") {
    if (!shellHold) return;
    shellHold = false;
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }
});
