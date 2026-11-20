const KEY = "mini-arcade.doudizhu.v1";
export const defaults = () => ({
  score: 0,
  games: 0,
  wins: 0,
  landlordGames: 0,
  landlordWins: 0,
  best: 0,
  settings: { difficulty: "normal", sfx: true, music: false, volume: 0.35 },
});
export function load(storage) {
  const d = defaults();
  try {
    storage ??= globalThis.localStorage;
    const x = JSON.parse(storage.getItem(KEY));
    if (!x || typeof x !== "object") return d;
    for (const k of [
      "score",
      "games",
      "wins",
      "landlordGames",
      "landlordWins",
      "best",
    ])
      if (Number.isSafeInteger(x[k]) && (k === "score" || x[k] >= 0))
        d[k] = x[k];
    const a = x.settings || {};
    if (["easy", "normal", "hard"].includes(a.difficulty))
      d.settings.difficulty = a.difficulty;
    if (typeof a.sfx === "boolean") d.settings.sfx = a.sfx;
    if (typeof a.music === "boolean") d.settings.music = a.music;
    if (Number.isFinite(a.volume))
      d.settings.volume = Math.max(0, Math.min(1, a.volume));
    return d;
  } catch {
    return d;
  }
}
export function save(data, storage) {
  try {
    storage ??= globalThis.localStorage;
    storage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
export function record(data, result, landlord) {
  data.games++;
  data.score += result.scores[0];
  if (result.scores[0] > 0) data.wins++;
  if (landlord === 0) {
    data.landlordGames++;
    if (result.landlordWin) data.landlordWins++;
  }
  data.best = Math.max(data.best, result.scores[0]);
  return data;
}
