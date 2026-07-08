// Per-article instant notifications (Phase 9) — sibling of the digest pipeline
// in lib/newsletter/send.ts, reusing its card styling, batch size, and the
// claim/resume idempotency pattern (here: the UNIQUE article_id on
// article_notification_log instead of the partial index on bulletin_log).
//
// Everything runs with the service-role client: recipients' emails never pass
// through anon-readable paths, and the log table is RLS-locked with no
// policies. Callers treat this as fail-open — any error just logs.
import { createServiceClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/log";
import { withRetry } from "@/lib/retry";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";
const BATCH = 90; // proven Resend batch size (lib/newsletter/send.ts)
const PG_PAGE = 1000;
const RESEND_TIMEOUT_MS = 15_000; // mirrors lib/newsletter/send.ts — never let one hung send wedge the run
// A run that dies mid-send leaves status='in_progress'. With no updated_at column
// (0013), we treat `sent_at` as a claim/heartbeat timestamp for NON-'sent' rows so a
// stale run can be reclaimed — mirrors claim_pending_bulletin's 2h reclaim in SQL.
const STALE_CLAIM_MS = 2 * 3_600_000;

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

export type ClaimDecision = "resume" | "reclaim" | "skip";

/**
 * Pure claim decision for the LOST-RACE branch (a row already exists):
 *   - 'pending'     → resume (a prior run left batches to finish)
 *   - 'sent'        → skip (done)
 *   - 'in_progress' → the owner may be mid-send OR wedged; reclaim only if its
 *                     heartbeat (`sent_at`, falling back to `created_at`) is
 *                     older than staleMs, else skip so we don't stomp a live run.
 *   - null/missing  → skip (only reached when a row is expected to exist).
 * NOTE: a non-null `sent_at` here does NOT mean "sent" — status must be 'sent'
 * for that. It doubles as the claim/heartbeat time for unfinished rows.
 */
export function resolveClaim(
  row: { status: string; sent_at?: string | null; created_at?: string | null } | null | undefined,
  nowMs: number,
  staleMs = STALE_CLAIM_MS,
): ClaimDecision {
  if (!row) return "skip";
  if (row.status === "pending") return "resume";
  if (row.status !== "in_progress") return "skip"; // 'sent' or anything unexpected
  const heartbeat = row.sent_at ?? row.created_at;
  const heartbeatMs = heartbeat ? Date.parse(heartbeat) : NaN;
  // No parseable heartbeat (legacy pre-deploy wedge) → treat as stale.
  if (Number.isNaN(heartbeatMs)) return "reclaim";
  return nowMs - heartbeatMs >= staleMs ? "reclaim" : "skip";
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
    const { data: claimed, error: claimErr } = await sb
      .from("comment_reply_notification_log")
      .upsert(
        { reply_comment_id: replyCommentId },
        { onConflict: "reply_comment_id", ignoreDuplicates: true },
      )
      .select("reply_comment_id")
      .maybeSingle();
    if (claimErr) throw claimErr; // a DB error must not look like "already sent"
    if (!claimed) return; // someone else already sent it

    const { data: article } = await sb
      .from("longform_articles")
      .select("title,slug")
      .eq("id", reply.article_id)
      .maybeSingle();
    if (!article) return;

    const unsubUrl = `${SITE}/api/comments/unsubscribe?token=${encodeURIComponent(subscription.token)}`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
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
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
      // The PK claim is already consumed, so a failure can't be retried — but it
      // must at least be observable rather than vanishing into .catch(()=>{}).
      if (!res.ok) logEvent("notify.reply.send_failed", { replyCommentId, status: res.status });
    } catch (e) {
      logEvent("notify.reply.send_failed", { replyCommentId, message: e instanceof Error ? e.message : String(e) });
    }
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
    // `sent_at` is stamped as the claim heartbeat (see resolveClaim / STALE_CLAIM_MS).
    const now = () => new Date().toISOString();
    const { data: claimed, error: claimErr } = await sb
      .from("article_notification_log")
      .upsert(
        { article_id: articleId, status: "in_progress", sent_at: now() },
        { onConflict: "article_id", ignoreDuplicates: true },
      )
      .select("id,status")
      .maybeSingle();
    // A DB error here is NOT "someone else claimed it" — surface it (fail-open log)
    // instead of silently dropping into the resume branch on garbage state.
    if (claimErr) throw claimErr;

    let logId: string;
    let resumeRemaining = 0;
    let recipientTotal = 0;
    if (claimed) {
      logId = claimed.id;
    } else {
      // Someone claimed before us — resume a pending run, or reclaim a wedged one.
      const { data: row, error: rowErr } = await sb
        .from("article_notification_log")
        .select("id,status,recipient_count,batch_remaining,sent_at,created_at")
        .eq("article_id", articleId)
        .maybeSingle();
      if (rowErr) throw rowErr;
      const decision = resolveClaim(row, Date.now());
      if (decision === "skip" || !row) return;

      // Optimistic single-winner lock. For 'resume' the guard is status='pending';
      // for 'reclaim' it's status='in_progress' AND a stale/absent heartbeat, and
      // the winner bumps sent_at so a concurrent reclaimer's predicate stops matching.
      let take = sb
        .from("article_notification_log")
        .update({ status: "in_progress", sent_at: now() })
        .eq("id", row.id);
      if (decision === "resume") {
        take = take.eq("status", "pending");
      } else {
        const cutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
        take = take.eq("status", "in_progress").or(`sent_at.is.null,sent_at.lt.${cutoff}`);
      }
      const { data: taken, error: takeErr } = await take.select("id").maybeSingle();
      if (takeErr) throw takeErr;
      if (!taken) return; // lost the race to a fresh run or another reclaimer
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
      const { error } = await sb
        .from("article_notification_log")
        .update({ status: "sent", recipient_count: 0, batch_remaining: 0, sent_at: now() })
        .eq("id", logId);
      if (error) throw error;
      return;
    }

    if (!recipientTotal) recipientTotal = recipients.length;
    const { offset, size, remainingAfter } = batchWindow(
      recipientTotal,
      resumeRemaining || recipientTotal,
    );
    const batch = recipients.slice(offset, offset + size);

    let sent = 0;
    let failed = 0;
    for (const r of batch) {
      const unsubUrl = `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(r.unsubscribe_token)}`;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Amr Elharony <noreply@updates.amrelharony.com>",
            to: [r.email],
            subject: `New article: ${article.title}`.slice(0, 160),
            html: articleEmailHTML(article, unsubUrl),
          }),
          // An unbounded hung send is exactly what leaves a wedged 'in_progress'
          // row for the reclaim path to recover — cap it, count it as unsent.
          signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
        });
        if (res.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    logEvent("notify.batch", { articleId, offset, size, sent, failed, remaining: remainingAfter });

    // Emails are already out; a lost write here wedges the row until the 2h
    // reclaim re-sends the batch — retry a few times before letting it throw.
    // `sent_at` is stamped on BOTH branches as the heartbeat (only status='sent'
    // means done).
    await withRetry(async () => {
      const { error } = await sb
        .from("article_notification_log")
        .update({
          recipient_count: recipientTotal,
          batch_remaining: remainingAfter,
          status: remainingAfter > 0 ? "pending" : "sent",
          sent_at: now(),
        })
        .eq("id", logId);
      if (error) throw error;
    });
  } catch (e) {
    console.error("[notify] fail-open:", articleId, e instanceof Error ? e.message : e);
  }
}
