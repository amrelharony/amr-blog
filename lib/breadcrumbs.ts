// Breadcrumb builders shared by the visible <Breadcrumbs> nav and the
// BreadcrumbList JSON-LD, so the two can never diverge.

export interface Crumb {
  name: string;
  item: string;
}

/**
 * Article trail: Home → [first tag] → article. The feed is the home page, and
 * /tag/[tag] routes exist, so a tag level avoids a duplicate-URL "Home → Home".
 */
export function articleCrumbs(
  a: { title: string; slug: string; tags?: string[] | null },
  siteUrl: string,
): Crumb[] {
  const firstTag = a.tags?.[0];
  return [
    { name: "Home", item: siteUrl },
    ...(firstTag
      ? [{ name: firstTag, item: `${siteUrl}/tag/${encodeURIComponent(firstTag)}` }]
      : []),
    { name: a.title, item: `${siteUrl}/p/${a.slug}` },
  ];
}

/** Category trail: Home → category hub. */
export function categoryCrumbs(
  cat: { label: string; slug: string },
  siteUrl: string,
): Crumb[] {
  return [
    { name: "Home", item: siteUrl },
    { name: cat.label, item: `${siteUrl}/category/${cat.slug}` },
  ];
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  };
}
