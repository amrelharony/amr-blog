import Link from "next/link";
import { fmtDate } from "@/lib/format";
import type { ArticleCard } from "@/lib/types";

// Shared article card — the markup previously duplicated inline by the homepage
// feed and the tag page. Purely presentational (no "use client") so it renders
// from server pages and from the client load-more / search layers alike.
//
// `reveal` toggles the GSAP entrance class: server-rendered cards keep
// `lb-reveal` (FeedAnimations wires reveals at mount), while client-appended
// cards must NOT use it (GSAP won't see them) and self-animate via .lb-fadein.

export function rxCount(r: Record<string, number> | null | undefined): number {
  return Object.values(r || {}).reduce((s, n) => s + (n || 0), 0);
}

export function isTrending(a: ArticleCard): boolean {
  return (a.views || 0) >= 50 || rxCount(a.reactions) >= 10;
}

export default function ArticleCardV2({
  a,
  reveal = true,
  delayIndex = 0,
}: {
  a: ArticleCard;
  reveal?: boolean;
  delayIndex?: number;
}) {
  const rc = rxCount(a.reactions);
  return (
    <Link
      className={`lb-card-v2 ${reveal ? "lb-reveal" : "lb-fadein"}`}
      style={reveal ? { transitionDelay: `${((delayIndex % 2) * 0.07).toFixed(2)}s` } : undefined}
      href={`/p/${a.slug}`}
      aria-label={a.title}
      data-id={a.id}
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
