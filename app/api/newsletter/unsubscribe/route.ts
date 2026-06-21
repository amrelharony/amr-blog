// Newsletter unsubscribe — ported from api/newsletter-unsubscribe.js.
import { NextRequest } from "next/server";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function page(title: string, body: string) {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — Amr Elharony</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:#0a0e17;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.card{max-width:440px;text-align:center;padding:48px 32px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.03)}
.icon{font-size:48px;margin-bottom:16px}.title{font-size:22px;font-weight:700;margin-bottom:8px}.sub{font-size:14px;color:#94a3b8;line-height:1.6;margin-bottom:24px}
.btn{display:inline-block;padding:12px 28px;background:#00e1ff;color:#0a0e17;font-weight:700;font-size:13px;text-decoration:none;border-radius:8px;letter-spacing:.5px;text-transform:uppercase;border:none;cursor:pointer;font-family:inherit}</style></head><body><div class="card">${body}</div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

const invalidLink = () =>
  page("Invalid Link", `<div class="icon">⚠️</div><div class="title">Invalid Link</div><div class="sub">This unsubscribe link is missing or malformed.</div><a class="btn" href="${SITE}">Go to Blog</a>`);

// GET is a SAFE method (RFC 9110): it must NOT mutate. Email link-scanners and
// prefetchers issue automated GETs against every URL in a message, which — if GET
// performed the unsubscribe — would silently opt the recipient out. So GET only
// renders a confirmation the user must POST.
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || token.length > 500) return invalidLink();
  return page(
    "Confirm Unsubscribe",
    `<div class="icon">📭</div><div class="title">Unsubscribe?</div>
     <div class="sub">Click below to stop receiving the biweekly newsletter from Amr Elharony.</div>
     <form method="POST" action="/api/newsletter/unsubscribe">
       <input type="hidden" name="token" value="${esc(token)}">
       <button class="btn" type="submit">Confirm Unsubscribe</button>
     </form>`,
  );
}

export async function POST(req: NextRequest) {
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") || "");
  } catch {
    token = "";
  }
  if (!token || token.length > 500) return invalidLink();
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/unsubscribe_newsletter`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) throw new Error("rpc failed");
    return page("Unsubscribed", `<div class="icon">👋</div><div class="title">You've Been Unsubscribed</div><div class="sub">Sorry to see you go. You'll no longer receive the biweekly newsletter from Amr Elharony.</div><a class="btn" href="${SITE}">Visit Blog</a>`);
  } catch {
    return page("Error", `<div class="icon">⚠️</div><div class="title">Something went wrong</div><div class="sub">Please try again later.</div><a class="btn" href="${SITE}">Go to Blog</a>`);
  }
}
