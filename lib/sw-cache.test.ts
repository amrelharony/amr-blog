import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// public/sw.js shares one origin storage quota with lb-saved (the reader's
// offline articles, written by lib/collections.ts). If any cache there grows
// without a bound the browser eventually evicts the whole origin and the
// promise app/offline/page.tsx makes to the reader breaks. These tests run the
// real worker source in a fake ServiceWorkerGlobalScope and pin the eviction
// policy: caches namespaced by the ?v= build id, LRU-capped runtime/static
// caches, and lb-saved never touched.

const ORIGIN = "https://blog.test";
const SW_SOURCE = readFileSync("public/sw.js", "utf8");

interface FakeRequest {
  url: string;
  method: string;
  mode?: string;
}
interface FetchEvent {
  request: FakeRequest;
  respondWith: (r: Promise<Response> | Response) => void;
  waitUntil: (p: Promise<unknown>) => void;
}

const req = (path: string, init: Partial<FakeRequest> = {}): FakeRequest => ({
  url: path.startsWith("http") ? path : ORIGIN + path,
  method: "GET",
  ...init,
});
const nav = (path: string) => req(path, { mode: "navigate" });

/**
 * Minimal Cache/CacheStorage doubles. The one behaviour the eviction policy
 * leans on is spec'd and reproduced here: keys() yields entries in insertion
 * order, and put() over an existing entry replaces it *in place* rather than
 * moving it to the end.
 */
class FakeCache {
  entries = new Map<string, { request: FakeRequest; response: Response }>();
  async put(request: FakeRequest, response: Response) {
    const existing = this.entries.get(request.url);
    if (existing) existing.response = response.clone();
    else this.entries.set(request.url, { request, response: response.clone() });
  }
  async match(request: FakeRequest | string) {
    const url = typeof request === "string" ? ORIGIN + request : request.url;
    return this.entries.get(url)?.response.clone();
  }
  async delete(request: FakeRequest | string) {
    const url = typeof request === "string" ? ORIGIN + request : request.url;
    return this.entries.delete(url);
  }
  async keys() {
    return [...this.entries.values()].map((e) => e.request);
  }
  async addAll(urls: string[]) {
    for (const u of urls) await this.put(req(u), new Response(`precached ${u}`));
  }
}

