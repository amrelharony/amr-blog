import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The public client's timeout is what keeps a Supabase outage from holding a
// render open for minutes (lib/supabase/public.ts). This drives the real client
// against a local server that never answers, and pins two things: the read
// gives up near the timeout, and postgrest does NOT retry it (a retried timeout
// was 4 requests and ~39 s per read).
describe("createPublicClient timeout", () => {
  let server: Server;
  let hits = 0;
  let origin = "";

  beforeAll(async () => {
    server = createServer(() => {
      hits++; // never respond
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.unstubAllEnvs();
  });

  async function loadClientModule(phase?: string) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", origin);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("NEXT_PHASE", phase ?? "");
    return import("@/lib/supabase/public");
  }

  it("defaults to 8 s at runtime", async () => {
    const mod = await loadClientModule();
    expect(mod.PUBLIC_READ_TIMEOUT_MS).toBe(8_000);
  });

  it("allows 30 s during next build", async () => {
    const mod = await loadClientModule("phase-production-build");
    expect(mod.PUBLIC_READ_TIMEOUT_MS).toBe(30_000);
  });

  it("fails a hung read after the timeout, once, without retrying", async () => {
    const { createPublicClient } = await loadClientModule();
    hits = 0;
    const started = Date.now();

    const { data, error } = await createPublicClient(250)
      .from("longform_articles")
      .select("slug")
      .eq("slug", "x")
      .maybeSingle();

    const elapsed = Date.now() - started;
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    // One attempt: no 1 s / 2 s / 4 s retry backoff, and only one request.
    expect(elapsed).toBeLessThan(900);
    // Give a retry, if there were one, time to reach the server before counting.
    await new Promise((r) => setTimeout(r, 1_300));
    expect(hits).toBe(1);
  });
});
