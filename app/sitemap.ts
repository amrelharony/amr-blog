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
  }));

  // Category hubs rank as section landing pages — higher priority than leaves.
  const categoryEntries: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${SITE}/category/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  // Archive year pages, derived from the same rows the article entries use.
  const years = [
    ...new Set(
      articles
        .map((a) => new Date(a.created_at).getUTCFullYear())
        .filter((y) => Number.isFinite(y)),
    ),
  ];
  const archiveEntries: MetadataRoute.Sitemap = years.map((y) => ({
    url: `${SITE}/archive/${y}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1.0 },
    ...categoryEntries,
    { url: `${SITE}/thoughts`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/archive`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/tags`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/series`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/search`, changeFrequency: "monthly", priority: 0.4 },
    ...archiveEntries,
    ...articleEntries,
  ];
}
