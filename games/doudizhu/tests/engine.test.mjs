import test from "node:test";
import assert from "node:assert/strict";
import {
  rank,
  classify,
  beats,
  moves,
  createGame,
  bid,
  play,
  chooseAI,
  bidAI,
  conserved,
  settle,
} from "../engine.js";
import { defaults, load, save, record } from "../storage.js";
const cards = (rs) => {
  const count = {};
  return rs.map((r) =>
    r >= 16 ? r + 36 : (r - 3) * 4 + (count[r] = (count[r] || 0) + 1) - 1,
  );
};
const p = (rs) => classify(cards(rs));
const fixtures = [
  ["single", [3]],
  ["pair", [15, 15]],
  ["triple", [4, 4, 4]],
  ["triple1", [4, 4, 4, 17]],
  ["triple2", [4, 4, 4, 5, 5]],
  ["straight", [10, 11, 12, 13, 14]],
  ["pairs", [3, 3, 4, 4, 5, 5]],
  ["plane", [3, 3, 3, 4, 4, 4]],
  ["plane1", [3, 3, 3, 4, 4, 4, 5, 5]],
  ["plane2", [3, 3, 3, 4, 4, 4, 5, 5, 6, 6]],
  ["four1", [3, 3, 3, 3, 16, 17]],
  ["four1", [4, 4, 4, 4, 5, 5]],
  ["four2", [3, 3, 3, 3, 4, 4, 5, 5]],
  ["bomb", [15, 15, 15, 15]],
  ["rocket", [16, 17]],
];
for (const [type, rs] of fixtures)
  test(type + " " + rs, () => {
    assert.equal(p(rs)?.type, type);
    const generated = moves(cards(rs));
    assert(
      generated.some(
        (m) => m.cards.length === rs.length && m.pattern.type === type,
      ),
    );
  });
test("invalid patterns and boundaries", () => {
  for (const rs of [
    [],
    [3, 4],
    [3, 4, 5, 6],
    [11, 12, 13, 14, 15],
    [3, 3, 4, 4],
    [14, 14, 14, 15, 15, 15],
    [3, 3, 3, 4, 4, 4, 3, 7],
    [3, 3, 3, 4, 4, 4, 5, 5, 5, 5],
    [3, 3, 3, 3, 4, 4, 4, 4],
    [3, 3, 3, 4, 4, 4, 5, 6, 7],
  ])
    assert.equal(p(rs), null, rs.join(","));
  assert.equal(classify([0, 0]), null);
  assert.equal(classify([54]), null);
  assert.equal(classify([-1]), null);
});
test("comparison type length rank and bombs", () => {
  assert(beats(p([4]), p([3])));
  assert(!beats(p([3, 3]), p([3])));
  assert(!beats(p([4, 5, 6, 7, 8, 9]), p([3, 4, 5, 6, 7])));
  assert(beats(p([3, 3, 3, 3]), p([15, 15])));
  assert(beats(p([16, 17]), p([15, 15, 15, 15])));
  assert(!beats(p([16, 17]), p([16, 17])));
  assert(!beats(p([15]), p([16])));
  assert(!beats(p([3, 3, 3, 4]), p([4, 4, 4, 3])));
});
test("bidding all pass, raising, instant 3, rotation and conservation", () => {
  let s = createGame(() => 0.5, 2);
  assert(conserved(s));
  bid(s, 0);
  bid(s, 0);
  bid(s, 0);
  assert.equal(s.phase, "redeal");
  assert(conserved(s));
  s = createGame(() => 0.3, 1);
  bid(s, 1);
  assert.throws(() => bid(s, 1));
  bid(s, 2);
  bid(s, 0);
  assert.equal(s.landlord, 2);
  assert.equal(s.turn, 2);
  assert.equal(s.hands[2].length, 20);
  assert(conserved(s));
  s = createGame();
  bid(s, 3);
  assert.equal(s.phase, "play");
  assert.equal(s.bids.length, 1);
  assert(conserved(s));
});
test("ownership, duplicate, invalid pass and two passes return lead", () => {
  const s = createGame();
  bid(s, 3);
  assert.throws(() => play(s, []));
  assert.throws(() => play(s, [s.hands[1][0]]));
  assert.throws(() => play(s, [s.hands[0][0], s.hands[0][0]]));
  play(s, [s.hands[0][0]]);
  play(s, []);
  play(s, []);
  assert.equal(s.turn, 0);
  assert.equal(s.table, null);
  assert(conserved(s));
});
test("spring anti-spring bombs and zero sum", () => {
  for (const landlord of [0, 1, 2])
    for (const winner of [0, 1, 2])
      for (const bombs of [0, 1, 4]) {
        const s = { landlord, base: 3, bombs, plays: [0, 0, 0] };
        s.plays[landlord] = 1;
        const r = settle(s, winner);
        assert(r.spring);
        assert.equal(r.multiplier, 2 ** (bombs + 1));
        assert.equal(
          r.scores.reduce((a, b) => a + b),
          0,
        );
        assert.equal(Math.abs(r.scores[landlord]), r.unit * 2);
        s.plays = [2, 2, 2];
        assert(!settle(s, winner).spring);
      }
});
function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const key = (cs) =>
  cs
    .map(rank)
    .sort((a, b) => a - b)
    .join(",");
