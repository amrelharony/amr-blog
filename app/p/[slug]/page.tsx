import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getArticleBySlug,
  getAllPublishedSlugs,
  getRelatedArticles,
  getSeriesSiblings,
} from "@/lib/queries/articles";
import { renderArticleHtml } from "@/lib/markdown/parse";
import { fmtDate, readingTime, isoDate } from "@/lib/format";
import ArticleAnimations from "@/components/ArticleAnimations";
import ArticleReader from "@/components/ArticleReader";
import ArticleEngagement from "@/components/ArticleEngagement";
import TtsButton from "@/components/TtsButton";
import ArticleToolbar from "@/components/ArticleToolbar";
import ReadingTracker from "@/components/ReadingTracker";
import CollectionsManager from "@/components/CollectionsManager";
import Annotations from "@/components/Annotations";
import PdfViewer from "@/components/PdfViewer";

export const revalidate = 300;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return []; // TEMP DEBUG — skip prerender so the local prod build is fast
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = await getArticleBySlug(slug);
  if (!a) return { title: "Not found", robots: { index: false } };
  const description = a.excerpt || a.title;
  return {
    // `absolute` drops the layout's "· Amr Elharony" suffix so the keyword-rich
    // article title isn't pushed past the ~60-char SERP width.
    title: { absolute: a.title },
    description,
    authors: [{ name: "Amr Elharony", url: "https://amrelharony.com" }],
    ...(a.tags?.length ? { keywords: a.tags } : {}),
    alternates: { canonical: `/p/${a.slug}` },
    // og:image / twitter:image come from the generated opengraph-image.tsx /
    // twitter-image.tsx cards in this segment (branded, title-bearing).
    openGraph: {
      type: "article",
      title: a.title,
      description,
      url: `/p/${a.slug}`,
      publishedTime: a.created_at,
      modifiedTime: a.updated_at,
      tags: a.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: a.title,
      description,
    },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const a = await getArticleBySlug(slug);
  if (!a) notFound();

  const html = renderArticleHtml(a.content);
  const url = `${siteUrl}/p/${a.slug}`;
  const shareText = a.title + (a.excerpt ? `\n\n${a.excerpt}` : "");
  const words = (a.content || "").split(/\s+/).filter(Boolean).length;

  const [related, siblings] = await Promise.all([
    getRelatedArticles({ id: a.id, tags: a.tags || [] }),
    a.series_name ? getSeriesSiblings(a.series_name) : Promise.resolve([]),
  ]);
  const seriesIdx = siblings.findIndex((s) => s.id === a.id);
  const showSeries = siblings.length >= 2 && seriesIdx !== -1;
  const seriesPrev = showSeries && seriesIdx > 0 ? siblings[seriesIdx - 1] : null;
  const seriesNext = showSeries && seriesIdx < siblings.length - 1 ? siblings[seriesIdx + 1] : null;
  const showRelated = related.length >= 2;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.title,
    description: a.excerpt || a.title,
    datePublished: a.created_at,
    dateModified: a.updated_at,
    inLanguage: "en",
    wordCount: words,
    ...(a.tldr ? { abstract: a.tldr } : {}),
    author: {
      "@type": "Person",
      name: "Amr Elharony",
      url: "https://amrelharony.com",
      sameAs: [
        "https://www.linkedin.com/in/amrmelharony",
        "https://t.me/Amrmelharony",
        "https://adplist.org/mentors/amr-elharony",
      ],
    },
    publisher: {
      "@type": "Organization",
      name: "Amr Elharony",
      logo: { "@type": "ImageObject", url: `${siteUrl}/icon.png` },
    },
    mainEntityOfPage: url,
    ...(a.tags?.length ? { keywords: a.tags.join(", ") } : {}),
  };

  // Breadcrumb trail: Home → [first tag] → article. The feed is the home page,
  // and /tag/[tag] routes exist, so a tag level avoids a duplicate-URL "Home → Home".
  const firstTag = a.tags?.[0];
  const crumbs = [
    { name: "Home", item: siteUrl },
    ...(firstTag
      ? [{ name: firstTag, item: `${siteUrl}/tag/${encodeURIComponent(firstTag)}` }]
      : []),
    { name: a.title, item: url },
  ];
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  };

  return (
    <div className="lb-wrap">
      <script
        type="application/ld+json"
        // Escape `<` so a title/excerpt containing "</script>" can't break out of the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c") }}
      />
      <nav className="lb-nav" role="navigation" aria-label="Article navigation">
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

      <div id="lbArticle" aria-live="polite">
        <article
          className="lb-article"
          itemScope
          itemType="https://schema.org/BlogPosting"
          data-article-id={a.id}
        >
          <header className="lb-article-header">
            <div className="lb-article-date lb-reveal">
              <time dateTime={isoDate(a.created_at)} itemProp="datePublished">
                {fmtDate(a.created_at)}
              </time>
            </div>
            <h1 className="lb-article-h1 lb-reveal" itemProp="headline">
              {a.title}
            </h1>
            {a.excerpt && (
              <p className="lb-article-excerpt lb-reveal" itemProp="description">
                {a.excerpt}
              </p>
            )}
            <div className="lb-article-meta lb-reveal">
              <span itemProp="author" itemScope itemType="https://schema.org/Person">
                <meta itemProp="name" content="Amr Elharony" />
                {readingTime(a.content)}
              </span>
              <span aria-label={`${a.views || 0} views`}>👁 {a.views || 0} views</span>
            </div>
          </header>

          {a.tldr && (
            <aside className="lb-tldr lb-reveal" aria-label="TL;DR summary">
              <div className="lb-tldr-label">
                <i className="fa-solid fa-bolt" aria-hidden="true" /> TL;DR
              </div>
              <p className="lb-tldr-body">{a.tldr}</p>
            </aside>
          )}

          {showSeries && (
            <div className="lb-series-nav">
              {seriesPrev ? (
                <Link className="lb-series-nav-btn" href={`/p/${seriesPrev.slug}`}>
                  <i className="fa-solid fa-chevron-left" /> Prev
                </Link>
              ) : (
                <span className="lb-series-nav-btn disabled">
                  <i className="fa-solid fa-chevron-left" /> Prev
                </span>
              )}
              <span className="lb-series-nav-title">
                {a.series_name} — Part {seriesIdx + 1} of {siblings.length}
              </span>
              {seriesNext ? (
                <Link className="lb-series-nav-btn" href={`/p/${seriesNext.slug}`}>
                  Next <i className="fa-solid fa-chevron-right" />
                </Link>
              ) : (
                <span className="lb-series-nav-btn disabled">
                  Next <i className="fa-solid fa-chevron-right" />
                </span>
              )}
            </div>
          )}

          <div
            className="lb-content has-dropcap"
            itemProp="articleBody"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {a.pdf_url && <PdfViewer url={a.pdf_url} name={a.pdf_name} />}

          {a.source_url && (
            <p className="lb-source-note lb-reveal">
              Originally published on{" "}
              <a href={a.source_url} target="_blank" rel="noopener nofollow">
                LinkedIn <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
              </a>
              .
            </p>
          )}

          {(a.tags || []).length > 0 && (
            <div className="lb-article-tags lb-reveal">
              {a.tags.map((t) => (
                <span key={t} className="lb-card-tag" itemProp="keywords">
                  {t}
                </span>
              ))}
            </div>
          )}

          {showRelated && (
            <div className="lb-related">
              <div className="lb-related-title">RELATED ARTICLES</div>
              <div className="lb-related-grid">
                {related.map((r) => (
                  <Link key={r.id} className="lb-related-card" href={`/p/${r.slug}`}>
                    <div className="lb-related-card-title">{r.title}</div>
                    <div className="lb-related-card-meta">
                      <span>{fmtDate(r.created_at)}</span>
                      {r.views ? <span>👁 {r.views}</span> : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Reactions, comments, bookmark, TTS, copy-link — wired in later tasks */}
          <footer className="lb-article-footer lb-reveal">
            <div className="lb-share-panel">
              <a
                className="lb-share-icon twitter"
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noopener"
                title="Share on X"
                aria-label="Share on X"
              >
                <i className="fa-brands fa-x-twitter" aria-hidden="true" />
              </a>
              <a
                className="lb-share-icon linkedin"
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noopener"
                title="Share on LinkedIn"
                aria-label="Share on LinkedIn"
              >
                <i className="fa-brands fa-linkedin-in" aria-hidden="true" />
              </a>
              <a
                className="lb-share-icon whatsapp"
                href={`https://wa.me/?text=${encodeURIComponent(shareText + "\n\n" + url)}`}
                target="_blank"
                rel="noopener"
                title="Share on WhatsApp"
                aria-label="Share on WhatsApp"
              >
                <i className="fa-brands fa-whatsapp" aria-hidden="true" />
              </a>
              <a
                className="lb-share-icon telegram"
                href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener"
                title="Share on Telegram"
                aria-label="Share on Telegram"
              >
                <i className="fa-brands fa-telegram" aria-hidden="true" />
              </a>
              <a
                className="lb-share-icon email"
                href={`mailto:?subject=${encodeURIComponent(a.title)}&body=${encodeURIComponent(shareText + "\n\n" + url)}`}
                title="Share via Email"
                aria-label="Share via Email"
              >
                <i className="fa-solid fa-envelope" aria-hidden="true" />
              </a>
              <TtsButton />
              <CollectionsManager articleId={a.id} slug={a.slug} title={a.title} coverImage={a.cover_image || ""} />
            </div>
          </footer>

          <div className="lb-author-card lb-reveal">
            <div className="lb-author-avatar lb-author-monogram" aria-hidden="true">
              AE
            </div>
            <div className="lb-author-info">
              <div className="lb-author-name">Amr Elharony</div>
              <div className="lb-author-bio">
                Delivery Lead, Mentor, FinTech Author &amp; Speaker — bridging banking and technology
                to deliver measurable digital transformation across MENA.
              </div>
              <div className="lb-author-links">
                <a
                  className="lb-author-link"
                  href="https://www.linkedin.com/in/amrmelharony"
                  target="_blank"
                  rel="noopener"
                >
                  <i className="fa-brands fa-linkedin-in" /> LinkedIn
                </a>
                <a
                  className="lb-author-link"
                  href="https://t.me/Amrmelharony"
                  target="_blank"
                  rel="noopener"
                >
                  <i className="fa-brands fa-telegram" /> Telegram
                </a>
                <a
                  className="lb-author-link"
                  href="https://adplist.org/mentors/amr-elharony"
                  target="_blank"
                  rel="noopener"
                >
                  <i className="fa-solid fa-calendar-check" /> ADPList
                </a>
              </div>
            </div>
          </div>
          <ArticleEngagement articleId={a.id} slug={a.slug} initialReactions={a.reactions || {}} />
        </article>
      </div>
      <ArticleAnimations slug={a.slug} />
      <ArticleReader slug={a.slug} />
      <ArticleToolbar minutes={Math.max(1, Math.ceil(words / 200))} />
      <ReadingTracker articleId={a.id} slug={a.slug} title={a.title} coverImage={a.cover_image || ""} tags={a.tags || []} />
      <Annotations articleId={a.id} />
    </div>
  );
}
