// Cron: keep the Supabase project warm, auto-publish any due scheduled posts
// (publish_scheduled_posts), and revalidate the feed. Ported/extended from
// api/db-keepalive.js. Invoked by Vercel Cron (vercel.json).
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/log";
import { secretMatches, bearerToken } from "@/lib/auth/secret";
import { revalidateTagPages } from "@/lib/tag-pages";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Bound every Supabase fetch: a hung connection must not wedge the cron run
// (nothing here retries — the next scheduled invocation is the retry).
const FETCH_TIMEOUT_MS = 8_000;

// How far back step 3b looks for scheduled posts that just went live.
const SCHEDULED_TAG_WINDOW_MS = 3 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  // Require the cron secret: Vercel auto-sends `Authorization: Bearer $CRON_SECRET` on
  // scheduled invocations when CRON_SECRET is set. The vercel-cron User-Agent is
  // client-spoofable, so it is not an authentication factor.
  if (!secretMatches(bearerToken(req.headers.get("authorization")), process.env.CRON_SECRET))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();
  logEvent("cron.keepalive.start");
  const ts = new Date().toISOString();
  const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
  try {
    // 1. Ping (keep-alive)
    const ping = await fetch(`${SB_URL}/rest/v1/longform_articles?select=id&limit=1`, {
      headers: sbHeaders,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // 2. Auto-publish any scheduled posts now due
    await fetch(`${SB_URL}/rest/v1/rpc/publish_scheduled_posts`, {
      method: "POST",
      headers: sbHeaders,
      body: "{}",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => {});
    // 3. Refresh ISR so newly-published scheduled posts appear
    revalidatePath("/");
    revalidatePath("/thoughts");
    // 3b. ...including on their tag pages, which are cached for days and which
    //     nothing else revalidates for a scheduled publish. publish_scheduled_posts
    //     keeps scheduled_at, so "published, scheduled_at within the window" is
    //     the set that just went live. The window spans a few hourly sweeps (the
    //     LinkedIn action calls this hourly) so one failed run is still covered;
    //     a repeat only re-marks the same few pages stale. Best-effort.
    try {
      const since = new Date(Date.now() - SCHEDULED_TAG_WINDOW_MS).toISOString();
      const res = await fetch(
        `${SB_URL}/rest/v1/longform_articles?select=tags&published=eq.true` +
          `&scheduled_at=gte.${encodeURIComponent(since)}&scheduled_at=lte.${encodeURIComponent(ts)}&limit=50`,
        { headers: sbHeaders, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      );
      if (res.ok) {
        const rows = (await res.json()) as { tags: string[] | null }[];
        revalidateTagPages(rows.flatMap((r) => r.tags || []));
      }
    } catch {
      /* tag pages fall back to their TTL */
    }
    // 4. Prune the trending view-rollup past its 60-day window (service role —
    //    the table is RLS-locked with no policies; skip silently if unconfigured).
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (svcKey) {
      const cutoff = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
      await fetch(`${SB_URL}/rest/v1/article_view_daily?day=lt.${cutoff}`, {
        method: "DELETE",
        headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).catch(() => {});
    }

    // 5. Instant-notification sweep: cover scheduled publishes (which have no
    //    request-time trigger) and resume any half-sent runs. Fail-open — a
    //    missing migration/table just skips. Invoked hourly by the LinkedIn
    //    GitHub Action in addition to the every-3-days Vercel cron.
    let notified = 0;
    let resumed = 0;
    try {
      const { createServiceClient } = await import("@/lib/supabase/service");
      const { runArticleNotify } = await import("@/lib/newsletter/notify");
      const svc = createServiceClient();
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data: due } = await svc
        .from("longform_articles")
        .select("id,article_notification_log(id)")
        .eq("published", true)
        .gte("scheduled_at", since)
        .limit(20);
      for (const row of due ?? []) {
        const logs = (row as { article_notification_log?: { id: string }[] }).article_notification_log;
        if (!logs || logs.length === 0) {
          await runArticleNotify((row as { id: string }).id);
          notified++;
        }
      }
      // Offer both 'pending' (resume) and 'in_progress' (potentially wedged) rows;
      // runArticleNotify's resolveClaim decides whether a run is stale enough to
      // reclaim, so a fresh in_progress run is simply skipped. Without in_progress
      // here, a wedged row would never be revisited and the reclaim path is dead.
      const { data: pend } = await svc
        .from("article_notification_log")
        .select("article_id")
        .in("status", ["pending", "in_progress"])
        .limit(10);
      for (const p of pend ?? []) {
        await runArticleNotify((p as { article_id: string }).article_id);
        resumed++;
      }
    } catch {
      /* notifications are best-effort */
    }
    logEvent("cron.keepalive.end", {
      ok: ping.ok,
      pingStatus: ping.status,
      notified,
      resumed,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: ping.ok, status: ping.status, ts });
  } catch (err) {
    logEvent("cron.keepalive.error", {
      message: (err as Error).message,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: false, error: (err as Error).message, ts }, { status: 500 });
  }
}
