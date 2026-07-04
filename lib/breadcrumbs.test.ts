import { describe, it, expect } from "vitest";
import { articleCrumbs, categoryCrumbs, breadcrumbJsonLd } from "./breadcrumbs";

const site = "https://blog.example.com";

describe("articleCrumbs", () => {
  it("builds Home → tag → article when the article has tags", () => {
    const crumbs = articleCrumbs(
      { title: "My Post", slug: "my-post", tags: ["Fintech", "Other"] },
      site,
    );
    expect(crumbs).toEqual([
      { name: "Home", item: site },
      { name: "Fintech", item: `${site}/tag/Fintech` },
      { name: "My Post", item: `${site}/p/my-post` },
    ]);
  });

  it("skips the tag level when there are no tags", () => {
    expect(articleCrumbs({ title: "T", slug: "t", tags: [] }, site)).toHaveLength(2);
    expect(articleCrumbs({ title: "T", slug: "t", tags: null }, site)).toHaveLength(2);
  });

  it("URL-encodes the tag segment", () => {
    const crumbs = articleCrumbs(
      { title: "T", slug: "t", tags: ["AI & Fintech"] },
      site,
    );
    expect(crumbs[1].item).toBe(`${site}/tag/${encodeURIComponent("AI & Fintech")}`);
    expect(crumbs[1].name).toBe("AI & Fintech"); // display name stays readable
  });
});

describe("categoryCrumbs", () => {
  it("builds Home → category hub", () => {
    expect(categoryCrumbs({ label: "Fintech", slug: "fintech" }, site)).toEqual([
      { name: "Home", item: site },
      { name: "Fintech", item: `${site}/category/fintech` },
    ]);
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers positions 1..n and preserves names/items", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", item: site },
      { name: "Post", item: `${site}/p/post` },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement.map((e) => e.position)).toEqual([1, 2]);
    expect(ld.itemListElement[1]).toMatchObject({ name: "Post", item: `${site}/p/post` });
  });
});
