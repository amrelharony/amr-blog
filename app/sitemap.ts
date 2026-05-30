// Native sitemap (served at /sitemap.xml) — ported from api/sitemap.js, with
// the image sitemap extension via the `images` field.
import type { MetadataRoute } from "next";
import { getFeedArticles } from "@/lib/queries/articles";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getFeedArticles(5000);

  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${SITE}/p/${a.slug}`,
    lastModified: a.created_at ? new Date(a.created_at) : undefined,
    changeFrequency: "monthly",
    priority: 0.8,
    images: a.cover_image ? [a.cover_image] : undefined,
  }));

  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE}/thoughts`, changeFrequency: "weekly", priority: 0.7 },
    ...articleEntries,
  ];
}
