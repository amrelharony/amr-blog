import Link from "next/link";
import { getFeedArticles } from "@/lib/queries/articles";
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

// ISR — feed revalidates every 5 min and on-demand via /api/revalidate (tag 'articles').
export const revalidate = 300;

function topTags(list: ArticleCard[], n = 10): string[] {
  const counts: Record<string, number> = {};
  for (const a of list) for (const t of a.tags || []) counts[t] = (counts[t] || 0) + 1;
  return Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, n);
}

export default async function FeedPage() {
  // One extra row as the has-more sentinel; /api/feed serves later pages.
  const rows = await getFeedArticles(FEED_PAGE_SIZE + 1);
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
        <p className="lb-feed-sub">DEEP DIVES ON AGILE, FINTECH, AND DIGITAL TRANSFORMATION</p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <nav className="lb-cat-filters lb-reveal" aria-label="Browse by category">
        {CATEGORIES.map((c) => (
          <Link key={c.slug} className="lb-cat-chip" href={`/category/${c.slug}`}>
            <i className={`fa-solid ${c.icon}`} aria-hidden="true" /> {c.label}
          </Link>
        ))}
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

      <ReaderStats />
      <ContinueReading />
      <ForYou />
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
            <div className="lb-card-grid">
              {articles.map((a, idx) => (
                <ArticleCardV2 key={a.id} a={a} idx={idx} />
              ))}
            </div>
            <FeedLoadMore initialSlugs={articles.map((a) => a.slug)} hasMore={hasMore} />
          </>
        )}
      </main>
      {articles.length > 0 && <NewsletterSignup />}
      <FeedSearch />
      <FeedAnimations />
    </div>
  );
}
