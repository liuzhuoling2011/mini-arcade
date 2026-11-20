import {
  createGame,
  bid,
  bidAI,
  play,
  chooseAI,
  moves,
  classify,
  beats,
  rank,
  label,
  sort,
} from "./engine.js";
import { load, save, record } from "./storage.js";
import { TableAudio } from "./audio.js";
const $ = (id) => document.getElementById(id),
  names = ["你", "林间风", "月下客"];
let data = load(),
  s = null,
  selected = new Set(),
  auto = false,
  aiTimer = null,
  epoch = 0,
  round = 0,
  suspended = false,
  parentHold = false,
  modalHold = false,
  activeDifficulty = "normal",
  hintIndex = 0,
  hintKey = "",
  lastSaved = -1,
  celebrationTimer = null;
const audio = new TableAudio(data.settings);
function persist() {
  const ok = save(data);
  if (!ok)
    $("notice").textContent = "浏览器存储不可用，本次战绩仅在当前页面保留";
}
function stats() {
  $("totalScore").textContent = data.score;
  $("record").textContent = `${data.wins} 胜 / ${data.games} 局`;
}
function cardHTML(c) {
  if (c == null)
    return '<div class="card back" aria-label="未揭晓底牌">♠</div>';
  const r = rank(c),
    suit = r >= 16 ? "" : ["♠", "♥", "♣", "♦"][c % 4];
  if (r >= 16)
    return `<span class="joker">${r === 16 ? "小王" : "大王"}</span><span class="center-suit joker-center">✦</span>`;
  return `<span>${label(r)}</span><span class="suit">${suit}</span><span class="center-suit">${suit}</span><span class="mirror">${label(r)} ${suit}</span>`;
}
function makeCard(c, hand = false) {
  const el = document.createElement(hand ? "button" : "div");
  el.className =
    "card" +
    ((c < 52 && (c % 4 === 1 || c % 4 === 3)) || c === 53 ? " red" : "");
  el.innerHTML = cardHTML(c);
  if (hand) {
    el.type = "button";
    el.dataset.id = c;
    el.setAttribute(
      "aria-label",
      rank(c) >= 16
        ? label(rank(c))
        : ["黑桃", "红桃", "梅花", "方块"][c % 4] + label(rank(c)),
    );
    el.setAttribute("aria-pressed", selected.has(c));
    el.classList.toggle("selected", selected.has(c));
  }
  return el;
}
function handRender(deal = false) {
  const root = $("hand");
  root.replaceChildren();
  if (!s) return;
  const cards = sort(s.hands[0]),
    portrait = matchMedia(
      "(max-width:600px) and (orientation:portrait)",
    ).matches;
  const rows = portrait
    ? [
        cards.slice(0, Math.ceil(cards.length / 2)),
        cards.slice(Math.ceil(cards.length / 2)),
      ]
    : [cards];
  let i = 0;
  for (const row of rows) {
    if (!row.length) continue;
    const div = document.createElement("div");
    div.className = "hand-row";
    const cw = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--card-w"),
      ),
      width = root.clientWidth - 4;
    let step = Math.min(cw * 0.64, (width - cw) / Math.max(1, row.length - 1));
    if (portrait)
      step = Math.min(cw * 0.62, (width - cw) / Math.max(1, row.length - 1));
    div.style.setProperty("--overlap", `${step - cw}px`);
    for (const c of row) {
      const el = makeCard(c, true);
      el.style.setProperty("--i", i++);
      div.append(el);
    }
    root.append(div);
  }
  root.classList.toggle("dealing", deal);
  updateControls();
}
function updateControls() {
  const mine = s?.turn === 0 && s?.phase === "play" && !auto && !suspended;
  const chosen = [...selected],
    p = classify(chosen),
    legal = !!(p && beats(p, s?.table));
  $("playButton").disabled = !mine || !legal;
  $("passButton").disabled = !mine || !s.table;
  $("hintButton").disabled = !mine;
  $("clearButton").disabled = !selected.size || !mine;
  $("selectionLabel").textContent = chosen.length
    ? `${chosen.length} 张 · ${p ? p.name : "不是合法牌型"}${p && !legal ? " · 不能压过上家" : ""}`
    : "点选 / 拖扫选牌";
  document.querySelectorAll("[data-bid]").forEach((b) => {
    const v = +b.dataset.bid;
    b.disabled =
      !(s?.phase === "bid" && s.turn === 0 && !auto && !suspended) ||
      (v !== 0 && v <= s.base);
  });
}
function render(deal = false) {
  stats();
  if (!s) {
    $("bottom").innerHTML = Array.from({ length: 3 }, () =>
      cardHTML(null),
    ).join("");
    return;
  }
  const revealed = s.phase === "play" || s.phase === "over";
  for (let i = 0; i < 3; i++) {
    const seat = $("seat" + i);
    seat.classList.toggle("active", s.phase !== "over" && s.turn === i);
    const role = seat.querySelector(".role");
    role.textContent = !revealed
      ? "等待叫分"
      : s.landlord === i
        ? "♛ 地主"
        : "♧ 农民";
    role.classList.toggle("landlord", revealed && s.landlord === i);
    seat.querySelector(".remaining").innerHTML =
      `剩 <b>${s.hands[i].length}</b> 张`;
  }
  const bottomKey = revealed ? s.bottom.join(",") : "hidden";
  if ($("bottom").dataset.key !== bottomKey) {
    $("bottom").dataset.key = bottomKey;
    $("bottom").replaceChildren();
    for (const c of s.bottom) {
      if (!revealed) {
        const e = document.createElement("div");
        e.className = "card back";
        e.textContent = "♠";
        e.setAttribute("aria-label", "未揭晓底牌");
        $("bottom").append(e);
      } else $("bottom").append(makeCard(c));
    }
  }
  $("multiplier").textContent = s.base
    ? `叫分 ${s.base} · ${2 ** s.bombs} 倍${s.bombs ? " · 炸弹 ×" + s.bombs : ""}`
    : "1 / 2 / 3 分 · 轮流叫分";
  const mine = s.turn === 0;
  $("turnLabel").textContent =
    s.phase === "bid"
      ? mine
        ? "轮到你叫分 · 分越高，输赢越大"
        : `${names[s.turn]}正在叫分…`
      : s.phase === "over"
        ? "本局结束 · 再来一局好牌"
        : s.phase === "redeal"
          ? "三家都不叫 · 正在重新洗牌"
          : mine
            ? auto
              ? "托管中 · 点击托管可收回操作"
              : s.table
                ? "轮到你 · 跟牌或不出"
                : "轮到你 · 请领出一手牌"
            : `${names[s.turn]}正在思考…`;
  $("bidActions").hidden = s.phase !== "bid";
  $("playActions").hidden = s.phase === "bid";
  $("autoButton").disabled = !["bid", "play"].includes(s.phase);
  $("autoButton").setAttribute("aria-pressed", auto);
  $("autoButton").textContent = auto ? "取消托管" : "托管";
  handRender(deal);
}
function say(text) {
  $("notice").textContent = text;
}
function celebrate(text) {
  clearTimeout(celebrationTimer);
  const el = $("celebration");
  el.classList.remove("show");
  void el.offsetWidth;
  el.textContent = text;
  el.classList.add("show");
  celebrationTimer = setTimeout(() => el.classList.remove("show"), 1550);
}
function trick(cards, seat, p) {
  const root = $("trick");
  for (const a of root.getAnimations()) a.cancel();
  if (!cards.length) {
    if (
      root.childNodes.length &&
      !matchMedia("(prefers-reduced-motion:reduce)").matches
    ) {
      const version = s.revision,
        token = epoch;
      root
        .animate(
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(.65) translateY(20px)" },
          ],
          { duration: 180 },
        )
        .finished.then(() => {
          if (token === epoch && s.revision === version) root.replaceChildren();
        })
        .catch(() => {});
    } else root.replaceChildren();
    return;
  }
  root.replaceChildren();
  const info = document.createElement("div");
  info.className = "trick-label";
  info.textContent = `${names[seat]} · ${p.name}`;
  root.append(info);
  // Fit long plays as balanced rows without covering either opponent seat.
  const sampleRow = document.createElement("div");
  sampleRow.className = "trick-cards";
  const sample = makeCard(cards[0]);
  sampleRow.append(sample);
  root.append(sampleRow);
  const cardWidth = parseFloat(getComputedStyle(sample).width),
    available = root.clientWidth;
  sampleRow.remove();
  const maxColumns = Math.max(
    1,
    Math.floor((available - cardWidth) / (cardWidth * 0.52)) + 1,
  );
  const columns = Math.ceil(
    cards.length / Math.ceil(cards.length / maxColumns),
  );
  const ordered = sort(cards);
  for (let start = 0; start < ordered.length; start += columns) {
    const part = ordered.slice(start, start + columns),
      row = document.createElement("div");
    row.className = "trick-cards";
    const step = Math.min(
      cardWidth * 0.78,
      (available - cardWidth) / Math.max(1, part.length - 1),
    );
    part.forEach((c, i) => {
      const card = makeCard(c);
      card.style.marginLeft = i ? `${step - cardWidth}px` : "0";
      row.append(card);
    });
    root.append(row);
  }
}
function clearTimer() {
  if (aiTimer !== null) clearTimeout(aiTimer);
  aiTimer = null;
}
function schedule(delay = 850) {
  clearTimer();
  if (!s || suspended || s.phase === "over") return;
  const token = epoch;
  if (s.phase === "redeal") {
    aiTimer = setTimeout(() => {
      if (token === epoch && !suspended) newRound(true);
    }, 1200);
    return;
  }
  if (s.turn === 0 && !auto) return;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    if (token !== epoch || suspended) return;
    if (s.phase === "bid")
      doBid(bidAI(s.hands[s.turn], s.base, activeDifficulty));
    else if (s.phase === "play") doPlay(chooseAI(s, activeDifficulty));
  }, delay);
}
function newRound(redeal = false) {
  const continueAuto = redeal && auto;
  epoch++;
  clearTimer();
  clearTimeout(celebrationTimer);
  $("celebration").classList.remove("show");
  for (const d of document.querySelectorAll("dialog[open]")) d.close();
  modalHold = false;
  syncPause();
  if (!redeal) round++;
  s = createGame(Math.random, (round - 1) % 3);
  selected.clear();
  auto = continueAuto;
  lastSaved = -1;
  activeDifficulty = data.settings.difficulty;
  $("trick").replaceChildren();
  $("bottom").classList.remove("reveal");
  for (let i = 0; i < 3; i++) $("bubble" + i).textContent = "";
  say(redeal ? "无人叫分，已重新洗牌" : "发牌完成 · 好运在手");
  audio.effect("deal");
  render(true);
  schedule(1200);
}
function doBid(value) {
  const who = s.turn,
    old = s.phase;
  try {
    bid(s, value);
  } catch (e) {
    say(e.message);
    audio.effect("error");
    return;
  }
  $("bubble" + who).textContent = value ? `${value} 分` : "不叫";
  audio.effect(value ? "bid" : "pass");
  if (old === "bid" && s.phase === "play") {
    say(`${names[s.landlord]}成为地主，先出牌`);
    $("bottom").classList.add("reveal");
    for (let i = 0; i < 3; i++)
      $("bubble" + i).textContent = i === s.landlord ? "♛ 地主先出" : "";
  }
  render();
  schedule();
}
function doPlay(cards) {
  const who = s.turn;
  try {
    const e = play(s, cards);
    selected.clear();
    hintKey = "";
    if (e.pass) {
      $("bubble" + who).textContent = "不出";
      audio.effect("pass");
      if (e.clear) {
        trick([]);
        for (let i = 0; i < 3; i++) $("bubble" + i).textContent = "";
        say("两家不出 · 新一轮领出");
      } else say(`${names[who]}不出`);
    } else {
      for (let i = 0; i < 3; i++) $("bubble" + i).textContent = "";
      trick(cards, who, e.pattern);
      say(`${names[who]}出了${e.pattern.name}`);
      audio.effect(
        ["bomb", "rocket"].includes(e.pattern.type) ? "bomb" : "play",
      );
      if (["bomb", "rocket"].includes(e.pattern.type))
        celebrate(`${e.pattern.name} ×2`);
    }
    render();
    if (e.over) finish();
    else schedule();
  } catch (e) {
    say(e.message);
    audio.effect("error");
    updateControls();
  }
}
function finish() {
  clearTimer();
  const r = s.result;
  if (lastSaved !== epoch) {
    record(data, r, s.landlord);
    lastSaved = epoch;
    persist();
    stats();
  }
  const won = r.scores[0] > 0;
  audio.effect(won ? "win" : "lose");
  if (r.spring) celebrate(r.springName + " ×2");
  else if (won) celebrate("好牌，好局！");
  $("resultEyebrow").textContent =
    `${r.landlordWin ? "地主" : "农民"}获胜${r.springName ? " · " + r.springName : ""}`;
  $("resultTitle").textContent = won
    ? "配合与实力，赢了！"
    : "这一局，蓄势再来";
  $("resultScore").textContent = (r.scores[0] > 0 ? "+" : "") + r.scores[0];
  $("breakdown").innerHTML =
    `<div class="breakdown">叫分基础 <b>${r.base}</b> × 炸弹 / 王炸 <b>2<sup>${r.bombs}</sup></b>${r.spring ? " × " + r.springName + " <b>2</b>" : ""}<br>最终倍数 <b>${r.multiplier}</b> · 每单位 <b>${r.unit}</b> 分 · 地主按 2 单位</div>`;
  $("scoreRows").innerHTML = r.scores
    .map(
      (n, i) =>
        `<div class="score-row"><span>${names[i]} · ${s.landlord === i ? "地主" : "农民"}</span><b>${n > 0 ? "+" : ""}${n}</b></div>`,
    )
    .join("");
  $("resultRecord").textContent =
    `累计 ${data.score} 分 · ${data.wins} 胜 / ${data.games} 局 · 胜率 ${Math.round((data.wins / data.games) * 100)}%`;
  $("result").showModal();
}
function toggle(c, force) {
  if (s?.turn !== 0 || s.phase !== "play" || auto || suspended) return;
  const yes = force ?? !selected.has(c);
  if (yes) selected.add(c);
  else selected.delete(c);
  const el = $("hand").querySelector(`[data-id="${c}"]`);
  el?.classList.toggle("selected", yes);
  el?.setAttribute("aria-pressed", yes);
  audio.effect("select");
  hintKey = "";
  updateControls();
}
let drag = null;
$("hand").addEventListener("pointerdown", (e) => {
  const el = e.target.closest("[data-id]");
  if (!el || e.button !== 0) return;
  e.preventDefault();
  const c = +el.dataset.id;
  drag = {
    pointer: e.pointerId,
    value: !selected.has(c),
    visited: new Set([c]),
  };
  toggle(c, drag.value);
});
document.addEventListener("pointermove", (e) => {
  if (!drag || drag.pointer !== e.pointerId) return;
  const el = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest("#hand [data-id]");
  if (el) {
    const c = +el.dataset.id;
    if (!drag.visited.has(c)) {
      drag.visited.add(c);
      toggle(c, drag.value);
    }
  }
});
for (const ev of ["pointerup", "pointercancel"])
  document.addEventListener(ev, () => (drag = null));
