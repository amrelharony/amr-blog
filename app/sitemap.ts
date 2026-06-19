// Native sitemap (served at /sitemap.xml) — ported from api/sitemap.js, with
// the image sitemap extension via the `images` field.
import type { MetadataRoute } from "next";
import { getAllPublishedForSitemap } from "@/lib/queries/articles";
import { CATEGORIES } from "@/lib/categories";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getAllPublishedForSitemap();

  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${SITE}/p/${a.slug}`,
    lastModified: a.created_at ? new Date(a.created_at) : undefined,
    changeFrequency: "monthly",
    priority: 0.8,
    images: a.cover_image ? [a.cover_image] : undefined,
  }));

  // Category hubs rank as section landing pages — higher priority than leaves.
  const categoryEntries: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${SITE}/category/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1.0 },
    ...categoryEntries,
    { url: `${SITE}/thoughts`, changeFrequency: "weekly", priority: 0.7 },
    ...articleEntries,
  ];
}
