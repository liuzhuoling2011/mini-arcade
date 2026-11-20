/* Original Dou Dizhu rules. Pure functions: shared by UI, hints and AI. */
export const rank = (id) => (id < 52 ? 3 + Math.floor(id / 4) : id - 36);
export const label = (r) =>
  ({ 11: "J", 12: "Q", 13: "K", 14: "A", 15: "2", 16: "小王", 17: "大王" })[
    r
  ] || String(r);
export const sort = (cards) =>
  [...cards].sort((a, b) => rank(b) - rank(a) || a - b);
export function deck(random = Math.random) {
  const a = Array.from({ length: 54 }, (_, i) => i);
  for (let i = 53; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const groups = (cards) => {
  const g = new Map();
  for (const c of cards) {
    const r = rank(c);
    if (!g.has(r)) g.set(r, []);
    g.get(r).push(c);
  }
  return new Map([...g].sort((a, b) => a[0] - b[0]));
};
const consecutive = (a) =>
  a.length > 0 && a.at(-1) <= 14 && a.every((r, i) => !i || r === a[i - 1] + 1);
const names = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  triple1: "三带一",
  triple2: "三带二",
  straight: "顺子",
  pairs: "连对",
  plane: "飞机",
  plane1: "飞机带单",
  plane2: "飞机带对",
  four1: "四带二单",
  four2: "四带二对",
  bomb: "炸弹",
  rocket: "王炸",
};
export function classify(cards) {
  if (
    !cards.length ||
    new Set(cards).size !== cards.length ||
    cards.some((c) => !Number.isInteger(c) || c < 0 || c > 53)
  )
    return null;
  const g = groups(cards),
    rs = [...g.keys()],
    ns = [...g.values()].map((a) => a.length),
    n = cards.length;
  const out = (type, high, len = 1) => ({
    type,
    high,
    len,
    n,
    name: names[type],
  });
  if (n === 2 && rs[0] === 16 && rs[1] === 17) return out("rocket", 17);
  if (g.size === 1) {
    if (n === 1) return out("single", rs[0]);
    if (n === 2) return out("pair", rs[0]);
    if (n === 3) return out("triple", rs[0]);
    if (n === 4) return out("bomb", rs[0]);
  }
  if (n === 4 && ns.includes(3)) return out("triple1", rs[ns.indexOf(3)]);
  if (n === 5 && ns.includes(3) && ns.includes(2))
    return out("triple2", rs[ns.indexOf(3)]);
  if (n >= 5 && ns.every((x) => x === 1) && consecutive(rs))
    return out("straight", rs.at(-1), n);
  if (n >= 6 && n % 2 === 0 && ns.every((x) => x === 2) && consecutive(rs))
    return out("pairs", rs.at(-1), n / 2);
  // Bare planes take precedence. Wings never reuse a body rank; single wings may be a pair.
  for (const wing of [0, 1, 2]) {
    const k = n / (3 + wing);
    if (k < 2 || !Number.isInteger(k)) continue;
    for (let start = 3; start + k - 1 <= 14; start++) {
      const body = Array.from({ length: k }, (_, i) => start + i);
      if (!body.every((r) => g.get(r)?.length === 3)) continue;
      const rest = rs.filter((r) => !body.includes(r));
      if (wing === 0 && rest.length === 0)
        return out("plane", start + k - 1, k);
      if (
        wing === 1 &&
        rest.reduce((s, r) => s + g.get(r).length, 0) === k &&
        rest.every((r) => g.get(r).length <= 2)
      )
        return out("plane1", start + k - 1, k);
      if (
        wing === 2 &&
        rest.length === k &&
        rest.every((r) => g.get(r).length === 2)
      )
        return out("plane2", start + k - 1, k);
    }
  }
  if (ns.includes(4)) {
    const r = rs[ns.indexOf(4)],
      rest = rs.filter((x) => x !== r);
    if (n === 6 && rest.every((x) => g.get(x).length <= 2))
      return out("four1", r);
    if (
      n === 8 &&
      rest.length === 2 &&
      rest.every((x) => g.get(x).length === 2)
    )
      return out("four2", r);
  }
  return null;
}
export function beats(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.type === "rocket") return b.type !== "rocket";
  if (b.type === "rocket") return false;
  if (a.type === "bomb" && b.type !== "bomb") return true;
  return a.type === b.type && a.n === b.n && a.len === b.len && a.high > b.high;
}
function choices(g, exclude, count, pairs = false) {
  const entries = [...g].filter(([r]) => !exclude.includes(r));
  const out = [];
  function visit(i, left, cards) {
    if (left === 0) {
      out.push(cards);
      return;
    }
    if (i === entries.length) return;
    const [, a] = entries[i];
    const max = pairs
      ? Math.min(1, Math.floor(a.length / 2))
      : Math.min(2, a.length, left);
    for (let x = 0; x <= max && x <= left; x++)
      visit(i + 1, left - x, cards.concat(a.slice(0, pairs ? x * 2 : x)));
  }
  visit(0, count, []);
  return out;
}
export function moves(hand, target = null) {
  const g = groups(hand),
    result = [],
    seen = new Set();
  const add = (cs) => {
    const p = classify(cs);
    if (!p || !beats(p, target)) return;
    const key = cs
      .map(rank)
      .sort((a, b) => a - b)
      .join(",");
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ cards: cs, pattern: p });
  };
  for (const [r, a] of g) {
    for (let n = 1; n <= a.length; n++) add(a.slice(0, n));
    if (a.length >= 3) {
      for (const [s, b] of g)
        if (s !== r) {
          add(a.slice(0, 3).concat(b.slice(0, 1)));
          if (b.length >= 2) add(a.slice(0, 3).concat(b.slice(0, 2)));
        }
    }
    if (a.length === 4) {
      for (const cs of choices(g, [r], 2)) add(a.concat(cs));
      for (const cs of choices(g, [r], 2, true)) add(a.concat(cs));
    }
  }
  if (g.has(16) && g.has(17)) add([g.get(16)[0], g.get(17)[0]]);
  for (const mult of [1, 2, 3])
    for (let start = 3; start <= 14; start++) {
      const body = [],
        rs = [];
      for (let r = start; r <= 14 && (g.get(r)?.length || 0) >= mult; r++) {
        body.push(...g.get(r).slice(0, mult));
        rs.push(r);
        const k = rs.length;
        if (k < (mult === 1 ? 5 : mult === 2 ? 3 : 2)) continue;
        add([...body]);
        if (mult === 3) {
          if (k * 4 <= hand.length)
            for (const cs of choices(g, rs, k)) add(body.concat(cs));
          if (k * 5 <= hand.length)
            for (const cs of choices(g, rs, k, true)) add(body.concat(cs));
        }
      }
    }
  return result;
}
export function createGame(random = Math.random, starter = 0) {
  const d = deck(random);
  return {
    phase: "bid",
    hands: [sort(d.slice(0, 17)), sort(d.slice(17, 34)), sort(d.slice(34, 51))],
    bottom: d.slice(51),
    turn: starter,
    starter,
    bids: [],
    base: 0,
    landlord: null,
    table: null,
    owner: null,
    passes: 0,
    played: [],
    plays: [0, 0, 0],
    bombs: 0,
    winner: null,
    result: null,
    revision: 0,
  };
}
export function bid(s, value) {
  if (
    s.phase !== "bid" ||
    ![0, 1, 2, 3].includes(value) ||
    (value !== 0 && value <= s.base)
  )
    throw Error("无效叫分");
  s.bids.push({ seat: s.turn, value });
  if (value) {
    s.base = value;
    s.landlord = s.turn;
  }
  if (value === 3 || s.bids.length === 3) {
    if (!s.base) {
      s.phase = "redeal";
      return;
    }
    s.hands[s.landlord] = sort(s.hands[s.landlord].concat(s.bottom));
    s.turn = s.landlord;
    s.phase = "play";
  } else s.turn = (s.turn + 1) % 3;
  s.revision++;
}
export function settle(s, winner) {
  const landlordWin = winner === s.landlord;
  const spring = landlordWin
    ? s.plays.every((n, i) => i === s.landlord || n === 0)
    : s.plays[s.landlord] === 1;
  const multiplier = 2 ** (s.bombs + (spring ? 1 : 0));
  const unit = s.base * multiplier;
  const scores = [0, 1, 2].map(
    (i) => (i === s.landlord ? 2 : -1) * unit * (landlordWin ? 1 : -1),
  );
  return {
    winner,
    landlordWin,
    spring,
    springName: spring ? (landlordWin ? "春天" : "反春天") : null,
    bombs: s.bombs,
    multiplier,
    base: s.base,
    unit,
    scores,
  };
}
export function play(s, cards) {
  if (s.phase !== "play") throw Error("非出牌阶段");
  const who = s.turn;
  if (!cards.length) {
    if (!s.table || s.owner === who) throw Error("首家必须出牌");
    s.passes++;
    if (s.passes === 2) {
      s.table = null;
      s.passes = 0;
      s.turn = s.owner;
      s.revision++;
      return { pass: true, clear: true };
    }
  } else {
    if (
      new Set(cards).size !== cards.length ||
      !cards.every((c) => s.hands[who].includes(c))
    )
      throw Error("手牌不存在");
    const p = classify(cards);
    if (!beats(p, s.table)) throw Error("牌型无效或未大过上家");
    s.hands[who] = s.hands[who].filter((c) => !cards.includes(c));
    s.played.push(...cards);
    s.plays[who]++;
    s.table = p;
    s.owner = who;
    s.passes = 0;
    if (["bomb", "rocket"].includes(p.type)) s.bombs++;
    if (!s.hands[who].length) {
      s.winner = who;
      s.phase = "over";
      s.result = settle(s, who);
      s.revision++;
      return { pattern: p, over: true };
    }
  }
  s.turn = (who + 1) % 3;
  s.revision++;
  return { pass: !cards.length, pattern: cards.length ? s.table : null };
}
export function bidAI(hand, base, difficulty = "normal") {
  const g = groups(hand);
  let power = hand.reduce((s, c) => s + (rank(c) >= 15 ? rank(c) - 13 : 0), 0);
  power += [...g.values()].filter((a) => a.length === 4).length * 5;
  power += [...g.values()].filter((a) => a.length === 3).length * 1.2;
  const value = power >= 17 ? 3 : power >= 12 ? 2 : power >= 8 ? 1 : 0;
  return value > base ? value : 0;
}
// Uses own cards and public counts/team only: never looks at an opponent's ranks.
export function chooseAI(s, difficulty = "normal") {
  const hand = s.hands[s.turn],
    legal = moves(hand, s.table);
  if (!legal.length) return [];
  const finish = legal.find((m) => m.cards.length === hand.length);
  if (finish) return finish.cards;
  const teammate = s.table && s.turn !== s.landlord && s.owner !== s.landlord;
  if (teammate && difficulty !== "easy") return [];
  const enemyNext = (s.turn + 1) % 3;
  const danger =
    enemyNext === s.landlord || s.turn === s.landlord
      ? s.hands[enemyNext].length <= 2
      : false;
  const value = (m) => {
    const p = m.pattern,
      bomb = ["bomb", "rocket"].includes(p.type);
    let cost =
      p.high * 0.4 - m.cards.length * (s.table ? 0.8 : 2.8) + (bomb ? 22 : 0);
    if (difficulty === "hard") {
      const rest = groups(hand.filter((c) => !m.cards.includes(c)));
      cost += rest.size * 1.1;
      for (const [r, a] of gEntries(hand)) {
        if (a.length === 4 && m.cards.some((c) => rank(c) === r) && !bomb)
          cost += 8;
      }
      if (danger && p.type === "single") cost -= p.high * 0.85;
    }
    if (difficulty === "easy")
      cost = p.high * 0.25 - m.cards.length * 1.2 + (bomb ? 14 : 0);
    return cost;
  };
  legal.sort((a, b) => value(a) - value(b));
  if (
    s.table &&
    ["bomb", "rocket"].includes(legal[0].pattern.type) &&
    !danger &&
    hand.length > 6 &&
    difficulty !== "easy"
  )
    return [];
  return legal[0].cards;
}
const gEntries = (hand) => groups(hand);
export function conserved(s) {
  const all = s.hands
    .flat()
    .concat(
      s.played,
      s.phase === "bid" || s.phase === "redeal" ? s.bottom : [],
    );
  return all.length === 54 && new Set(all).size === 54;
}