$("hand").addEventListener("click", (e) => {
  const el = e.target.closest("[data-id]");
  if (e.detail === 0 && el) toggle(+el.dataset.id);
});
$("playButton").onclick = () => {
  if (!$("playButton").disabled) doPlay([...selected]);
};
$("passButton").onclick = () => {
  if (!$("passButton").disabled) doPlay([]);
};
$("clearButton").onclick = () => {
  selected.clear();
  handRender();
};
$("hintButton").onclick = () => {
  if ($("hintButton").disabled) return;
  const legal = moves(s.hands[0], s.table);
  if (!legal.length) {
    say("没有能压过的牌，可以选择不出");
    return;
  }
  const key = s.revision + ":" + s.hands[0].join(",");
  {
    const best = chooseAI(s, activeDifficulty);
    const preferred = legal.findIndex(
      (m) =>
        m.cards.length === best.length &&
        m.cards.every((c) => best.includes(c)),
    );
    if (preferred > 0) legal.unshift(...legal.splice(preferred, 1));
  }
  if (key !== hintKey) hintIndex = 0;
  else hintIndex++;
  hintKey = key;
  const choice = legal[hintIndex % legal.length];
  selected = new Set(choice.cards);
  handRender();
  say(
    `提示 ${(hintIndex % legal.length) + 1}/${legal.length} · ${choice.pattern.name}`,
  );
};
$("autoButton").onclick = () => {
  auto = !auto;
  selected.clear();
  render();
  schedule(450);
};
document.querySelectorAll("[data-bid]").forEach(
  (b) =>
    (b.onclick = () => {
      if (!b.disabled) doBid(+b.dataset.bid);
    }),
);
function syncPause() {
  const next = document.hidden || parentHold || modalHold;
  if (next === suspended) return;
  suspended = next;
  document.body.classList.toggle("paused", parentHold);
  if (next) {
    clearTimer();
    audio.pause();
  } else {
    audio.resume();
    schedule(700);
  }
  updateControls();
}
function openModal(id) {
  modalHold = true;
  syncPause();
  $(id).showModal();
}
for (const id of ["settings", "rules", "confirmNew"])
  $(id).addEventListener("close", () => {
    modalHold = false;
    syncPause();
  });
