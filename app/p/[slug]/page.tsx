import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getArticleBySlug,
  getAllPublishedSlugs,
  getReadNextAndRelated,
  getSeriesSiblings,
} from "@/lib/queries/articles";
import { renderArticleHtml } from "@/lib/markdown/parse";
import { fmtDate, readingTime, isoDate } from "@/lib/format";
import { shareMessage, shareUrls } from "@/lib/share";
import { articleCrumbs, breadcrumbJsonLd } from "@/lib/breadcrumbs";
import ArticleAnimations from "@/components/ArticleAnimations";
import ArticleReader from "@/components/ArticleReader";
import ArticleEngagement from "@/components/ArticleEngagement";
import TtsButton from "@/components/TtsButton";
import ArticleToolbar from "@/components/ArticleToolbar";
import ReadingTracker from "@/components/ReadingTracker";
import CollectionsManager from "@/components/CollectionsManager";
import Annotations from "@/components/Annotations";
import PdfViewer from "@/components/PdfViewer";
import Breadcrumbs from "@/components/Breadcrumbs";
import ReadNext from "@/components/ReadNext";
import ShareActions from "@/components/ShareActions";
import TrendingStrip from "@/components/TrendingStrip";

export const revalidate = 300;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await getAllPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = await getArticleBySlug(slug);
  if (!a) return { title: "Not found", robots: { index: false } };
  const description = a.excerpt || a.title;
  return {
    // `absolute` drops the layout's "· Fintech Bilinguals" suffix so the keyword-rich
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
  const shareText = shareMessage(a.title, a.excerpt);
  const share = shareUrls(a.title, a.excerpt, url);
  const words = (a.content || "").split(/\s+/).filter(Boolean).length;

  const [{ readNext, related }, siblings] = await Promise.all([
    getReadNextAndRelated({ id: a.id, tags: a.tags || [] }),
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
      name: "Fintech Bilinguals",
      logo: { "@type": "ImageObject", url: `${siteUrl}/icon.png` },
    },
    mainEntityOfPage: url,
    ...(a.tags?.length ? { keywords: a.tags.join(", ") } : {}),
  };

  // Breadcrumb trail — shared builder feeds both the JSON-LD and the visible
  // <Breadcrumbs> nav so they can never diverge (lib/breadcrumbs.ts).
  const crumbs = articleCrumbs(a, siteUrl);
  const breadcrumbLd = breadcrumbJsonLd(crumbs);

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

      <Breadcrumbs crumbs={crumbs} siteUrl={siteUrl} />
      {/* Skip-link landing point (app/layout.tsx renders the link itself). */}
      <div id="main-content" tabIndex={-1} className="lb-skip-target" />

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
            <aside className="lb-tldr lb-reveal" aria-label="Key takeaways">
              <div className="lb-tldr-label">
                <i className="fa-solid fa-bolt" aria-hidden="true" /> Key takeaways
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

          {readNext && <ReadNext a={readNext} />}

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

          <TrendingStrip days={7} count={4} title="POPULAR THIS WEEK" />

          {/* Reactions, comments, bookmark, TTS, copy-link — wired in later tasks */}
          <footer className="lb-article-footer lb-reveal">
            <div className="lb-share-panel">
              <a
                className="lb-share-icon twitter"
                href={share.x}
                target="_blank"
                rel="noopener"
                title="Share on X"
                aria-label="Share on X"
              >
                <i className="fa-brands fa-x-twitter" aria-hidden="true" />
              </a>
              <a
                className="lb-share-icon linkedin"
                href={share.linkedin}
                target="_blank"
                rel="noopener"
                title="Share on LinkedIn"
                aria-label="Share on LinkedIn"
              >
                <i className="fa-brands fa-linkedin-in" aria-hidden="true" />
              </a>
              <a
                className="lb-share-icon whatsapp"
                href={share.whatsapp}
                target="_blank"
                rel="noopener"
                title="Share on WhatsApp"
                aria-label="Share on WhatsApp"
              >
                <i className="fa-brands fa-whatsapp" aria-hidden="true" />
              </a>
              <a
                className="lb-share-icon telegram"
                href={share.telegram}
                target="_blank"
                rel="noopener"
                title="Share on Telegram"
                aria-label="Share on Telegram"
              >
                <i className="fa-brands fa-telegram" aria-hidden="true" />
              </a>
              <a
                className="lb-share-icon email"
                href={share.email}
                title="Share via Email"
                aria-label="Share via Email"
              >
                <i className="fa-solid fa-envelope" aria-hidden="true" />
              </a>
              <ShareActions url={url} title={a.title} text={shareText} />
              <TtsButton slug={a.slug} />
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
