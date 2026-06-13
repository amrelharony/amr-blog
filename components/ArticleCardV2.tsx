import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { rxCount, isTrending } from "@/lib/ranking";
import type { ArticleCard } from "@/lib/types";

// Feed/tag card markup, shared by the server pages (app/page.tsx,
// app/tag/[tag]/page.tsx) and the client load-more appender. No hooks, so it
// renders identically in both worlds. `idx` only staggers the reveal delay.
export default function ArticleCardV2({ a, idx }: { a: ArticleCard; idx: number }) {
  const rc = rxCount(a.reactions);
  return (
    <Link
      className="lb-card-v2 lb-reveal"
      style={{ transitionDelay: `${((idx % 2) * 0.07).toFixed(2)}s` }}
      href={`/p/${a.slug}`}
      aria-label={a.title}
    >
      {a.cover_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="lb-card-v2-img" src={a.cover_image} alt={a.title} loading="lazy" />
      ) : (
        <div className="lb-card-v2-fallback">
          <i className="fa-solid fa-feather-pointed" />
        </div>
      )}
      <div className="lb-card-v2-body">
        <div className="lb-card-v2-date">
          {fmtDate(a.created_at)}
          {isTrending(a) && (
            <span className="lb-trending-badge">
              {" "}
              <i className="fa-solid fa-fire" /> TRENDING
            </span>
          )}
        </div>
        <div className="lb-card-v2-title">{a.title}</div>
        <div className="lb-card-v2-excerpt">{(a.excerpt || "").slice(0, 120)}</div>
        <div className="lb-card-v2-footer">
          <div className="lb-card-v2-tags">
            {(a.tags || []).slice(0, 2).map((t) => (
              <span key={t} className="lb-card-tag">
                {t}
              </span>
            ))}
            {a.series_name && <span className="lb-series-badge">{a.series_name}</span>}
          </div>
          <div className="lb-card-v2-stats lb-social-proof">
            <span>👁 {a.views || 0}</span>
            {rc > 0 && <span>❤ {rc}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
