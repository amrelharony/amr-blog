// One-click unsubscribe for comment-reply notifications (link in the email).
// Token-addressed: only someone holding the emailed token can flip the flag.
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, body: string, status: number) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#06080f;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">
<div><h1 style="font-size:22px">${title}</h1><p style="color:#94a3b8">${body}</p></div>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") || "").trim();
  if (!UUID_RE.test(token)) return page("Invalid link", "This unsubscribe link is not valid.", 400);

  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("comment_subscriptions")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("token", token)
      .is("unsubscribed_at", null)
      .select("id")
      .maybeSingle();
    if (!data) {
      return page("Already done", "This link was already used or has expired.", 200);
    }
    return page("Unsubscribed", "You won't get reply notifications for that comment anymore.", 200);
  } catch {
    return page("Something went wrong", "Please try the link again in a moment.", 500);
  }
}
