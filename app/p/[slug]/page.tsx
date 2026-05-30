import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getArticleBySlug, getAllPublishedSlugs } from "@/lib/queries/articles";
import { renderArticleHtml } from "@/lib/markdown/parse";
import { fmtDate, readingTime } from "@/lib/format";

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
    title: a.title,
    description,
    alternates: { canonical: `/p/${a.slug}` },
    openGraph: {
      type: "article",
      title: a.title,
      description,
      url: `/p/${a.slug}`,
      images: a.cover_image ? [{ url: a.cover_image, width: 1200, height: 630 }] : undefined,
      publishedTime: a.created_at,
      modifiedTime: a.updated_at,
      tags: a.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: a.title,
      description,
      images: a.cover_image ? [a.cover_image] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const a = await getArticleBySlug(slug);
  if (!a) notFound();

  const html = renderArticleHtml(a.content);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.title,
    description: a.excerpt || a.title,
    datePublished: a.created_at,
    dateModified: a.updated_at,
    ...(a.cover_image ? { image: a.cover_image } : {}),
    author: { "@type": "Person", name: "Amr Elharony", url: "https://amrelharony.com" },
    mainEntityOfPage: `${siteUrl}/p/${a.slug}`,
    ...(a.tags?.length ? { keywords: a.tags.join(", ") } : {}),
  };

  return (
    <main className="lb-article" style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1rem" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/" className="lb-back" style={{ fontSize: ".85rem", opacity: 0.7 }}>
        ← All writing
      </Link>
      <header className="lb-article-header" style={{ margin: "1rem 0 1.5rem" }}>
        <h1 style={{ margin: "0 0 .5rem" }}>{a.title}</h1>
        <div className="lb-article-meta" style={{ fontSize: ".85rem", opacity: 0.6 }}>
          {fmtDate(a.created_at)} · {readingTime(a.content)} · {a.views} views
        </div>
      </header>
      {a.cover_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="lb-article-cover" src={a.cover_image} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: "1.5rem" }} />
      ) : null}
      <article className="lb-article-body" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
