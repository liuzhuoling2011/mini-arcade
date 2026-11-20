// npm install --prefix /workspace/doudizhu-artifacts playwright@1.58.2
// NODE_PATH=/workspace/doudizhu-artifacts/node_modules node games/doudizhu/tests/browser.test.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright");
const dir = process.env.ARTIFACT_DIR || "/workspace/doudizhu-artifacts",
  base = process.env.TEST_URL || "http://127.0.0.1:8093/mini-arcade/";
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const errors = [],
  report = [];
try {
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["phone", 390, 844],
    ["landscape", 844, 390],
    ["tablet", 768, 1024],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await ctx.addInitScript(() => {
      let seed = 20261120;
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(name + ":" + e.message));
    await page.clock.install();
    await page.goto(base + "games/doudizhu/");
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForLoadState("load");
    const f = page.frames().find((f) => f.url().endsWith("/frame.html"));
    assert(f, "game iframe");
    await f.locator("#startButton").click();
    await f.locator('[data-bid="3"]').click();
    await f.locator("#hand .card").first().waitFor();
    assert.equal(await f.locator("#hand .card").count(), 20);
    const bounds = await f.evaluate(() => {
      const ids = ["hand", "playActions", "seat0", "seat1", "seat2", "bottom"];
      return Object.fromEntries(
        ids.map((id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return [id, { x: r.x, y: r.y, w: r.width, h: r.height }];
        }),
      );
    });
    const size = await f.evaluate(() => ({
      w: innerWidth,
      h: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
    }));
    assert(size.scrollW <= size.w + 1, `${name} horizontal overflow`);
    assert(size.scrollH <= size.h + 1, `${name} vertical overflow`);
    assert(bounds.hand.y + bounds.hand.h <= size.h + 1, `${name} hand cropped`);
    assert(
      bounds.playActions.y + bounds.playActions.h <= bounds.hand.y + 1,
      `${name} overlapping buttons`,
    );
    await page.screenshot({ path: `${dir}/${name}-20-cards.png` });
    // Touch selection, cancellation, hint validation, keyboard submit.
    const first = f.locator("#hand .card").first();
    await first.tap({ position: { x: 6, y: 25 } });
    assert.equal(await f.locator("#hand .selected").count(), 1);
    await first.tap({ position: { x: 6, y: 25 } });
    assert.equal(await f.locator("#hand .selected").count(), 0);
    await f.locator("#hintButton").click();
    assert((await f.locator("#hand .selected").count()) > 0);
    assert(await f.locator("#playButton").isEnabled());
    await f.locator("#clearButton").click();
    assert.equal(await f.locator("#hand .selected").count(), 0);
    // A real swept pointer toggles each card only once.
    const targets = await f.locator("#hand .card").evaluateAll((els) =>
      els.slice(0, 4).map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x + 6, y: r.y + 45 };
      }),
    );
    const frameBox = await page.locator("iframe").boundingBox();
    await page.mouse.move(targets[0].x + frameBox.x, targets[0].y + frameBox.y);
    await page.mouse.down();
    for (const pt of targets)
      await page.mouse.move(pt.x + frameBox.x, pt.y + frameBox.y);
    await page.mouse.up();
    assert.equal(
      await f.locator("#hand .selected").count(),
      4,
      `${name} drag select`,
    );
    await f.locator("#clearButton").click();
    await page.keyboard.press("h");
    const selected = await f.locator("#hand .selected").count();
    await page.keyboard.press("Enter");
    assert.equal(await f.locator("#hand .card").count(), 20 - selected);
    await page.screenshot({ path: `${dir}/${name}-in-play.png` });
    const playFits = await f.locator("#trick").evaluate((root) => {
      const r = root.getBoundingClientRect();
      return [...root.querySelectorAll(".card")].every((el) => {
        const b = el.getBoundingClientRect();
        return b.x >= r.x - 1 && b.right <= r.right + 1;
      });
    });
    assert(playFits, name + " long play overlaps seats");
    await page.clock.runFor(1900);
    // Parent suspend/resume freezes timers and audio; settings preserve choices.
    await page.evaluate(() =>
      document
        .querySelector("iframe")
        .contentWindow.postMessage(
          { type: "arcade", action: "suspend" },
          location.origin,
        ),
    );
    await page.clock.runFor(10);
    const before = await f.locator("#hand").innerHTML();
    await page.clock.runFor(6000);
    assert.equal(await f.locator("#hand").innerHTML(), before);
    assert(
      await f.locator("body").evaluate((e) => e.classList.contains("paused")),
    );
    await page.evaluate(() =>
      document
        .querySelector("iframe")
        .contentWindow.postMessage(
          { type: "arcade", action: "resume" },
          location.origin,
        ),
    );
    await page.clock.runFor(10);
    await f.locator("#settingsButton").click();
    await f.locator("#sfx").uncheck();
    await f.locator("#music").check();
    await f.locator("#volume").fill("0.2");
    await f.locator('[data-close="settings"]').last().click();
    // Cancel old timers through new game, then enable managed play and run to settlement.
    await f.locator("#newButton").click();
    await f.locator("#confirmNewButton").click();
    await f.locator("#autoButton").click();
    await page.clock.runFor(160000);
    assert(
      await f.locator("#result").evaluate((e) => e.open),
      `${name} autoplay did not finish`,
    );
    const stored = await f.evaluate(() =>
      JSON.parse(localStorage.getItem("mini-arcade.doudizhu.v1")),
    );
    assert.equal(stored.games, 1);
    assert.equal(stored.settings.sfx, false);
    assert.equal(stored.settings.music, true);
    assert.equal(stored.settings.volume, 0.2);
    await page.screenshot({ path: `${dir}/${name}-result.png` });
    await f.locator("#againButton").click();
    assert.equal(await f.locator("#hand .card").count(), 17);
    await page.reload();
    const f2 = page.frames().find((f) => f.url().endsWith("/frame.html"));
    await f2.locator("#startButton").waitFor();
    assert.equal(
      await f2.locator("#totalScore").textContent(),
      String(stored.score),
    );
    report.push({
      name,
      width,
      height,
      layout: size,
      autoplayGames: stored.games,
      score: stored.score,
    });
    await ctx.close();
  }
  // Cold-shell caching, upgrade cleanup, lazy game caching, offline replay and unseen-game fallback.
  const ctx = await browser.newContext(),
    page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pwa:" + e.message));
  await page.goto(base);
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.waitForLoadState("load");
  await page.evaluate(async () => {
    await caches.open("mini-arcade-v12");
  });
  let cache = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = (
      await Promise.all(
        names.map(async (n) =>
          (await (await caches.open(n)).keys()).map((r) => r.url),
        ),
      )
    ).flat();
    return { names, urls, scope: (await navigator.serviceWorker.ready).scope };
  });
  assert(cache.scope.endsWith("/mini-arcade/"));
  assert(cache.names.includes("mini-arcade-v13"));
  assert(!cache.urls.some((u) => u.includes("/games/")), "eager game download");
  // Force an actual new worker install/activation in a fresh context with an old cache pre-created.
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations())
      await r.unregister();
  });
  await page.goto(base);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(
    async () => !(await caches.keys()).includes("mini-arcade-v12"),
  );
  const start = Date.now();
  await page.goto(base + "games/doudizhu/");
  let frame = page.frames().find((f) => f.url().endsWith("/frame.html"));
  await frame.locator("#startButton").waitFor();
  const coldMs = Date.now() - start;
  await page.waitForTimeout(300);
  await page.reload();
  frame = page.frames().find((f) => f.url().endsWith("/frame.html"));
  await frame.locator("#startButton").waitFor();
  cache = await page.evaluate(async () => ({
    names: await caches.keys(),
    urls: (await (await caches.open("mini-arcade-v13")).keys()).map(
      (r) => r.url,
    ),
  }));
  for (const file of [
    "frame.html",
    "engine.mjs",
    "app.mjs",
    "storage.mjs",
    "audio.mjs",
    "table.css",
  ])
    assert(
      cache.urls.some((u) => u.endsWith("/doudizhu/" + file)),
      file + " not cached",
    );
  assert(!cache.urls.some((u) => u.includes("/games/reversi/")));
  await ctx.setOffline(true);
  await page.reload();
  frame = page.frames().find((f) => f.url().endsWith("/frame.html"));
  await frame.locator("#startButton").click();
  await frame.locator('[data-bid="1"]').click();
  assert.equal(
    await frame.locator("#bottom .back").count(),
    3,
    "bottom leaked before bidding completed",
  );
  assert.equal(await frame.locator(".role.landlord").count(), 0);
  await page.reload();
  frame = page.frames().find((f) => f.url().endsWith("/frame.html"));
  await frame.locator("#startButton").click();
  await frame.locator('[data-bid="3"]').click();
  assert.equal(await frame.locator("#hand .card").count(), 20);
  await page.screenshot({ path: dir + "/offline-play.png" });
  await page.goto(base + "games/reversi/");
  assert((await page.locator("body").innerText()).includes("离线"));
  await ctx.setOffline(false);
  await ctx.close();
  const slowCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const slowPage = await slowCtx.newPage();
  slowPage.on("pageerror", (e) => errors.push("slow:" + e.message));
  const cdp = await slowCtx.newCDPSession(slowPage);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 64000,
    uploadThroughput: 32000,
  });
  const slowStart = Date.now();
  await slowPage.goto(base + "games/doudizhu/");
  await slowPage.waitForFunction(() => navigator.serviceWorker.controller);
  await slowPage.waitForLoadState("load");
  let slowFrame = slowPage
    .frames()
    .find((f) => f.url().endsWith("/frame.html"));
  await slowFrame.locator("#startButton").waitFor();
  const slowColdMs = Date.now() - slowStart;
  await slowPage.screenshot({ path: dir + "/slow-network-ready.png" });
  await slowCtx.setOffline(true);
  const warmStart = Date.now();
  await slowPage.reload();
  slowFrame = slowPage.frames().find((f) => f.url().endsWith("/frame.html"));
  await slowFrame.locator("#startButton").waitFor();
  const offlineWarmMs = Date.now() - warmStart;
  report.push({
    slowNetwork: {
      latencyMs: 150,
      downloadBytesPerSecond: 64000,
      coldReadyMs: slowColdMs,
      offlineWarmMs,
    },
  });
  await slowCtx.close();
  assert.deepEqual(errors, []);
  report.push({
    pwa: {
      version: "v13",
      scope: "/mini-arcade/",
      coldMs,
      cachedGameFiles: cache.urls.filter((u) => u.includes("/doudizhu/"))
        .length,
      offlinePlay: true,
      unseenGameFallback: true,
      oldCacheRemoved: true,
    },
    errors,
  });
  await writeFile(
    dir + "/browser-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