$("settingsButton").onclick = () => openModal("settings");
$("rulesButton").onclick = () => openModal("rules");
$("newButton").onclick = () =>
  s && s.phase !== "over" ? openModal("confirmNew") : newRound();
$("confirmNewButton").onclick = () => newRound();
for (const b of document.querySelectorAll("[data-close]"))
  b.onclick = () => $(b.dataset.close).close();
$("startButton").onclick = () => {
  data.settings.difficulty = $("startDifficulty").value;
  $("difficulty").value = data.settings.difficulty;
  persist();
  audio.unlock();
  newRound();
};
$("againButton").onclick = () => newRound();
for (const k of ["difficulty", "sfx", "music", "volume"]) {
  const el = $(k);
  if (el.type === "checkbox") el.checked = data.settings[k];
  else el.value = data.settings[k];
  el.addEventListener("input", () => {
    data.settings[k] =
      el.type === "checkbox"
        ? el.checked
        : el.type === "range"
          ? +el.value
          : el.value;
    persist();
    audio.sync();
  });
}
$("startDifficulty").value = data.settings.difficulty;
document.addEventListener("pointerdown", () => audio.unlock(), {
  passive: true,
});
document.addEventListener("visibilitychange", syncPause);
window.addEventListener("message", (e) => {
  if (
    e.origin !== location.origin ||
    e.source !== parent ||
    e.data?.type !== "arcade"
  )
    return;
  if (e.data.action === "suspend") parentHold = true;
  else if (e.data.action === "resume") parentHold = false;
  syncPause();
});
window.addEventListener("pagehide", () => {
  clearTimer();
  audio.pause();
});
window.addEventListener("pageshow", () => {
  syncPause();
  if (!suspended) {
    audio.resume();
    schedule();
  }
});
window.addEventListener("resize", () => handRender());
document.addEventListener("keydown", (e) => {
  if (
    document.querySelector("dialog[open]") ||
    suspended ||
    /INPUT|SELECT/.test(e.target.tagName) ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey
  )
    return;
  const k = e.key.toLowerCase();
  if (k === "h") {
    $("hintButton").click();
    e.preventDefault();
  } else if (k === "p" || (k === " " && e.target.tagName !== "BUTTON")) {
    $("passButton").click();
    e.preventDefault();
  } else if (k === "enter" && !e.target.closest("#hand")) {
    $("playButton").click();
    e.preventDefault();
  } else if (k === "escape") {
    selected.clear();
    handRender();
  } else if (s?.phase === "bid" && ["0", "1", "2", "3"].includes(k)) {
    document.querySelector(`[data-bid="${k}"]`).click();
  }
});
$("welcome").addEventListener("cancel", (e) => e.preventDefault());
render();
$("welcome").showModal();
