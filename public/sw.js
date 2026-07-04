// Service worker — hand-rolled per the Next 16 PWA guide (next-pwa/Serwist are
// webpack-based; this build uses Turbopack). Strategy:
//   * never intercept non-GET, /api/*, /admin/*, or cross-origin requests
//   * navigations: network-first → runtime cache → lb-saved (reader's saved
//     articles, populated by lib/collections.ts) → /offline fallback
//   * /_next/static/* (content-hashed): cache-first
// Bump V to invalidate every cache on deploy of a new SW.
const V = "lb-v1";
const RUNTIME = `${V}-runtime`;
const STATIC = `${V}-static`;
const SAVED = "lb-saved"; // versionless: survives deploys, managed by the page

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(RUNTIME)
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
            .filter((k) => k !== RUNTIME && k !== STATIC && k !== SAVED)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

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
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
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
          if (res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
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
