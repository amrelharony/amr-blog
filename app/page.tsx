import Link from "next/link";
import { getFeedArticles, getTopTags, FEED_PAGE_SIZE } from "@/lib/queries/articles";
import { fmtDate } from "@/lib/format";
import FeedAnimations from "@/components/FeedAnimations";
import FeedTitle from "@/components/FeedTitle";
import FeedSearch from "@/components/FeedSearch";
import NewsletterSignup from "@/components/NewsletterSignup";
import ContinueReading from "@/components/ContinueReading";
import CollectionsStrip from "@/components/CollectionsStrip";
import ReaderStats from "@/components/ReaderStats";
import ArticleCardV2, { isTrending } from "@/components/ArticleCardV2";
import LoadMoreArticles from "@/components/LoadMoreArticles";

// ISR — feed revalidates every 5 min and on-demand via /api/revalidate (tag 'articles').
export const revalidate = 300;

export default async function FeedPage() {
  // First page only — LoadMoreArticles fetches the rest in-browser. Tag chips
  // count across ALL published articles, not just the rendered page.
  const [articles, tags] = await Promise.all([getFeedArticles(FEED_PAGE_SIZE), getTopTags()]);
  const hero = articles[0];
  const rest = articles.slice(1);

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
                data-id={hero.id}
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
                {rest.map((a, idx) => (
                  <ArticleCardV2 key={a.id} a={a} delayIndex={idx} />
                ))}
              </div>
            )}
            <LoadMoreArticles initialCount={articles.length} />
            <FeedSearch />
          </>
        )}
      </main>
      {articles.length > 0 && <NewsletterSignup />}
      <FeedAnimations />
    </div>
  );
}
