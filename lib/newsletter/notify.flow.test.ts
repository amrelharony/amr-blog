import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks (hoisted so the factories can see them) -------------------------
const h = vi.hoisted(() => ({
  sb: null as unknown, // current scripted supabase stub
  events: [] as Array<[string, Record<string, unknown> | undefined]>,
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => h.sb }));
vi.mock("@/lib/log", () => ({
  logEvent: (e: string, f?: Record<string, unknown>) => h.events.push([e, f]),
}));

import { runArticleNotify, runReplyNotify } from "@/lib/newsletter/notify";

type Resp = { data: unknown; error: unknown };

/**
 * Chainable + thenable supabase stub: every builder method returns the builder,
 * and each terminated chain (awaited directly, or via .maybeSingle()) pops one
 * response from the scripted queue in order. Records update() payloads.
 */
function makeStub(responses: Resp[]) {
  let i = 0;
  const updates: unknown[] = [];
  const next = (): Resp => responses[i++] ?? { data: null, error: null };
  const b: Record<string, unknown> = {};
  const passthrough = ["from", "select", "insert", "upsert", "delete", "eq", "is", "in", "or", "gte", "lt", "order", "range"];
  for (const m of passthrough) b[m] = (...args: unknown[]) => {
    if (m === "upsert" || m === "delete") updates.push(args[0]);
    return b;
  };
  b.update = (payload: unknown) => {
    updates.push(payload);
    return b;
  };
  b.maybeSingle = () => Promise.resolve(next());
  b.then = (res: (v: Resp) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(next()).then(res, rej);
  return { sb: b, updates, consumed: () => i };
}

function fetchOk() {
  return { ok: true, status: 200 } as Response;
}
function bodies(fetchMock: ReturnType<typeof vi.fn>): Array<{ to: string[] }> {
  return fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
}

let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.events = [];
  vi.stubEnv("RESEND_API_KEY", "k");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x");
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  errSpy.mockRestore();
});

const article = { id: "a1", title: "T", slug: "t", excerpt: "e", tldr: null, tags: [], created_at: "2026-07-01T00:00:00Z", published: true };
const recips = (n: number) => Array.from({ length: n }, (_, k) => ({ email: `u${k}@x`, unsubscribe_token: `tok${k}` }));

