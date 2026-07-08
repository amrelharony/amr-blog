// Biweekly newsletter digest — ported from api/newsletter-bulletin.js.
// GET = Vercel cron (CRON_SECRET / vercel-cron UA). POST = manual (NEWSLETTER_ADMIN_SECRET).
// The send pipeline now lives in lib/newsletter/send.ts so the admin console
// (/api/admin/newsletter, session-authed) reuses the exact same path.
import { NextRequest, NextResponse } from "next/server";
import { runBulletinSend } from "@/lib/newsletter/send";
import { logEvent } from "@/lib/log";
import { secretMatches, bearerToken } from "@/lib/auth/secret";

export const maxDuration = 60;

/** Run the send with start/end/error log lines so cron runs are visible. */
async function loggedSend(trigger: "cron" | "manual"): Promise<NextResponse> {
  const started = Date.now();
  logEvent("cron.bulletin.start", { trigger });
  try {
    const { status, result } = await runBulletinSend();
    logEvent("cron.bulletin.end", {
      trigger,
      ok: result.ok ?? false,
      skipped: result.skipped ?? false,
      reason: result.reason,
      articles: result.articles,
      sent: result.sent,
      remaining: result.remaining,
      durationMs: Date.now() - started,
    });
    return NextResponse.json(result, { status });
  } catch (e) {
    logEvent("cron.bulletin.error", {
      trigger,
      message: (e as Error).message,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Vercel auto-attaches `Authorization: Bearer $CRON_SECRET` to cron invocations when
  // CRON_SECRET is set. The vercel-cron User-Agent is attacker-spoofable, so it must
  // NEVER be sufficient on its own to trigger this email-dispatching send.
  if (!secretMatches(bearerToken(req.headers.get("authorization")), process.env.CRON_SECRET))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return loggedSend("cron");
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-admin-secret"), process.env.NEWSLETTER_ADMIN_SECRET))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return loggedSend("manual");
}
