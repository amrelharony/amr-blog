// Dependency health probe.
//  - Unauthenticated: `{ ok, ts }` only — `ok` reflects Supabase (the sole hard
//    dependency; every other integration is fail-open). No service names, env
//    state, or upstream URLs leak, and no optional-service probes run, so the
//    public endpoint can't be used to make this server poke OpenClaw.
//  - With `Authorization: Bearer $CRON_SECRET` (same secret the crons use — no
//    new env var): a full per-dependency breakdown plus the env report from
//    lib/env.ts, for post-deploy and rollout verification.
import { NextRequest, NextResponse } from "next/server";
import { openclawConfigured } from "@/lib/ai/openclaw";
import { checkEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 3_000;
const NO_STORE = { "Cache-Control": "no-store" };

interface Probe {
  ok: boolean;
  configured?: boolean;
  reachable?: boolean;
  status?: number;
  ms?: number;
}

async function probeSupabase(): Promise<Probe> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, configured: false };
  const started = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/longform_articles?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return { ok: res.ok, configured: true, status: res.status, ms: Date.now() - started };
  } catch {
    return { ok: false, configured: true, ms: Date.now() - started };
  }
}

async function probeOpenclaw(): Promise<Probe> {
  const configured = openclawConfigured();
  const url = process.env.OPENCLAW_URL || "https://chat.amrelharony.com/v1/chat/completions";
  try {
    // No Authorization header: ANY HTTP status (404/405 included) proves the
    // host answers, without spending tokens or putting the key on the wire.
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return { ok: configured, configured, reachable: true, status: res.status };
  } catch {
    return { ok: false, configured, reachable: false };
  }
}

async function probeEmbed(): Promise<Probe> {
  const configured = Boolean(process.env.EMBED_FN_URL && process.env.EMBED_FN_SECRET);
  if (!configured) return { ok: false, configured };
  try {
    // Deliberately WITHOUT the secret: a 400/401 proves the function is
    // deployed and enforcing auth, and never runs the model.
    const res = await fetch(process.env.EMBED_FN_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "" }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return { ok: true, configured, reachable: true, status: res.status };
  } catch {
    return { ok: false, configured, reachable: false };
  }
}

export async function GET(req: NextRequest) {
  const ts = new Date().toISOString();

  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const authed = Boolean(cronSecret) && auth === `Bearer ${cronSecret}`;

  if (!authed) {
    const supabase = await probeSupabase();
    return NextResponse.json({ ok: supabase.ok, ts }, { status: supabase.ok ? 200 : 503, headers: NO_STORE });
  }

  const [supabase, openclaw, embed] = await Promise.all([probeSupabase(), probeOpenclaw(), probeEmbed()]);
  const resend: Probe = { ok: Boolean(process.env.RESEND_API_KEY), configured: Boolean(process.env.RESEND_API_KEY) };
  const ok = supabase.ok; // degraded optional services don't flip overall health
  return NextResponse.json(
    { ok, ts, checks: { supabase, openclaw, embed, resend }, env: checkEnv() },
    { status: ok ? 200 : 503, headers: NO_STORE },
  );
}
