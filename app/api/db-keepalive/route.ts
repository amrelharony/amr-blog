// Cron: keep the Supabase project warm, auto-publish any due scheduled posts
// (publish_scheduled_posts), and revalidate the feed. Ported/extended from
// api/db-keepalive.js. Invoked by Vercel Cron (vercel.json).
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const isVercelCron = ua.startsWith("vercel-cron/");
  const hasSecret = !!cronSecret && auth === `Bearer ${cronSecret}`;
  // When a CRON_SECRET is configured, require it — the User-Agent alone is spoofable.
  // (Vercel Cron sends the Bearer secret automatically when CRON_SECRET is set.)
  const ok = cronSecret ? hasSecret : isVercelCron;
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    return NextResponse.json({ ok: ping.ok, status: ping.status, ts });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message, ts }, { status: 500 });
  }
}
