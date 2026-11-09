import { describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { articlePagePaths, revalidateArticlePages, MAX_REVALIDATE_SLUGS } from "@/lib/article-pages";

describe("articlePagePaths", () => {
  it("maps slugs to their /p/ paths", () => {
    expect(articlePagePaths(["why-ledgers-matter", "open-banking-101-a3f9c2"])).toEqual([
      "/p/why-ledgers-matter",
      "/p/open-banking-101-a3f9c2",
    ]);
  });

  it("drops non-strings, empty and non-slug values, and dedupes", () => {
    expect(
      articlePagePaths(["ok-slug", "", null, 42, { slug: "x" }, "../admin", "a b", "x/y", "ok-slug", "-lead"]),
    ).toEqual(["/p/ok-slug"]);
  });

  it("caps the number of paths", () => {
    const many = Array.from({ length: MAX_REVALIDATE_SLUGS + 25 }, (_, i) => `slug-${i}`);
    const paths = articlePagePaths(many);
    expect(paths).toHaveLength(MAX_REVALIDATE_SLUGS);
    expect(paths[0]).toBe("/p/slug-0");
  });

  it("rejects over-long slugs", () => {
    expect(articlePagePaths(["a".repeat(200), "b".repeat(201)])).toEqual([`/p/${"a".repeat(200)}`]);
  });
});

describe("revalidateArticlePages", () => {
  it("revalidates each valid path once", () => {
    revalidatePath.mockClear();
    revalidateArticlePages(["one", "two", "one", 7]);
    expect(revalidatePath.mock.calls).toEqual([["/p/one"], ["/p/two"]]);
  });
});
