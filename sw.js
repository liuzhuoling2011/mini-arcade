/* mini-arcade service worker.
   Scope is the script directory (/mini-arcade/ on GitHub Pages).
   Requests outside that prefix are ignored so sibling Pages apps are untouched.
   Shell files are cached up front. Each game's files are cached only after a visit. */
const VERSION = "v5";
const CACHE = "mini-arcade-" + VERSION;
const PREFIX = "/mini-arcade/";
const SHELL = [
  "/mini-arcade/",
  "/mini-arcade/index.html",
  "/mini-arcade/offline.html",
  "/mini-arcade/manifest.webmanifest",
  "/mini-arcade/shared/shell.css",
  "/mini-arcade/shared/shell.js",
  "/mini-arcade/shared/board-chrome.css",
  "/mini-arcade/icons/icon-192.png",
  "/mini-arcade/icons/icon-512.png",
  "/mini-arcade/icons/icon-192-maskable.png",
  "/mini-arcade/icons/icon-512-maskable.png",
  "/mini-arcade/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("mini-arcade-") && key !== CACHE)
          .map((key) => caches.delete(key))
      );
    })()
  );
});

function isShellPath(pathname) {
  if (SHELL.indexOf(pathname) !== -1) return true;
  if (pathname.indexOf(PREFIX + "shared/") === 0) return true;
  if (pathname.indexOf(PREFIX + "icons/") === 0) return true;
  return false;
}

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  return cache.match(request);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreVary: true })
      || await cache.match(new URL(request.url).pathname, { ignoreVary: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await cache.match("/mini-arcade/offline.html");
      if (offline) return offline;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await fromCache(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.headers.get("range")) return;
  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf(PREFIX) !== 0) return;

  if (request.mode === "navigate" || isShellPath(url.pathname)) {
    event.respondWith(request.mode === "navigate" ? networkFirst(request) : cacheFirst(request));
    return;
  }
  if (url.pathname.indexOf(PREFIX + "games/") === 0) {
    event.respondWith(networkFirst(request));
  }
});
