import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticlesByTag, getTagCount } from "@/lib/queries/articles";
import { CATEGORY_PAGE_SIZE } from "@/lib/constants";
import { decodeRouteParam, MAX_TAG_PARAM } from "@/lib/route-param";
import ArticleCardV2 from "@/components/ArticleCardV2";
import FeedAnimations from "@/components/FeedAnimations";
import FeedLoadMore from "@/components/FeedLoadMore";

// 7 days (a literal: segment config must be statically analyzable). There are
// ~9,300 tags, three quarters on a single article, and crawlers reach each one
// less than once a day. Under the old 300 s TTL nearly every crawler hit found its
// page stale and paid a function invocation, the DB queries and an ISR write;
// /tag/[tag] was ~90% of the blog's function CPU. Freshness now comes from
// on-demand revalidation at every publish/edit path (lib/tag-pages.ts); the TTL
// is only a backstop. Card view/reaction counts can lag by up to the TTL.
// A warm page also rides out a Supabase blip: Next keeps serving the stale copy
// when a regeneration throws, instead of a 500.
export const revalidate = 604800;

// Required for the TTL above to cache the PAGE. Without generateStaticParams a
// dynamic segment is rendered on every request ("ƒ" in the build table, served
// `private, no-store`), and `revalidate` only sets the fetch Data Cache TTL: every
// crawler hit still paid an invocation and a render. An empty list prerenders
// nothing at build time and renders each tag on its first visit, then serves it
// from Vercel's edge cache with no invocation until the TTL or an on-demand
// revalidation (lib/tag-pages.ts) marks it stale. notFound() results are cached
// the same way, so a junk tag costs one render per TTL.
export async function generateStaticParams(): Promise<{ tag: string }[]> {
  return [];
}

type Params = { params: Promise<{ tag: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const tag = decodeRouteParam((await params).tag);
  return {
    title: `Tagged: ${tag}`,
    description: `Articles tagged "${tag}" by Amr Elharony.`,
    alternates: { canonical: `/tag/${encodeURIComponent(tag)}` },
  };
}

export default async function TagPage({ params }: Params) {
  // Decoded: on Vercel the param can arrive still percent-encoded, which matched
  // no rows and cached a 404 for a real tag (see lib/route-param.ts).
  const tag = decodeRouteParam((await params).tag);
  // No stored tag is this long: 404 without a database round-trip.
  if (!tag || tag.length > MAX_TAG_PARAM) notFound();
  // One indexed query: a page plus a sentinel row. Only a tag with more than a
  // page of articles (42 of ~9,300) also needs the exact count for the header.
  const rows = await getArticlesByTag(tag, CATEGORY_PAGE_SIZE + 1, 0);
  // 404 an empty/nonexistent tag rather than serving an indexable soft-404, matching
  // /category, /series, and /archive (and /feed/tag, which already 404s).
  if (rows.length === 0) notFound();
  const hasMore = rows.length > CATEGORY_PAGE_SIZE;
  const articles = hasMore ? rows.slice(0, CATEGORY_PAGE_SIZE) : rows;
  const total = hasMore ? Math.max(await getTagCount(tag), rows.length) : rows.length;

  return (
    <div className="lb-wrap" style={{ maxWidth: 900 }}>
      <nav className="lb-nav" role="navigation" aria-label="Blog navigation">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="lb-nav-back" href="/" role="link">
            <i className="fa-solid fa-arrow-left" aria-hidden="true" /> <span>Articles</span>
          </Link>
          <span className="lb-nav-sep" aria-hidden="true" />
          <a className="lb-nav-brand" href="https://amrelharony.com" role="link">
            AMR ELHARONY
          </a>
        </div>
      </nav>

      <header className="lb-feed-header lb-reveal">
        <h1 className="lb-feed-title" style={{ fontSize: "clamp(28px, 5vw, 48px)" }}>
          #{tag}
        </h1>
        <p className="lb-feed-sub">
          {total.toLocaleString()} {total === 1 ? "ARTICLE" : "ARTICLES"}
        </p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      {/* Skip-link landing point (app/layout.tsx renders the link itself). */}
      <div id="main-content" tabIndex={-1} className="lb-skip-target" />

      <main id="lbGrid" role="feed" aria-label="Article list">
        {articles.length === 0 ? (
          <div className="lb-empty" role="status">
            <div className="lb-empty-icon">🏷️</div>
            No articles found with this tag.
          </div>
        ) : (
          <>
            <div className="lb-card-grid">
              {articles.map((a, idx) => (
                <ArticleCardV2 key={a.id} a={a} idx={idx} />
              ))}
            </div>
            <FeedLoadMore
              tag={tag}
              initialSlugs={articles.map((a) => a.slug)}
              hasMore={hasMore}
            />
          </>
        )}
      </main>
      <FeedAnimations />
    </div>
  );
}
