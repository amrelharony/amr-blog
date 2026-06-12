import type { Metadata } from "next";
import Link from "next/link";
import { getArticlesByTag } from "@/lib/queries/articles";
import FeedAnimations from "@/components/FeedAnimations";
import ArticleCardV2 from "@/components/ArticleCardV2";
import { breadcrumbJsonLd } from "@/lib/seo";

export const revalidate = 300;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

type Params = { params: Promise<{ tag: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tag } = await params;
  const title = `Tagged: ${tag}`;
  const description = `Articles tagged "${tag}" by Amr Elharony.`;
  const canonical = `/tag/${encodeURIComponent(tag)}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: "website", title, description, url: canonical },
    twitter: { card: "summary", title, description },
  };
}

export default async function TagPage({ params }: Params) {
  const { tag } = await params;
  const articles = await getArticlesByTag(tag);

  const breadcrumbs = breadcrumbJsonLd([
    { name: "Articles", url: `${siteUrl}/` },
    { name: `#${tag}`, url: `${siteUrl}/tag/${encodeURIComponent(tag)}` },
  ]);

  return (
    <div className="lb-wrap" style={{ maxWidth: 900 }}>
      <script
        type="application/ld+json"
        // Escape `<` so a tag containing "</script>" can't break out of the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, "\\u003c") }}
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
            {articles.map((a, idx) => (
              <ArticleCardV2 key={a.id} a={a} delayIndex={idx} />
            ))}
          </div>
        )}
      </main>
      <FeedAnimations />
    </div>
  );
}
