import type { Metadata } from "next";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import { renderArticleHtml } from "@/lib/markdown/parse";
import { fmtDate, readingTime } from "@/lib/format";
import { isUuid } from "@/lib/security";
import ReviewComments from "@/components/ReviewComments";

export const metadata: Metadata = {
  title: "Draft review",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

export default async function ReviewPage({ params }: Params) {
  const { token } = await params;
  // Review tokens are UUIDs — reject malformed input before it reaches the RPC.
  const validToken = isUuid(token);
  const sb = createPublicClient();
  const { data } = validToken
    ? await sb.rpc("get_review_by_token", { p_token: token })
    : { data: null };
  const r = Array.isArray(data) && data[0] ? data[0] : null;

  if (!r) {
    return (
      <div className="lb-wrap" style={{ padding: "5rem 1rem", textAlign: "center" }}>
        <h1 className="lb-article-h1">Review link invalid or expired</h1>
        <p style={{ opacity: 0.7, marginTop: 12 }}>
          <Link href="/" className="lb-nav-brand">
            ← Go to the blog
          </Link>
        </p>
      </div>
    );
  }

  const html = await renderArticleHtml(r.article_content);

  return (
    <div className="lb-wrap">
      <div
        style={{
          background: "rgba(168,85,247,.12)",
          border: "1px solid rgba(168,85,247,.3)",
          borderRadius: 10,
          padding: "10px 14px",
          margin: "14px 0",
          fontSize: 13,
        }}
      >
        🔒 Private draft review — not published, not indexed. Link expires {fmtDate(r.expires_at)}.
      </div>

      <article className="lb-article">
        <header className="lb-article-header">
          <div className="lb-article-date">{fmtDate(r.article_created_at)}</div>
          <h1 className="lb-article-h1">{r.article_title}</h1>
          {r.article_excerpt && <p className="lb-article-excerpt">{r.article_excerpt}</p>}
          <div className="lb-article-meta">
            <span>{readingTime(r.article_content)}</span>
          </div>
        </header>
        {r.article_cover_image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="lb-cover-img" src={r.article_cover_image} alt={r.article_title} />
        )}
        <div className="lb-content has-dropcap" dangerouslySetInnerHTML={{ __html: html }} />
      </article>

      <ReviewComments token={token} initial={r.comments || []} reviewerName={r.reviewer_name || ""} />
    </div>
  );
}
