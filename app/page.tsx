import Link from "next/link";
import { getFeedArticles } from "@/lib/queries/articles";
import { fmtDate } from "@/lib/format";
import type { ArticleCard } from "@/lib/types";
import FeedAnimations from "@/components/FeedAnimations";
import FeedTitle from "@/components/FeedTitle";
import FeedSearch from "@/components/FeedSearch";
import NewsletterSignup from "@/components/NewsletterSignup";
import ContinueReading from "@/components/ContinueReading";
import CollectionsStrip from "@/components/CollectionsStrip";
import ReaderStats from "@/components/ReaderStats";

// ISR — feed revalidates every 5 min and on-demand via /api/revalidate (tag 'articles').
export const revalidate = 300;

function rxCount(r: Record<string, number> | null | undefined): number {
  return Object.values(r || {}).reduce((s, n) => s + (n || 0), 0);
}
function isTrending(a: ArticleCard): boolean {
  return (a.views || 0) >= 50 || rxCount(a.reactions) >= 10;
}
function topTags(list: ArticleCard[], n = 10): string[] {
  const counts: Record<string, number> = {};
  for (const a of list) for (const t of a.tags || []) counts[t] = (counts[t] || 0) + 1;
  return Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, n);
}

export default async function FeedPage() {
  const articles = await getFeedArticles();
  const hero = articles[0];
  const rest = articles.slice(1);
  const tags = topTags(articles);

  return (
    <div className="lb-wrap" style={{ maxWidth: 900 }}>
      <nav className="lb-nav" role="navigation" aria-label="Blog navigation">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a className="lb-nav-brand" href="https://amrelharony.com" role="link">
            AMR ELHARONY
          </a>
        </div>
        <a className="lb-rss-btn" href="/feed.xml" title="RSS Feed">
          <i className="fa-solid fa-rss" /> <span>RSS</span>
        </a>
      </nav>

      <header className="lb-feed-header lb-reveal">
        <FeedTitle />
        <p className="lb-feed-sub">DEEP DIVES ON AGILE, FINTECH, AND DIGITAL TRANSFORMATION</p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <div className="lb-search-wrap lb-reveal" style={{ transitionDelay: ".1s" }}>
        <i className="fa-solid fa-magnifying-glass lb-search-icon" aria-hidden="true" />
        <input
          className="lb-search-bar"
          type="text"
          placeholder="Search articles..."
          aria-label="Search articles"
        />
      </div>

      {tags.length > 0 && (
        <div className="lb-tag-filters">
          <button className="lb-tag-chip active" data-filter="all">
            All
          </button>
          {tags.map((t) => (
            <Link key={t} className="lb-tag-chip" href={`/tag/${encodeURIComponent(t)}`}>
              {t}
            </Link>
          ))}
        </div>
      )}

      <ReaderStats />
      <ContinueReading />
      <CollectionsStrip />

      <main id="lbGrid" role="feed" aria-label="Article list">
        {articles.length === 0 ? (
          <div className="lb-empty" role="status">
            <div className="lb-empty-icon">✍️</div>
            No articles published yet.
            <br />
            Check back soon.
          </div>
        ) : (
          <>
            {hero && (
              <Link
                className="lb-hero lb-reveal"
                href={`/p/${hero.slug}`}
                aria-label={hero.title}
              >
                {hero.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="lb-hero-img"
                    src={hero.cover_image}
                    alt={hero.title}
                    loading="eager"
                    fetchPriority="high"
                  />
                ) : (
                  <div className="lb-hero-fallback">
                    <span className="lb-hero-fallback-icon">
                      <i className="fa-solid fa-newspaper" />
                    </span>
                  </div>
                )}
                <div className="lb-hero-gradient" />
                <div className="lb-hero-body">
                  <div className="lb-hero-date">
                    {isTrending(hero) && (
                      <span className="lb-trending-badge">
                        <i className="fa-solid fa-fire" /> TRENDING
                      </span>
                    )}
                    {fmtDate(hero.created_at)}
                  </div>
                  <div className="lb-hero-title">{hero.title}</div>
                  <div className="lb-hero-excerpt">{(hero.excerpt || "").slice(0, 160)}</div>
                  <div className="lb-hero-meta">
                    <span>👁 {hero.views || 0} views</span>
                    {hero.series_name && (
                      <span className="lb-series-badge" style={{ opacity: 1 }}>
                        {hero.series_name}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )}

            {rest.length > 0 && (
              <div className="lb-card-grid">
                {rest.map((a, idx) => {
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
          </>
        )}
      </main>
      {articles.length > 0 && <NewsletterSignup />}
      <FeedSearch />
      <FeedAnimations />
    </div>
  );
}
