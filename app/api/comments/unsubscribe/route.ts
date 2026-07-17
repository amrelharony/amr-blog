// One-click unsubscribe for comment-reply notifications (link in the email).
// Token-addressed: only someone holding the emailed token can flip the flag.
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(title: string, body: string, status: number) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#06080f;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">
<div style="max-width:440px;padding:0 24px">${body}</div>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

const btn =
  "display:inline-block;padding:12px 28px;background:#00e1ff;color:#0a0e17;font-weight:700;font-size:13px;border:none;cursor:pointer;border-radius:8px;font-family:inherit";

// GET is a SAFE method (RFC 9110): it must NOT mutate. Email link-scanners and
// prefetchers (Outlook SafeLinks, Mimecast, Gmail) issue automated GETs against every
// URL in a message, which — if GET performed the unsubscribe — would silently opt the
// recipient out on delivery. So GET only renders a confirmation the user must POST.
export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") || "").trim();
  if (!UUID_RE.test(token)) return page("Invalid link", "<h1 style='font-size:22px'>Invalid link</h1><p style='color:#94a3b8'>This unsubscribe link is not valid.</p>", 400);
  return page(
    "Confirm unsubscribe",
    `<h1 style="font-size:22px">Unsubscribe?</h1>
     <p style="color:#94a3b8">Click below to stop receiving reply notifications for that comment.</p>
     <form method="POST" action="/api/comments/unsubscribe">
       <input type="hidden" name="token" value="${esc(token)}">
       <button type="submit" style="${btn}">Confirm unsubscribe</button>
     </form>`,
    200,
  );
}

export async function POST(req: NextRequest) {
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") || "").trim();
  } catch {
    token = "";
  }
  if (!UUID_RE.test(token)) return page("Invalid link", "<h1 style='font-size:22px'>Invalid link</h1><p style='color:#94a3b8'>This unsubscribe link is not valid.</p>", 400);

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
      return page("Already done", "<h1 style='font-size:22px'>Already done</h1><p style='color:#94a3b8'>This link was already used or has expired.</p>", 200);
    }
    return page("Unsubscribed", "<h1 style='font-size:22px'>Unsubscribed</h1><p style='color:#94a3b8'>You won't get reply notifications for that comment anymore.</p>", 200);
  } catch (e) {
    logEvent("comments.unsubscribe.failed", { message: e instanceof Error ? e.message : String(e) });
    return page("Something went wrong", "<h1 style='font-size:22px'>Something went wrong</h1><p style='color:#94a3b8'>Please try the link again in a moment.</p>", 500);
  }
}