describe("runArticleNotify — claim & error handling", () => {
  it("a claim-upsert DB error sends zero emails and fails open (does not throw)", async () => {
    const fetchMock = vi.fn(async () => fetchOk());
    vi.stubGlobal("fetch", fetchMock);
    const stub = makeStub([
      { data: article, error: null }, // article select
      { data: null, error: { message: "db down" } }, // claim upsert -> error
    ]);
    h.sb = stub.sb;

    await expect(runArticleNotify("a1")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    // supabase-js errors are plain objects (not Error), so the fail-open logger
    // passes the object through — still observable/greppable.
    expect(errSpy).toHaveBeenCalledWith("[notify] fail-open:", "a1", { message: "db down" });
  });

  it("fresh claim: sends the whole small list and logs the batch summary", async () => {
    const fetchMock = vi.fn(async () => fetchOk());
    vi.stubGlobal("fetch", fetchMock);
    h.sb = makeStub([
      { data: article, error: null },
      { data: { id: "log1", status: "in_progress" }, error: null }, // claimed
      { data: recips(3), error: null }, // recipients page
      { data: null, error: null }, // final update
    ]).sb;

    await runArticleNotify("a1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const batch = h.events.find((e) => e[0] === "notify.batch");
    expect(batch?.[1]).toMatchObject({ articleId: "a1", offset: 0, size: 3, sent: 3, failed: 0 });
  });

  it("counts ok / non-ok / rejected sends in the batch summary", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockRejectedValueOnce(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    h.sb = makeStub([
      { data: article, error: null },
      { data: { id: "log1", status: "in_progress" }, error: null },
      { data: recips(3), error: null },
      { data: null, error: null },
    ]).sb;

    await runArticleNotify("a1");
    const batch = h.events.find((e) => e[0] === "notify.batch");
    expect(batch?.[1]).toMatchObject({ sent: 1, failed: 2 });
  });

  it("a failed final update is retried but emails are NOT re-sent within the run", async () => {
    const fetchMock = vi.fn(async () => fetchOk());
    vi.stubGlobal("fetch", fetchMock);
    h.sb = makeStub([
      { data: article, error: null },
      { data: { id: "log1", status: "in_progress" }, error: null },
      { data: recips(3), error: null },
      { data: null, error: { message: "update lost 1" } }, // final update attempt 1
      { data: null, error: { message: "update lost 2" } }, // attempt 2
      { data: null, error: { message: "update lost 3" } }, // attempt 3 -> exhausted
    ]).sb;

    await runArticleNotify("a1");
    expect(fetchMock).toHaveBeenCalledTimes(3); // sent once, not 3x9
    expect(errSpy).toHaveBeenCalledWith("[notify] fail-open:", "a1", { message: "update lost 3" });
  }, 10_000);
});

describe("runArticleNotify — resume & reclaim", () => {
  it("reclaims a stale in_progress run and resumes at the correct offset", async () => {
    const fetchMock = vi.fn(async () => fetchOk());
    vi.stubGlobal("fetch", fetchMock);
    const staleHeartbeat = new Date(Date.now() - 3 * 3_600_000).toISOString();
    h.sb = makeStub([
      { data: article, error: null },
      { data: null, error: null }, // claim upsert -> lost race (conflict, no row)
      { data: { id: "log1", status: "in_progress", recipient_count: 250, batch_remaining: 160, sent_at: staleHeartbeat, created_at: staleHeartbeat }, error: null },
      { data: { id: "log1" }, error: null }, // reclaim take -> won
      { data: recips(250), error: null }, // recipients page
      { data: null, error: null }, // final update
    ]).sb;

    await runArticleNotify("a1");
    const sentTo = bodies(fetchMock).map((b) => b.to[0]);
    expect(sentTo).toHaveLength(90); // batchWindow(250, 160, 90) -> offset 90, size 90
    expect(sentTo[0]).toBe("u90@x");
    expect(sentTo[89]).toBe("u179@x");
  });

  it("skips entirely when the reclaim race is lost (guarded update returns no row)", async () => {
    const fetchMock = vi.fn(async () => fetchOk());
    vi.stubGlobal("fetch", fetchMock);
    const staleHeartbeat = new Date(Date.now() - 3 * 3_600_000).toISOString();
    h.sb = makeStub([
      { data: article, error: null },
      { data: null, error: null }, // lost claim race
      { data: { id: "log1", status: "in_progress", recipient_count: 250, batch_remaining: 160, sent_at: staleHeartbeat }, error: null },
      { data: null, error: null }, // reclaim take -> lost
    ]).sb;

    await runArticleNotify("a1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("runReplyNotify — claim error vs clean conflict", () => {
  const base = [
    { data: { id: "r1", article_id: "a1", parent_id: "p1", author_id: "B", author_name: "Eve", content: "reply", status: "approved" }, error: null },
    { data: { id: "p1", author_id: "A", content: "parent", status: "approved" }, error: null },
    { data: { email: "sub@x", token: "tk", unsubscribed_at: null }, error: null },
  ];

  it("a claim DB error sends no email and fails open", async () => {
    const fetchMock = vi.fn(async () => fetchOk());
    vi.stubGlobal("fetch", fetchMock);
    h.sb = makeStub([...base, { data: null, error: { message: "claim boom" } }]).sb;

    await runReplyNotify("r1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith("[reply-notify] fail-open:", "r1", { message: "claim boom" });
  });

  it("a clean conflict (already sent) returns silently, no email, no error log", async () => {
    const fetchMock = vi.fn(async () => fetchOk());
    vi.stubGlobal("fetch", fetchMock);
    h.sb = makeStub([...base, { data: null, error: null }]).sb; // conflict, no row

    await runReplyNotify("r1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });
});
