// Biweekly newsletter digest — ported from api/newsletter-bulletin.js.
// GET = Vercel cron (CRON_SECRET / vercel-cron UA). POST = manual (NEWSLETTER_ADMIN_SECRET).
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";
const BATCH = 90;

interface Article {
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  created_at: string;
  tags: string[] | null;
}
interface Subscriber {
  email: string;
  unsubscribe_token: string;
  job_title: string | null;
}

function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function rpc<T>(fn: string, params?: unknown): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(params || {}),
  });
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function send(req: NextRequest) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  type Batch = { id: string; recipient_count: number; batch_remaining: number; articles_since: string };
  const claimed = await rpc<Batch[]>("claim_pending_bulletin", {});
  const pending = Array.isArray(claimed) && claimed.length ? claimed[0] : null;

  let articlesSince: string;
  if (pending) articlesSince = pending.articles_since;
  else {
    const last = await rpc<{ sent_at: string }[]>("get_last_bulletin", { p_status: "sent" });
    articlesSince = Array.isArray(last) && last.length ? last[0].sent_at : new Date(Date.now() - 14 * 86400000).toISOString();
  }

  const articles = await rpc<Article[]>("get_bulletin_articles", { p_since: articlesSince });
  if (!Array.isArray(articles) || articles.length === 0)
    return NextResponse.json({ ok: true, skipped: true, reason: "No new articles" });

  const subscribers = await rpc<Subscriber[]>("get_bulletin_subscribers");
  if (!Array.isArray(subscribers) || subscribers.length === 0)
    return NextResponse.json({ ok: true, skipped: true, reason: "No confirmed subscribers" });

  let offset = 0;
  let logId: string | null = null;
  if (pending) {
    offset = pending.recipient_count - pending.batch_remaining;
    logId = pending.id;
  }
  const batch = subscribers.slice(offset, offset + BATCH);
  const remaining = subscribers.length - offset - batch.length;

  let sent = 0;
  for (const sub of batch) {
    const unsubUrl = `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(sub.unsubscribe_token)}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Amr Elharony <noreply@updates.amrelharony.com>",
        to: [sub.email],
        subject: `${articles.length} New Article${articles.length !== 1 ? "s" : ""} — Biweekly Digest`,
        html: bulletinHTML(articles, unsubUrl),
      }),
    });
    if (res.ok) sent++;
  }

  if (!logId) {
    try {
      logId = await rpc<string>("create_bulletin_log", {
        p_article_count: articles.length,
        p_recipient_count: subscribers.length,
        p_batch_remaining: Math.max(0, remaining),
        p_articles_since: articlesSince,
        p_status: "in_progress",
      });
    } catch (e) {
      if (/duplicate key|unique constraint|idx_bulletin_in_progress/i.test(String((e as Error).message)))
        return NextResponse.json({ ok: true, skipped: true, reason: "Another send in progress" });
      throw e;
    }
  }
  await rpc("update_bulletin_log", { p_id: logId, p_batch_remaining: Math.max(0, remaining), p_status: remaining > 0 ? "pending" : "sent" });

  return NextResponse.json({ ok: true, articles: articles.length, sent, totalSubscribers: subscribers.length, remaining: Math.max(0, remaining) });
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const auth = req.headers.get("authorization") || "";
  if (!(ua.startsWith("vercel-cron/") || (cronSecret && auth === `Bearer ${cronSecret}`)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return await send(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.NEWSLETTER_ADMIN_SECRET;
  if (!secret || req.headers.get("x-admin-secret") !== secret)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return await send(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function bulletinHTML(articles: Article[], unsubUrl: string) {
  const mono = "'JetBrains Mono',monospace";
  const sans = "'Inter',system-ui,-apple-system,sans-serif";
  const cards = articles
    .map((a) => {
      const date = new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const tags = (a.tags || [])
        .slice(0, 3)
        .map(
          (t) =>
            `<span style="display:inline-block;padding:3px 10px;background:rgba(0,225,255,0.06);color:#00e1ff;border-radius:20px;font-size:10px;font-family:${mono};margin-right:6px;border:1px solid rgba(0,225,255,0.1)">${esc(t)}</span>`,
        )
        .join("");
      const link = `${SITE}/p/${encodeURIComponent(a.slug)}`;
      return `<tr><td style="padding:0 0 24px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0c1018;border-radius:15px;overflow:hidden;border:1px solid rgba(0,225,255,0.15)">
          <tr><td style="padding:24px 28px">
            <div style="font-size:11px;color:#64748b;font-family:${mono};letter-spacing:0.5px;padding-bottom:12px">◆ ${date}</div>
            <h2 style="margin:0 0 10px;line-height:1.4"><a href="${link}" style="color:#f0f2f5;font-size:18px;font-weight:700;text-decoration:none;font-family:${sans}">${esc(a.title)}</a></h2>
            ${a.excerpt ? `<p style="color:#8a95a8;font-size:13px;line-height:1.7;margin:0 0 16px;font-family:${sans}">${esc(a.excerpt.slice(0, 200))}${a.excerpt.length > 200 ? "…" : ""}</p>` : ""}
            ${tags ? `<div style="margin-bottom:18px">${tags}</div>` : ""}
            <a href="${link}" style="display:inline-block;padding:8px 18px;color:#00e1ff;font-size:11px;font-weight:700;text-decoration:none;font-family:${mono};letter-spacing:0.8px;background:rgba(0,225,255,0.06);border-radius:6px;border:1px solid rgba(0,225,255,0.1)">READ MORE →</a>
          </td></tr>
        </table>
      </td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06080f;font-family:${sans}">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#06080f"><tr><td align="center" style="padding:48px 16px 40px">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%">
  <tr><td style="padding:0 0 36px;text-align:center">
    <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-family:${mono};letter-spacing:2px;text-transform:uppercase">BIWEEKLY DIGEST</p>
    <h1 style="margin:0 0 8px;color:#f0f2f5;font-size:26px;font-weight:800;font-family:${sans}">Your Latest Articles</h1>
    <p style="margin:0 0 22px;color:#64748b;font-size:13px;font-family:${mono}">${articles.length} article${articles.length !== 1 ? "s" : ""}</p>
    <div style="width:80px;height:3px;border-radius:3px;background:linear-gradient(90deg,#00e1ff,#6366f1,#a855f7);margin:0 auto"></div>
  </td></tr>
  ${cards}
  <tr><td style="text-align:center;padding:12px 0 40px">
    <a href="${SITE}/" style="display:inline-block;padding:15px 40px;color:#06080f;font-weight:700;font-size:12px;text-decoration:none;letter-spacing:1.5px;text-transform:uppercase;font-family:${mono};border-radius:10px;background:linear-gradient(135deg,#00e1ff,#6366f1)">VIEW ALL ARTICLES</a>
  </td></tr>
  <tr><td style="text-align:center;padding:28px 0 0;border-top:1px solid rgba(255,255,255,.06)">
    <p style="color:#475569;font-size:11px;margin:16px 0 12px;font-family:${sans}">You're receiving this because you subscribed at <a href="${SITE}" style="color:#64748b;text-decoration:none">blog.amrelharony.com</a></p>
    <a href="${unsubUrl}" style="color:#475569;font-size:11px;text-decoration:underline;font-family:${sans}">Unsubscribe</a>
    <p style="color:#1e293b;font-size:10px;margin:20px 0 0;font-family:${mono};letter-spacing:1.5px">© ${new Date().getFullYear()} AMR ELHARONY</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}
