import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

const PRIVATE = ["/admin", "/review"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      // Amazonbot and AhrefsBot were the top named crawlers of /tag/* in the
      // Nov 2026 usage spike: ~9,300 thin listing pages, each a separate render. Both
      // honour Disallow, and neither is a search engine the blog depends on;
      // articles stay crawlable through /p/ links and the sitemap. A bot follows
      // only its most specific group, so this one repeats the private paths.
      // (Scrapers with fake browser user agents ignore robots.txt; that traffic
      // needs a rate limit at the edge instead.)
      {
        userAgent: ["Amazonbot", "AhrefsBot"],
        allow: "/",
        disallow: [...PRIVATE, "/tag/", "/feed/tag/"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
