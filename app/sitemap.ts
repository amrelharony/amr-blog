// Native sitemap (served at /sitemap.xml) — ported from api/sitemap.js, with
// the image sitemap extension via the `images` field.
import type { MetadataRoute } from "next";
import { getSitemapArticles } from "@/lib/queries/articles";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getSitemapArticles(5000);

  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => {
    // Prefer updated_at so edits bump <lastmod> and search engines re-crawl.
    const last = a.updated_at || a.created_at;
    return {
      url: `${SITE}/p/${a.slug}`,
      lastModified: last ? new Date(last) : undefined,
      changeFrequency: "monthly",
      priority: 0.8,
      images: a.cover_image ? [a.cover_image] : undefined,
    };
  });

  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE}/thoughts`, changeFrequency: "weekly", priority: 0.7 },
    ...articleEntries,
  ];
}
