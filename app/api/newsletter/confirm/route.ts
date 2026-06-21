// Newsletter double-opt-in — ported from api/newsletter-confirm.js.
// GET: user clicked the confirm link. POST: frontend asks us to send the confirm email (Resend).
import { NextRequest, NextResponse } from "next/server";

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
a.btn{display:inline-block;padding:12px 28px;background:#00e1ff;color:#0a0e17;font-weight:700;font-size:13px;text-decoration:none;border-radius:8px;letter-spacing:.5px;text-transform:uppercase}</style></head><body><div class="card">${body}</div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
async function rpc(fn: string, params: unknown) {
  return fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || token.length > 500 || !/^[\w-]+$/.test(token)) {
    return page("Invalid Link", `<div class="icon">⚠️</div><div class="title">Invalid Link</div><div class="sub">This confirmation link is missing or malformed.</div><a class="btn" href="${SITE}">Go to Blog</a>`);
  }
  const res = await rpc("confirm_newsletter", { p_token: token });
  // confirm_newsletter returns a boolean — false for an unknown/expired/used token —
  // and PostgREST replies HTTP 200 even when it returns false, so res.ok alone isn't a
  // success signal. Treat ONLY an explicit `false` as failure so any other return shape
  // can't regress valid confirmations.
  let confirmed = res.ok;
  if (res.ok) {
    try {
      if ((await res.json()) === false) confirmed = false;
    } catch {}
  }
  if (!confirmed) {
    return page("Invalid or Expired", `<div class="icon">⚠️</div><div class="title">Invalid or Expired Link</div><div class="sub">This confirmation link may have expired. Please subscribe again.</div><a class="btn" href="${SITE}">Subscribe Again</a>`);
  }
  return page("Subscription Confirmed", `<div class="icon">✅</div><div class="title">You're In!</div><div class="sub">Your subscription is confirmed. You'll receive a biweekly digest of new articles from Amr Elharony.</div><a class="btn" href="${SITE}">Read Articles</a>`);
}

export async function POST(req: NextRequest) {
  try {
    const { email, token } = await req.json();
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof token !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(token)
    ) {
      return NextResponse.json({ error: "Invalid email or token" }, { status: 400 });
    }
    const validateRes = await rpc("validate_pending_subscription", { p_email: email, p_token: token });
    if (!validateRes.ok) return NextResponse.json({ error: "Validation failed" }, { status: 502 });
    if ((await validateRes.json()) !== true) return NextResponse.json({ ok: true }); // indistinguishable

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return NextResponse.json({ error: "Email service not configured" }, { status: 500 });

    const confirmUrl = `${SITE}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Amr Elharony <noreply@updates.amrelharony.com>",
        to: [email],
        subject: "Confirm your subscription — Amr Elharony",
        html: confirmEmail(confirmUrl),
      }),
    });
    if (!emailRes.ok) return NextResponse.json({ error: "Failed to send email" }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function confirmEmail(confirmUrl: string) {
  const sans = "'Inter',system-ui,-apple-system,sans-serif";
  const mono = "'JetBrains Mono',monospace";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#06080f;font-family:${sans}">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#06080f"><tr><td align="center" style="padding:56px 16px">
<table width="520" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;width:100%;background:#0c1018;border-radius:18px;border:1px solid rgba(0,225,255,.15)"><tr><td style="padding:48px 40px;text-align:center">
<h1 style="color:#f0f2f5;font-size:23px;font-weight:800;margin:0 0 10px">Confirm Your Subscription</h1>
<div style="width:60px;height:3px;border-radius:3px;background:linear-gradient(90deg,#00e1ff,#6366f1,#a855f7);margin:0 auto 26px"></div>
<p style="color:#8a95a8;font-size:14px;line-height:1.75;margin:0 0 32px">You requested to join <strong style="color:#cbd5e1">Amr Elharony's</strong> biweekly digest. Click below to confirm and start receiving curated article summaries.</p>
<a href="${confirmUrl}" style="display:inline-block;padding:15px 44px;color:#06080f;font-weight:700;font-size:12px;text-decoration:none;letter-spacing:1.5px;text-transform:uppercase;font-family:${mono};border-radius:10px;background:linear-gradient(135deg,#00e1ff,#6366f1)">CONFIRM SUBSCRIPTION</a>
<p style="color:#475569;font-size:11px;margin:28px 0 0">If you didn't request this, you can safely ignore this email.</p>
</td></tr></table>
<p style="color:#334155;font-size:11px;margin:24px 0 0;font-family:${mono};letter-spacing:1px">© ${new Date().getFullYear()} AMR ELHARONY</p>
</td></tr></table></body></html>`;
}
