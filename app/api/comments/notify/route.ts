// Fired (fire-and-forget) by the comment form right after posting a reply.
// Anon-callable by design, but abuse-proof: the server verifies the reply is a
// real, approved child of a subscribed parent, and the send-once claim in
// comment_reply_notification_log means repeat calls (or races) do nothing.
// All heavy lifting is in runReplyNotify (service role, fail-open).
import { NextRequest } from "next/server";
import { after } from "next/server";
import { runReplyNotify } from "@/lib/newsletter/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let id = "";
  try {
    const body = await req.json();
    id = typeof body?.comment_id === "string" ? body.comment_id.trim() : "";
  } catch {
    /* fall through */
  }
  if (!UUID_RE.test(id)) return Response.json({ ok: false }, { status: 400 });

  after(() => runReplyNotify(id));
  // Always 202 — whether a mail goes out is intentionally opaque to callers.
  return Response.json({ ok: true }, { status: 202 });
}
