import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getArticlesByCategory, getCategoryCount } from "@/lib/queries/articles";
import { CATEGORIES, categoryBySlug } from "@/lib/categories";
import { CATEGORY_PAGE_SIZE } from "@/lib/constants";
import ArticleCardV2 from "@/components/ArticleCardV2";
import FeedAnimations from "@/components/FeedAnimations";
import FeedLoadMore from "@/components/FeedLoadMore";

export const revalidate = 300;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

type Params = { params: Promise<{ category: string }> };

// Prerender the three category hubs at build; the rest loads via infinite scroll.
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
  const cat = categoryBySlug(category);
  if (!cat) return { title: "Not found", robots: { index: false } };
  const title = `${cat.label} Articles`;
  return {
    title,
    description: cat.blurb,
    alternates: {
      canonical: `/category/${cat.slug}`,
      types: { "application/rss+xml": `/feed/category/${cat.slug}` },
    },
    openGraph: {
      type: "website",
      title: `${cat.label} — Fintech Bilinguals`,
      description: cat.blurb,
      url: `/category/${cat.slug}`,
    },
    twitter: { card: "summary_large_image", title, description: cat.blurb },
  };
}

export default async function CategoryPage({ params }: Params) {
  const { category } = await params;
  const cat = categoryBySlug(category);
  if (!cat) notFound();

  const [articles, total] = await Promise.all([
    getArticlesByCategory(cat.label, CATEGORY_PAGE_SIZE, 0),
    getCategoryCount(cat.label),
  ]);
  const hasMore = total > articles.length;

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${cat.label} Articles`,
    description: cat.blurb,
    url: `${siteUrl}/category/${cat.slug}`,
    isPartOf: { "@type": "WebSite", name: "Fintech Bilinguals", url: siteUrl },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: articles.map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${siteUrl}/p/${a.slug}`,
        name: a.title,
      })),
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: cat.label, item: `${siteUrl}/category/${cat.slug}` },
    ],
  };

  return (
    <div className="lb-wrap" style={{ maxWidth: 900 }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c") }}
      />
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
          <i className={`fa-solid ${cat.icon}`} aria-hidden="true" style={{ marginRight: 14, opacity: 0.85 }} />
          {cat.label}
        </h1>
        <p className="lb-feed-sub">
          {total.toLocaleString()} {total === 1 ? "ARTICLE" : "ARTICLES"}
        </p>
        <p className="lb-cat-blurb">{cat.blurb}</p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <nav className="lb-cat-filters" aria-label="Categories">
        {CATEGORIES.map((c) => {
          const active = c.slug === cat.slug;
          return (
            <Link
              key={c.slug}
              // Clicking the active category again clears the filter (back to all).
              className={"lb-cat-chip" + (active ? " active" : "")}
              href={active ? "/" : `/category/${c.slug}`}
              aria-pressed={active}
            >
              <i className={`fa-solid ${c.icon}`} aria-hidden="true" /> {c.label}
            </Link>
          );
        })}
      </nav>

      <main id="lbGrid" role="feed" aria-label="Article list">
        {articles.length === 0 ? (
          <div className="lb-empty" role="status">
            <div className="lb-empty-icon">🗂️</div>
            No articles in this category yet.
          </div>
        ) : (
          <>
            <div className="lb-card-grid">
              {articles.map((a, idx) => (
                <ArticleCardV2 key={a.id} a={a} idx={idx} />
              ))}
            </div>
            <FeedLoadMore
              category={cat.label}
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
