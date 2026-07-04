// Per-article instant notifications (Phase 9) — sibling of the digest pipeline
// in lib/newsletter/send.ts, reusing its card styling, batch size, and the
// claim/resume idempotency pattern (here: the UNIQUE article_id on
// article_notification_log instead of the partial index on bulletin_log).
//
// Everything runs with the service-role client: recipients' emails never pass
// through anon-readable paths, and the log table is RLS-locked with no
// policies. Callers treat this as fail-open — any error just logs.
import { createServiceClient } from "@/lib/supabase/service";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";
const BATCH = 90; // proven Resend batch size (lib/newsletter/send.ts)
const PG_PAGE = 1000;

interface NotifyArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  tldr: string | null;
  tags: string[] | null;
  created_at: string;
  published: boolean;
}

interface Recipient {
  email: string;
  unsubscribe_token: string;
}

function esc(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Single-article email — same visual system as bulletinHTML. Exported for tests. */
export function articleEmailHTML(
  a: Pick<NotifyArticle, "title" | "slug" | "excerpt" | "tldr" | "tags" | "created_at">,
  unsubUrl: string,
): string {
  const mono = "'JetBrains Mono',monospace";
  const sans = "'Inter',system-ui,-apple-system,sans-serif";
  const link = `${SITE}/p/${encodeURIComponent(a.slug)}`;
  const date = new Date(a.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const blurb = a.tldr || a.excerpt || "";
  const tags = (a.tags || [])
    .slice(0, 3)
    .map(
      (t) =>
        `<span style="display:inline-block;padding:3px 10px;background:rgba(0,225,255,0.06);color:#00e1ff;border-radius:20px;font-size:10px;font-family:${mono};margin-right:6px;border:1px solid rgba(0,225,255,0.1)">${esc(t)}</span>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06080f;font-family:${sans}">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#06080f"><tr><td align="center" style="padding:48px 16px 40px">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%">
  <tr><td style="padding:0 0 28px;text-align:center">
    <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-family:${mono};letter-spacing:2px;text-transform:uppercase">NEW ARTICLE</p>
    <div style="width:80px;height:3px;border-radius:3px;background:linear-gradient(90deg,#00e1ff,#6366f1,#a855f7);margin:0 auto"></div>
  </td></tr>
  <tr><td style="padding:0 0 24px">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0c1018;border-radius:15px;overflow:hidden;border:1px solid rgba(0,225,255,0.15)">
      <tr><td style="padding:28px 30px">
        <div style="font-size:11px;color:#64748b;font-family:${mono};letter-spacing:0.5px;padding-bottom:12px">◆ ${date}</div>
        <h1 style="margin:0 0 12px;line-height:1.4"><a href="${link}" style="color:#f0f2f5;font-size:22px;font-weight:800;text-decoration:none;font-family:${sans}">${esc(a.title)}</a></h1>
        ${blurb ? `<p style="color:#8a95a8;font-size:14px;line-height:1.75;margin:0 0 18px;font-family:${sans}">${esc(blurb.slice(0, 300))}${blurb.length > 300 ? "…" : ""}</p>` : ""}
        ${tags ? `<div style="margin-bottom:20px">${tags}</div>` : ""}
        <a href="${link}" style="display:inline-block;padding:12px 28px;color:#06080f;font-weight:700;font-size:11px;text-decoration:none;letter-spacing:1.2px;text-transform:uppercase;font-family:${mono};border-radius:8px;background:linear-gradient(135deg,#00e1ff,#6366f1)">READ THE ARTICLE →</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="text-align:center;padding:20px 0 0;border-top:1px solid rgba(255,255,255,.06)">
    <p style="color:#475569;font-size:11px;margin:16px 0 12px;font-family:${sans}">You get an email for every new article because you chose instant updates at <a href="${SITE}" style="color:#64748b;text-decoration:none">blog.amrelharony.com</a></p>
    <a href="${unsubUrl}" style="color:#475569;font-size:11px;text-decoration:underline;font-family:${sans}">Unsubscribe</a>
    <p style="color:#1e293b;font-size:10px;margin:20px 0 0;font-family:${mono};letter-spacing:1.5px">© ${new Date().getFullYear()} AMR ELHARONY</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

/** Pure resume arithmetic shared with tests: where a run left off. */
export function batchWindow(recipientCount: number, batchRemaining: number, batchSize = BATCH) {
  const offset = Math.max(0, recipientCount - batchRemaining);
  const size = Math.min(batchSize, Math.max(0, recipientCount - offset));
  return { offset, size, remainingAfter: Math.max(0, recipientCount - offset - size) };
}

/** Pure claim decision: should this run proceed given an existing log row? */
export function shouldSend(row: { status: string } | null | undefined): boolean {
  // No row: caller just claimed. 'pending': a prior run left batches to resume.
  // 'in_progress' (someone else is mid-send) and 'sent' (done): skip.
  return !row || row.status === "pending";
}

/** Reply-notification email (comment subscriptions). Exported for tests. */
export function replyEmailHTML(input: {
  articleTitle: string;
  articleSlug: string;
  parentExcerpt: string;
  replyAuthor: string;
  replyExcerpt: string;
  unsubUrl: string;
}): string {
  const mono = "'JetBrains Mono',monospace";
  const sans = "'Inter',system-ui,-apple-system,sans-serif";
  const link = `${SITE}/p/${encodeURIComponent(input.articleSlug)}#comments`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06080f;font-family:${sans}">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#06080f"><tr><td align="center" style="padding:48px 16px 40px">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%">
  <tr><td style="padding:0 0 24px;text-align:center">
    <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-family:${mono};letter-spacing:2px;text-transform:uppercase">NEW REPLY</p>
    <div style="width:80px;height:3px;border-radius:3px;background:linear-gradient(90deg,#00e1ff,#6366f1,#a855f7);margin:0 auto"></div>
  </td></tr>
  <tr><td style="padding:0 0 24px">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0c1018;border-radius:15px;border:1px solid rgba(0,225,255,0.15)">
      <tr><td style="padding:26px 28px">
        <p style="margin:0 0 14px;color:#8a95a8;font-size:13px;font-family:${sans}"><strong style="color:#f0f2f5">${esc(input.replyAuthor)}</strong> replied to your comment on <a href="${link}" style="color:#00e1ff;text-decoration:none">${esc(input.articleTitle)}</a>:</p>
        <blockquote style="margin:0 0 14px;padding:10px 16px;border-left:3px solid rgba(0,225,255,0.4);color:#c9d3e0;font-size:14px;line-height:1.7;font-family:${sans}">${esc(input.replyExcerpt.slice(0, 300))}${input.replyExcerpt.length > 300 ? "…" : ""}</blockquote>
        <p style="margin:0 0 18px;color:#64748b;font-size:12px;font-family:${sans}">Your comment: “${esc(input.parentExcerpt.slice(0, 140))}${input.parentExcerpt.length > 140 ? "…" : ""}”</p>
        <a href="${link}" style="display:inline-block;padding:10px 24px;color:#06080f;font-weight:700;font-size:11px;text-decoration:none;letter-spacing:1.2px;text-transform:uppercase;font-family:${mono};border-radius:8px;background:linear-gradient(135deg,#00e1ff,#6366f1)">VIEW THE CONVERSATION →</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="text-align:center;padding:20px 0 0;border-top:1px solid rgba(255,255,255,.06)">
    <p style="color:#475569;font-size:11px;margin:16px 0 12px;font-family:${sans}">You asked to be emailed when someone replies to your comment.</p>
    <a href="${esc(input.unsubUrl)}" style="color:#475569;font-size:11px;text-decoration:underline;font-family:${sans}">Stop these notifications</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Email the parent commenter about a new reply — once per reply, ever
 * (comment_reply_notification_log PK claim). Fail-open like runArticleNotify.
 */
export async function runReplyNotify(replyCommentId: string): Promise<void> {
  try {
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return;
    const sb = createServiceClient();

    const { data: reply } = await sb
      .from("article_comments")
      .select("id,article_id,parent_id,author_id,author_name,content,status")
      .eq("id", replyCommentId)
      .maybeSingle();
    if (!reply || !reply.parent_id || reply.status !== "approved") return;

    const { data: parent } = await sb
      .from("article_comments")
      .select("id,author_id,content,status")
      .eq("id", reply.parent_id)
      .maybeSingle();
    if (!parent || parent.status !== "approved") return;
    // Never notify people about their own replies.
    if (parent.author_id && parent.author_id === reply.author_id) return;

    const { data: subscription } = await sb
      .from("comment_subscriptions")
      .select("email,token,unsubscribed_at")
      .eq("comment_id", parent.id)
      .is("unsubscribed_at", null)
      .maybeSingle();
    if (!subscription) return;

    // Claim this reply (send-once across concurrent triggers).
    const { data: claimed } = await sb
      .from("comment_reply_notification_log")
      .upsert(
        { reply_comment_id: replyCommentId },
        { onConflict: "reply_comment_id", ignoreDuplicates: true },
      )
      .select("reply_comment_id")
      .maybeSingle();
    if (!claimed) return; // someone else already sent it

    const { data: article } = await sb
      .from("longform_articles")
      .select("title,slug")
      .eq("id", reply.article_id)
      .maybeSingle();
    if (!article) return;

    const unsubUrl = `${SITE}/api/comments/unsubscribe?token=${encodeURIComponent(subscription.token)}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Amr Elharony <noreply@updates.amrelharony.com>",
        to: [subscription.email],
        subject: `New reply on "${article.title}"`.slice(0, 160),
        html: replyEmailHTML({
          articleTitle: article.title,
          articleSlug: article.slug,
          parentExcerpt: parent.content || "",
          replyAuthor: reply.author_name || "Anonymous",
          replyExcerpt: reply.content || "",
          unsubUrl,
        }),
      }),
    }).catch(() => {});
  } catch (e) {
    console.error("[reply-notify] fail-open:", replyCommentId, e instanceof Error ? e.message : e);
  }
}

/**
 * Send the "new article" email to instant subscribers, exactly once per
 * article across all triggers. Fail-open: every error logs and returns.
 */
export async function runArticleNotify(articleId: string): Promise<void> {
  try {
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return;
    const sb = createServiceClient();

    const { data: article } = await sb
      .from("longform_articles")
      .select("id,title,slug,excerpt,tldr,tags,created_at,published")
      .eq("id", articleId)
      .maybeSingle<NotifyArticle>();
    if (!article || !article.published) return;

    // Claim: first INSERT wins the article; losers get a conflict (no row).
    const { data: claimed } = await sb
      .from("article_notification_log")
      .upsert(
        { article_id: articleId, status: "in_progress" },
        { onConflict: "article_id", ignoreDuplicates: true },
      )
      .select("id,status")
      .maybeSingle();

    let logId: string;
    let resumeRemaining = 0;
    let recipientTotal = 0;
    if (claimed) {
      logId = claimed.id;
    } else {
      // Someone claimed before us — only proceed if they left a resumable run.
      const { data: row } = await sb
        .from("article_notification_log")
        .select("id,status,recipient_count,batch_remaining")
        .eq("article_id", articleId)
        .maybeSingle();
      if (!row || !shouldSend(row)) return;
      // Re-take the pending row (best-effort optimistic lock on status).
      const { data: taken } = await sb
        .from("article_notification_log")
        .update({ status: "in_progress" })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!taken) return;
      logId = row.id;
      resumeRemaining = row.batch_remaining;
      recipientTotal = row.recipient_count;
    }

    // Instant recipients — paged past the 1000-row PostgREST cap.
    const recipients: Recipient[] = [];
    for (let from = 0; from < 200000; from += PG_PAGE) {
      const { data, error } = await sb
        .from("newsletter_subscribers")
        .select("email,unsubscribe_token")
        .eq("frequency", "instant")
        .eq("confirmed", true)
        .is("unsubscribed_at", null)
        .order("id", { ascending: true })
        .range(from, from + PG_PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as Recipient[];
      recipients.push(...rows);
      if (rows.length < PG_PAGE) break;
    }

    if (recipients.length === 0) {
      await sb
        .from("article_notification_log")
        .update({ status: "sent", recipient_count: 0, batch_remaining: 0, sent_at: new Date().toISOString() })
        .eq("id", logId);
      return;
    }

    if (!recipientTotal) recipientTotal = recipients.length;
    const { offset, size, remainingAfter } = batchWindow(
      recipientTotal,
      resumeRemaining || recipientTotal,
    );
    const batch = recipients.slice(offset, offset + size);

    for (const r of batch) {
      const unsubUrl = `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(r.unsubscribe_token)}`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Amr Elharony <noreply@updates.amrelharony.com>",
          to: [r.email],
          subject: `New article: ${article.title}`.slice(0, 160),
          html: articleEmailHTML(article, unsubUrl),
        }),
      }).catch(() => {});
    }

    await sb
      .from("article_notification_log")
      .update({
        recipient_count: recipientTotal,
        batch_remaining: remainingAfter,
        status: remainingAfter > 0 ? "pending" : "sent",
        ...(remainingAfter > 0 ? {} : { sent_at: new Date().toISOString() }),
      })
      .eq("id", logId);
  } catch (e) {
    console.error("[notify] fail-open:", articleId, e instanceof Error ? e.message : e);
  }
}