class FakeCacheStorage {
  store = new Map<string, FakeCache>();
  async open(name: string) {
    let c = this.store.get(name);
    if (!c) this.store.set(name, (c = new FakeCache()));
    return c;
  }
  async keys() {
    return [...this.store.keys()];
  }
  async delete(name: string) {
    return this.store.delete(name);
  }
  async match(request: FakeRequest | string, opts?: { cacheName?: string }) {
    const names = opts?.cacheName ? [opts.cacheName] : [...this.store.keys()];
    for (const n of names) {
      const hit = await this.store.get(n)?.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

/** Boots the real worker source against fresh doubles. */
function bootSW(version = "abc123") {
  const listeners = new Map<string, (event: unknown) => void>();
  const caches = new FakeCacheStorage();
  let online = true;
  let status = 200;

  const scope = {
    location: { origin: ORIGIN, href: `${ORIGIN}/sw.js?v=${version}`, search: `?v=${version}` },
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fetchImpl = async (request: FakeRequest) => {
    if (!online) throw new TypeError("Failed to fetch");
    return new Response(`network ${request.url}`, { status });
  };

  vm.createContext(
    Object.assign(scope, { self: scope, caches, fetch: fetchImpl, URL, URLSearchParams, Response }),
  );
  vm.runInContext(SW_SOURCE, scope as unknown as vm.Context);

  /** Dispatches a lifecycle event and awaits everything it extended. */
  const lifecycle = async (type: "install" | "activate") => {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)?.({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  };

  /** Dispatches a fetch event; resolves to the Response, or null if the SW passed. */
  const fetchEvent = async (request: FakeRequest) => {
    const pending: Promise<unknown>[] = [];
    const handled: (Promise<Response> | Response)[] = [];
    const event: FetchEvent = {
      request,
      respondWith: (r) => {
        handled.push(r);
      },
      waitUntil: (p) => pending.push(p),
    };
    listeners.get("fetch")?.(event);
    const res = handled.length ? await handled[0] : null;
    await Promise.all(pending); // cache write + trim
    return res;
  };

  return {
    caches,
    lifecycle,
    fetchEvent,
    setOffline: (v: boolean) => {
      online = !v;
    },
    setStatus: (v: number) => {
      status = v;
    },
    urls: async (name: string) => (await (await caches.open(name)).keys()).map((k) => k.url),
  };
}

async function boot(version = "abc123") {
  const sw = bootSW(version);
  await sw.lifecycle("install");
  await sw.lifecycle("activate");
  return sw;
}

describe("sw.js cache namespacing", () => {
  it("names its caches after the ?v= build id", async () => {
    const sw = await boot("deadbeef");
    await sw.fetchEvent(nav("/p/one"));
    await sw.fetchEvent(req("/_next/static/chunks/a.js"));
    expect(await sw.caches.keys()).toEqual(
      expect.arrayContaining(["lb-deadbeef-precache", "lb-deadbeef-runtime", "lb-deadbeef-static"]),
    );
  });

  it("falls back to a fixed namespace when the build id is missing or bogus", async () => {
    for (const v of ["", "../../etc", "x".repeat(80)]) {
      const sw = await boot(v);
      expect(await sw.caches.keys()).toEqual(["lb-dev-precache"]);
    }
  });

  it("drops the previous deploy's caches on activate — including the old hand-bumped lb-v1-*", async () => {
    const sw = bootSW("v2build");
    (await sw.caches.open("lb-v1-runtime")).put(nav("/p/stale"), new Response("stale"));
    (await sw.caches.open("lb-v1-static")).put(req("/_next/static/old.js"), new Response("old"));
    (await sw.caches.open("lb-saved")).put(nav("/p/saved"), new Response("saved article"));

    await sw.lifecycle("install");
    await sw.lifecycle("activate");

    const names = await sw.caches.keys();
    expect(names).not.toContain("lb-v1-runtime");
    expect(names).not.toContain("lb-v1-static");
    expect(names).toContain("lb-saved");
  });

  it("leaves caches it does not own alone", async () => {
    const sw = bootSW();
    (await sw.caches.open("some-other-app")).put(nav("/x"), new Response("x"));
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
    expect(await sw.caches.keys()).toContain("some-other-app");
  });
});

describe("sw.js eviction", () => {
  it("caps the runtime cache and evicts least-recently-used first", async () => {
    const sw = await boot();
    for (let i = 0; i < 60; i++) await sw.fetchEvent(nav(`/p/a${i}`));

    const urls = await sw.urls("lb-abc123-runtime");
    expect(urls).toHaveLength(50);
    expect(urls).not.toContain(`${ORIGIN}/p/a0`); // oldest gone
    expect(urls).toContain(`${ORIGIN}/p/a59`); // newest kept
  });

  it("a re-visit refreshes an entry's position instead of leaving it at the front", async () => {
    const sw = await boot();
    for (let i = 0; i < 50; i++) await sw.fetchEvent(nav(`/p/b${i}`));
    await sw.fetchEvent(nav("/p/b0")); // b0 is now the most recently used
    await sw.fetchEvent(nav("/p/fresh")); // pushes one entry out

    const urls = await sw.urls("lb-abc123-runtime");
    expect(urls).toHaveLength(50);
    expect(urls).toContain(`${ORIGIN}/p/b0`);
    expect(urls).not.toContain(`${ORIGIN}/p/b1`); // the actual LRU went instead
  });

  it("caps the static cache", async () => {
    const sw = await boot();
    for (let i = 0; i < 200; i++) await sw.fetchEvent(req(`/_next/static/chunks/c${i}.js`));

    const urls = await sw.urls("lb-abc123-static");
    expect(urls).toHaveLength(150);
    expect(urls).toContain(`${ORIGIN}/_next/static/chunks/c199.js`);
  });

  it("keeps a burst of concurrent asset writes within the cap", async () => {
    const sw = await boot();
    await Promise.all(
      Array.from({ length: 200 }, (_, i) => sw.fetchEvent(req(`/_next/static/chunks/d${i}.js`))),
    );
    expect(await sw.urls("lb-abc123-static")).toHaveLength(150);
  });

  it("never trims or writes to lb-saved", async () => {
    const sw = await boot();
    const saved = await sw.caches.open("lb-saved");
    for (let i = 0; i < 80; i++) await saved.put(nav(`/p/saved${i}`), new Response(`saved ${i}`));
    for (let i = 0; i < 120; i++) await sw.fetchEvent(nav(`/p/browse${i}`));

    expect(await sw.urls("lb-saved")).toHaveLength(80);
  });

  it("keeps /offline out of reach of the trim", async () => {
    const sw = await boot();
    for (let i = 0; i < 120; i++) await sw.fetchEvent(nav(`/p/e${i}`));

    expect(await sw.urls("lb-abc123-precache")).toEqual([`${ORIGIN}/offline`]);
  });
});

describe("sw.js offline fallbacks", () => {
  it("serves a saved article when the network is down and the runtime cache missed", async () => {
    const sw = await boot();
    (await sw.caches.open("lb-saved")).put(nav("/p/saved"), new Response("saved article"));
    for (let i = 0; i < 60; i++) await sw.fetchEvent(nav(`/p/f${i}`)); // overflow the runtime cache

    sw.setOffline(true);
    const res = await sw.fetchEvent(nav("/p/saved"));
    expect(await res!.text()).toBe("saved article");
  });

  it("still serves /offline for an unknown page after heavy browsing", async () => {
    const sw = await boot();
    for (let i = 0; i < 120; i++) await sw.fetchEvent(nav(`/p/g${i}`));

    sw.setOffline(true);
    const res = await sw.fetchEvent(nav("/p/never-seen"));
    expect(await res!.text()).toContain("precached /offline");
  });

  it("prefers the runtime copy of a page it has seen", async () => {
    const sw = await boot();
    await sw.fetchEvent(nav("/p/recent"));
    sw.setOffline(true);
    const res = await sw.fetchEvent(nav("/p/recent"));
    expect(await res!.text()).toBe(`network ${ORIGIN}/p/recent`);
  });
});

describe("sw.js request filtering (unchanged behaviour)", () => {
  it("passes through non-GET, cross-origin, /api/* and /admin requests", async () => {
    const sw = await boot();
    const passthrough = [
      req("/p/one", { method: "POST", mode: "navigate" }),
      req("https://cdn.example.com/font.woff2"),
      req("/api/chat"),
      nav("/admin/articles"),
    ];
    for (const r of passthrough) expect(await sw.fetchEvent(r)).toBeNull();
    expect(await sw.caches.keys()).toEqual(["lb-abc123-precache"]);
  });

  it("does not cache non-ok responses", async () => {
    const sw = await boot();
    sw.setStatus(404);
    await sw.fetchEvent(nav("/p/gone"));
    await sw.fetchEvent(req("/_next/static/chunks/missing.js"));

    expect(await sw.caches.keys()).toEqual(["lb-abc123-precache"]);
  });
});
