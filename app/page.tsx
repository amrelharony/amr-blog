import Link from "next/link";
import { getFeedArticles, getArticlesByCategory } from "@/lib/queries/articles";
import { FEED_PAGE_SIZE } from "@/lib/constants";
import { CATEGORIES } from "@/lib/categories";
import type { ArticleCard } from "@/lib/types";
import ArticleCardV2 from "@/components/ArticleCardV2";
import FeedAnimations from "@/components/FeedAnimations";
import FeedLoadMore from "@/components/FeedLoadMore";
import FeedTitle from "@/components/FeedTitle";
import FeedSearch from "@/components/FeedSearch";
import NewsletterSignup from "@/components/NewsletterSignup";
import ContinueReading from "@/components/ContinueReading";
import ForYou from "@/components/ForYou";
import CollectionsStrip from "@/components/CollectionsStrip";
import ReaderStats from "@/components/ReaderStats";
import TrendingStrip from "@/components/TrendingStrip";

// ISR: the feed revalidates hourly, and on demand when an article is saved or
// published (/api/articles, /api/revalidate) and after scheduled posts go live
// (/api/db-keepalive, which the LinkedIn action calls hourly). The timer only
// refreshes counts and the trending strip, which an hour's lag doesn't hurt.
export const revalidate = 3600;

function topTags(list: ArticleCard[], n = 10): string[] {
  const counts: Record<string, number> = {};
  for (const a of list) for (const t of a.tags || []) counts[t] = (counts[t] || 0) + 1;
  return Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, n);
}

// The homepage opens on the Fintech feed by default.
const DEFAULT_CATEGORY = "Fintech";

export default async function FeedPage() {
  // Default to the Fintech feed. Until that category is populated it would be
  // empty, so fall back to the full newest-first feed so the homepage is never
  // blank. One extra row is the has-more sentinel; /api/feed serves later pages.
  let category: string | null = DEFAULT_CATEGORY;
  let rows = await getArticlesByCategory(DEFAULT_CATEGORY, FEED_PAGE_SIZE + 1, 0);
  if (rows.length === 0) {
    category = null;
    rows = await getFeedArticles(FEED_PAGE_SIZE + 1);
  }
  const hasMore = rows.length > FEED_PAGE_SIZE;
  const articles = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;
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
        <p className="lb-feed-sub">SPEAKING BOTH BUSINESS AND TECH IN FINTECH</p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <nav className="lb-cat-filters lb-reveal" aria-label="Browse by category">
        {CATEGORIES.map((c) => {
          const active = category !== null && c.label === category;
          return (
            <Link
              key={c.slug}
              // The active (default) category links back home; others open their hub.
              className={"lb-cat-chip" + (active ? " active" : "")}
              href={active ? "/" : `/category/${c.slug}`}
              aria-pressed={active}
            >
              <i className={`fa-solid ${c.icon}`} aria-hidden="true" /> {c.label}
            </Link>
          );
        })}
      </nav>

      <nav className="lb-explore-links lb-reveal" aria-label="Explore">
        <Link href="/archive">
          <i className="fa-solid fa-box-archive" aria-hidden="true" /> Archive
        </Link>
        <Link href="/tags">
          <i className="fa-solid fa-tags" aria-hidden="true" /> Topics
        </Link>
        <Link href="/series">
          <i className="fa-solid fa-layer-group" aria-hidden="true" /> Series
        </Link>
        <Link href="/search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" /> Search
        </Link>
        <Link href="/library">
          <i className="fa-solid fa-book-bookmark" aria-hidden="true" /> Library
        </Link>
      </nav>

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

      <TrendingStrip days={7} count={5} title="TRENDING THIS WEEK" />

      <ReaderStats />
      <ContinueReading />
      <ForYou />
      <CollectionsStrip />

      {/* Skip-link landing point (app/layout.tsx renders the link itself). */}
      <div id="main-content" tabIndex={-1} className="lb-skip-target" />

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
            <div className="lb-card-grid">
              {articles.map((a, idx) => (
                <ArticleCardV2 key={a.id} a={a} idx={idx} />
              ))}
            </div>
            <FeedLoadMore
              category={category ?? undefined}
              initialSlugs={articles.map((a) => a.slug)}
              hasMore={hasMore}
            />
          </>
        )}
      </main>
      {articles.length > 0 && <NewsletterSignup />}
      <FeedSearch />
      <FeedAnimations />
    </div>
  );
}
