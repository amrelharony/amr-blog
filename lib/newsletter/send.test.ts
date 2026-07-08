import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Capture logEvent (send.ts is otherwise pure; the route does the rest of logging).
const h = vi.hoisted(() => ({ events: [] as Array<[string, Record<string, unknown> | undefined]> }));
vi.mock("@/lib/log", () => ({ logEvent: (e: string, f?: Record<string, unknown>) => h.events.push([e, f]) }));

const SB = "https://sb.test";

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

type Handler = [string, Response | (() => Response)];
function routedFetch(handlers: Handler[]) {
  return vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith("https://api.resend.com")) return jsonRes({ id: "e" }); // every send OK
    for (const [frag, resp] of handlers) {
      if (u.includes(frag)) return typeof resp === "function" ? resp() : resp;
    }
    throw new Error("unrouted fetch: " + u);
  });
}

// SB_URL/SB_KEY are module-level consts read at import — set env, then dynamic-import fresh.
async function loadRun() {
  vi.resetModules();
  return (await import("@/lib/newsletter/send")).runBulletinSend;
}

const handlersWith = (updateResp: Response | (() => Response)): Handler[] => [
  ["/rpc/claim_pending_bulletin", jsonRes([])], // no pending run → fresh send
  ["/rpc/get_last_bulletin", jsonRes([])], // → default 14-day window
  ["/rpc/get_bulletin_articles", jsonRes([{ title: "A", slug: "a", excerpt: null, cover_image: null, created_at: "2026-07-01T00:00:00Z", tags: [] }])],
  ["/rpc/get_bulletin_subscribers", jsonRes([{ email: "s1@x", unsubscribe_token: "t1", job_title: null }, { email: "s2@x", unsubscribe_token: "t2", job_title: null }])],
  ["/rpc/create_bulletin_log", jsonRes("log1")],
  ["/rpc/update_bulletin_log", updateResp],
];

beforeEach(() => {
  h.events = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = SB;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  process.env.RESEND_API_KEY = "k";
  process.env.NEXT_PUBLIC_SITE_URL = "https://x";
});
afterEach(() => vi.unstubAllGlobals());

describe("runBulletinSend — update_bulletin_log resilience", () => {
  it("retries a transient update failure and still returns ok", async () => {
    let updateCalls = 0;
    const fetchMock = routedFetch(
      handlersWith(() => {
        updateCalls++;
        return updateCalls === 1 ? jsonRes({ message: "transient" }, false, 503) : jsonRes(true);
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const runBulletinSend = await loadRun();
    const { status, result } = await runBulletinSend();

    expect(status).toBe(200);
    expect(result).toMatchObject({ ok: true, sent: 2, remaining: 0 });
    expect(updateCalls).toBe(2); // failed once, succeeded on retry
    expect(h.events.find((e) => e[0] === "bulletin.update_log_failed")).toBeUndefined();
  }, 10_000);

  it("logs and rethrows when the update fails persistently (emails already out)", async () => {
    const fetchMock = routedFetch(handlersWith(() => jsonRes({ message: "down" }, false, 500)));
    vi.stubGlobal("fetch", fetchMock);

    const runBulletinSend = await loadRun();
    await expect(runBulletinSend()).rejects.toThrow(/update_bulletin_log/);

    const logged = h.events.find((e) => e[0] === "bulletin.update_log_failed");
    expect(logged).toBeTruthy();
    expect(logged?.[1]).toMatchObject({ logId: "log1", sent: 2 });
  }, 10_000);
});