test("action generator complete for all subsets of 40 seeded ten-card hands", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const hand = createGame(rng(seed)).hands[0].slice(0, 10),
      generated = new Set(moves(hand).map((m) => key(m.cards)));
    for (let bits = 1; bits < 1024; bits++) {
      const sub = hand.filter((_, i) => bits & (1 << i));
      if (classify(sub)) assert(generated.has(key(sub)), key(sub));
    }
  }
});
test("persistence corruption, settings, score record and new game isolation", () => {
  const storage = {
    v: null,
    getItem() {
      return this.v;
    },
    setItem(k, v) {
      this.v = v;
    },
  };
  const d = defaults();
  d.settings.music = true;
  record(d, { scores: [12, -6, -6], landlordWin: true }, 0);
  assert(save(d, storage));
  assert.deepEqual(load(storage), d);
  storage.v = "corrupt";
  assert.deepEqual(load(storage), defaults());
  storage.v = '{"score":"oops","settings":{"volume":99,"difficulty":"hack"}}';
  assert.equal(load(storage).settings.volume, 1);
  assert.equal(load(storage).settings.difficulty, "normal");
  assert.equal(load(storage).score, 0);
  assert(
    !save(d, {
      setItem() {
        throw Error();
      },
    }),
  );
  const a = createGame(),
    b = createGame();
  a.hands[0].pop();
  assert.equal(b.hands[0].length, 17);
});
// Seeded full rounds, including bidding and a strict upper action bound. No omniscient AI.
test("3000 full AI games: legal moves, termination, 54-card conservation, zero-sum", () => {
  let actions = 0,
    maxTurns = 0,
    redeals = 0;
  const diffs = ["easy", "normal", "hard"];
  for (let seed = 1; seed <= 3000; seed++) {
    const random = rng(seed);
    let s = createGame(random, seed % 3),
      turns = 0;
    while (s.phase !== "over") {
      assert(conserved(s));
      assert(++turns < 700, "nonterminating seed " + seed);
      if (s.phase === "redeal") {
        s = createGame(random, seed % 3);
        redeals++;
        continue;
      }
      if (s.phase === "bid")
        bid(s, bidAI(s.hands[s.turn], s.base, diffs[seed % 3]));
      else {
        const cs = chooseAI(s, diffs[seed % 3]);
        if (cs.length) {
          assert(cs.every((c) => s.hands[s.turn].includes(c)));
          assert(beats(classify(cs), s.table));
        } else assert(s.table);
        play(s, cs);
        actions++;
      }
    }
    assert(conserved(s));
    assert.equal(
      s.result.scores.reduce((a, b) => a + b),
      0,
    );
    assert(s.hands[s.winner].length === 0);
    maxTurns = Math.max(maxTurns, turns);
  }
  console.log(JSON.stringify({ games: 3000, actions, maxTurns, redeals }));
});

test("AI does not inspect opponent hidden cards", () => {
  const s = createGame();
  bid(s, 3);
  for (const i of [1, 2])
    s.hands[i] = new Proxy(s.hands[i], {
      get(target, property) {
        if (property === "length") return target.length;
        throw Error("hidden-card access: " + String(property));
      },
    });
  for (const d of ["easy", "normal", "hard"]) assert(chooseAI(s, d).length > 0);
});

test("every ordinary shape compares body rank, never attachment rank", () => {
  const cases = [
    [[3], [4]],
    [
      [3, 3],
      [4, 4],
    ],
    [
      [3, 3, 3],
      [4, 4, 4],
    ],
    [
      [3, 3, 3, 17],
      [4, 4, 4, 5],
    ],
    [
      [3, 3, 3, 15, 15],
      [4, 4, 4, 5, 5],
    ],
    [
      [3, 4, 5, 6, 7],
      [4, 5, 6, 7, 8],
    ],
    [
      [3, 3, 4, 4, 5, 5],
      [4, 4, 5, 5, 6, 6],
    ],
    [
      [3, 3, 3, 4, 4, 4],
      [4, 4, 4, 5, 5, 5],
    ],
    [
      [3, 3, 3, 4, 4, 4, 16, 17],
      [4, 4, 4, 5, 5, 5, 6, 6],
    ],
    [
      [3, 3, 3, 4, 4, 4, 14, 14, 15, 15],
      [4, 4, 4, 5, 5, 5, 6, 6, 7, 7],
    ],
    [
      [3, 3, 3, 3, 16, 17],
      [4, 4, 4, 4, 5, 5],
    ],
    [
      [3, 3, 3, 3, 14, 14, 15, 15],
      [4, 4, 4, 4, 5, 5, 6, 6],
    ],
    [
      [3, 3, 3, 3],
      [4, 4, 4, 4],
    ],
  ];
  for (const [low, high] of cases) {
    assert(beats(p(high), p(low)));
    assert(!beats(p(low), p(high)));
    assert(!beats(p(high), p(high)));
    assert(
      moves(cards(high), p(low)).some((m) => m.cards.length === high.length),
    );
  }
});
test("long runs, quad split planes and repeated wing policy", () => {
  assert.equal(p([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).type, "straight");
  assert.equal(
    p([3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8]).len,
    6,
  );
  assert.equal(
    p([3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 9, 9]).type,
    "plane1",
  );
  const hand = cards([3, 3, 3, 3, 4, 4, 4, 5, 5]);
  assert(
    moves(hand).some(
      (m) => m.pattern.type === "plane1" && m.cards.length === 8,
    ),
  );
  assert.equal(p([3, 3, 3, 3, 4, 4, 4, 5]), null);
});
test("denied localStorage getter does not prevent playing", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw Error("storage denied");
      },
    });
    assert.deepEqual(load(), defaults());
    assert.equal(save(defaults()), false);
  } finally {
    if (old) Object.defineProperty(globalThis, "localStorage", old);
    else delete globalThis.localStorage;
  }
});
