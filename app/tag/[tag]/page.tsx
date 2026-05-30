import type { Metadata } from "next";
import Link from "next/link";
import { getArticlesByTag } from "@/lib/queries/articles";
import { fmtDate } from "@/lib/format";
import type { ArticleCard } from "@/lib/types";
import FeedAnimations from "@/components/FeedAnimations";

export const revalidate = 300;

type Params = { params: Promise<{ tag: string }> };

function rxCount(r: Record<string, number> | null | undefined): number {
  return Object.values(r || {}).reduce((s, n) => s + (n || 0), 0);
}
function isTrending(a: ArticleCard): boolean {
  return (a.views || 0) >= 50 || rxCount(a.reactions) >= 10;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tag } = await params;
  return {
    title: `Tagged: ${tag}`,
    description: `Articles tagged "${tag}" by Amr Elharony.`,
    alternates: { canonical: `/tag/${encodeURIComponent(tag)}` },
  };
}

export default async function TagPage({ params }: Params) {
  const { tag } = await params;
  const articles = await getArticlesByTag(tag);

  return (
    <div className="lb-wrap" style={{ maxWidth: 900 }}>
      <nav className="lb-nav" role="navigation" aria-label="Blog navigation">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="lb-nav-back" href="/" role="link">
            <i className="fa-solid fa-arrow-left" aria-hidden="true" /> <span>Articles</span>
          </Link>
          <span className="lb-nav-sep" aria-hidden="true" />
          <Link className="lb-nav-brand" href="/" role="link">
            AMR ELHARONY
          </Link>
        </div>
      </nav>

      <header className="lb-feed-header lb-reveal">
        <h1 className="lb-feed-title" style={{ fontSize: "clamp(28px, 5vw, 48px)" }}>
          #{tag}
        </h1>
        <p className="lb-feed-sub">
          {articles.length} {articles.length === 1 ? "ARTICLE" : "ARTICLES"}
        </p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <main id="lbGrid" role="feed" aria-label="Article list">
        {articles.length === 0 ? (
          <div className="lb-empty" role="status">
            <div className="lb-empty-icon">🏷️</div>
            No articles found with this tag.
          </div>
        ) : (
          <div className="lb-card-grid">
            {articles.map((a, idx) => {
              const rc = rxCount(a.reactions);
              return (
                <Link
                  key={a.id}
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
            })}
          </div>
        )}
      </main>
      <FeedAnimations />
    </div>
  );
}
