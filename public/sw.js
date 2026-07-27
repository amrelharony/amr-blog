// Service worker — hand-rolled per the Next 16 PWA guide (next-pwa/Serwist are
// webpack-based; this build uses Turbopack). Strategy:
//   * never intercept non-GET, /api/*, /admin/*, or cross-origin requests
//   * navigations: network-first → runtime cache → lb-saved (reader's saved
//     articles, populated by lib/collections.ts) → /offline fallback
//   * /_next/static/* (content-hashed): cache-first
//
// Eviction policy. Every cache here shares ONE origin storage quota with
// lb-saved, and a browser that hits the quota evicts the origin wholesale —
// taking the offline articles app/offline/page.tsx promises the reader with it.
// So nothing may grow without a bound:
//   * VERSION is the build id components/PwaRegister.tsx appends to this
//     script's URL as ?v=. A deploy ships a new script URL → the browser
//     installs a new worker → activate deletes every lb-* cache that isn't
//     current. No constant to remember to bump.
//   * the runtime and static caches are LRU-capped (RUNTIME_MAX / STATIC_MAX)
//     and trimmed after every write, so a single long session can't fill the
//     quota between deploys either.
//   * lb-saved is versionless, never rotated and never trimmed: it is the
//     reader's own library, written only by lib/collections.ts.
//   * /offline lives in its own precache so page traffic can never evict the
//     one response the offline fallback depends on.
const RAW_VERSION = new URLSearchParams(self.location.search).get("v") || "";
// Cache names are derived from a URL, so keep them to a sane charset/length.
const VERSION = /^[\w.-]{1,64}$/.test(RAW_VERSION) ? RAW_VERSION : "dev";
const PREFIX = "lb-";
const RUNTIME = `${PREFIX}${VERSION}-runtime`;
const STATIC = `${PREFIX}${VERSION}-static`;
const PRECACHE = `${PREFIX}${VERSION}-precache`;
const SAVED = "lb-saved"; // versionless: survives deploys, managed by the page
const KEEP = [RUNTIME, STATIC, PRECACHE, SAVED];

// Entry caps. Navigations are HTML documents (tens of KB); /_next/static/* is
// one build's JS/CSS chunks, and the cache is rotated per deploy anyway — the
// cap only has to survive one very long session.
const RUNTIME_MAX = 50;
const STATIC_MAX = 150;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(["/offline"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // Only ever delete caches this worker owns; lb-saved is in KEEP.
            .filter((k) => k.startsWith(PREFIX) && !KEEP.includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// One write at a time per cache: a page load fires a burst of asset requests,
// and overlapping trims would each walk the whole key list for nothing.
const writeChains = new Map();
function serialize(cacheName, job) {
  const tail = (writeChains.get(cacheName) || Promise.resolve()).then(job, job);
  writeChains.set(
    cacheName,
    tail.catch(() => {}),
  );
  return tail;
}

// Cache.keys() yields entries in insertion order, and put() over an existing
// entry replaces it *in place* — so deleting first is what turns that order
// into a real LRU (most recently used last). Trimming then drops from the
// front. ignoreVary keeps one entry per URL: Next varies HTML on RSC headers,
// and without it a page could bank several copies of itself.
async function cacheLru(cacheName, req, res, max) {
  const cache = await caches.open(cacheName);
  await cache.delete(req, { ignoreVary: true });
  await cache.put(req, res);
  const keys = await cache.keys();
  const excess = keys.length - max;
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((k) => cache.delete(k)));
}

// Caching is best-effort: a quota error must never reject the response we are
// already handing to the page.
function cacheWrite(cacheName, req, res, max) {
  return serialize(cacheName, () => cacheLru(cacheName, req, res, max)).catch(() => {});
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fonts/CDNs stay network
  if (url.pathname.startsWith("/api/")) return; // never cache APIs (incl. chat SSE)
  if (url.pathname.startsWith("/admin")) return; // never cache the admin

  // Content-hashed build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) event.waitUntil(cacheWrite(STATIC, req, res.clone(), STATIC_MAX));
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations: network-first with layered offline fallbacks.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) event.waitUntil(cacheWrite(RUNTIME, req, res.clone(), RUNTIME_MAX));
          return res;
        })
        .catch(async () => {
          const runtimeHit = await caches.match(req, { cacheName: RUNTIME });
          if (runtimeHit) return runtimeHit;
          const savedHit = await caches.match(req, { cacheName: SAVED });
          if (savedHit) return savedHit;
          const offline = await caches.match("/offline");
          return (
            offline ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }),
    );
  }
});
