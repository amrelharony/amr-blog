// Admin newsletter console backend (session-authed: auth.uid() === ADMIN_UUID).
//   GET  → { logs, preview }  — send history + what the next digest would contain
//   POST → triggers a send now, reusing the SAME runBulletinSend() as the cron.
import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { runBulletinSend, previewBulletin } from "@/lib/newsletter/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!(await isAdminUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = await createClient();
  try {
    const [logsRes, preview] = await Promise.all([
      sb.rpc("get_recent_bulletins", { p_limit: 50 }),
      previewBulletin(),
    ]);
    return NextResponse.json({ logs: logsRes.data || [], preview });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST() {
  if (!(await isAdminUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { status, result } = await runBulletinSend();
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
