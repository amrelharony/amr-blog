// Biweekly newsletter digest — ported from api/newsletter-bulletin.js.
// GET = Vercel cron (CRON_SECRET / vercel-cron UA). POST = manual (NEWSLETTER_ADMIN_SECRET).
// The send pipeline now lives in lib/newsletter/send.ts so the admin console
// (/api/admin/newsletter, session-authed) reuses the exact same path.
import { NextRequest, NextResponse } from "next/server";
import { runBulletinSend } from "@/lib/newsletter/send";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel auto-attaches `Authorization: Bearer $CRON_SECRET` to cron invocations when
  // CRON_SECRET is set. The vercel-cron User-Agent is attacker-spoofable, so it must
  // NEVER be sufficient on its own to trigger this email-dispatching send.
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { status, result } = await runBulletinSend();
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.NEWSLETTER_ADMIN_SECRET;
  if (!secret || req.headers.get("x-admin-secret") !== secret)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { status, result } = await runBulletinSend();
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
