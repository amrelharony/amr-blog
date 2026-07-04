// Cron: keep the Supabase project warm, auto-publish any due scheduled posts
// (publish_scheduled_posts), and revalidate the feed. Ported/extended from
// api/db-keepalive.js. Invoked by Vercel Cron (vercel.json).
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  // Require the cron secret: Vercel auto-sends `Authorization: Bearer $CRON_SECRET` on
  // scheduled invocations when CRON_SECRET is set. The vercel-cron User-Agent is
  // client-spoofable, so it is not an authentication factor.
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ts = new Date().toISOString();
  const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
  try {
    // 1. Ping (keep-alive)
    const ping = await fetch(`${SB_URL}/rest/v1/longform_articles?select=id&limit=1`, { headers: sbHeaders });
    // 2. Auto-publish any scheduled posts now due
    await fetch(`${SB_URL}/rest/v1/rpc/publish_scheduled_posts`, { method: "POST", headers: sbHeaders, body: "{}" }).catch(() => {});
    // 3. Refresh ISR so newly-published scheduled posts appear
    revalidatePath("/");
    revalidatePath("/thoughts");
    // 4. Prune the trending view-rollup past its 60-day window (service role —
    //    the table is RLS-locked with no policies; skip silently if unconfigured).
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (svcKey) {
      const cutoff = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
      await fetch(`${SB_URL}/rest/v1/article_view_daily?day=lt.${cutoff}`, {
        method: "DELETE",
        headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
      }).catch(() => {});
    }

    // 5. Instant-notification sweep: cover scheduled publishes (which have no
    //    request-time trigger) and resume any half-sent runs. Fail-open — a
    //    missing migration/table just skips. Invoked hourly by the LinkedIn
    //    GitHub Action in addition to the every-3-days Vercel cron.
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
        if (!logs || logs.length === 0) await runArticleNotify((row as { id: string }).id);
      }
      const { data: pend } = await svc
        .from("article_notification_log")
        .select("article_id")
        .eq("status", "pending")
        .limit(10);
      for (const p of pend ?? []) await runArticleNotify((p as { article_id: string }).article_id);
    } catch {
      /* notifications are best-effort */
    }
    return NextResponse.json({ ok: ping.ok, status: ping.status, ts });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message, ts }, { status: 500 });
  }
}
