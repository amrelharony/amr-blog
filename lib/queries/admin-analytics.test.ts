import { describe, it, expect } from "vitest";
import {
  aggregateCategories,
  aggregateTags,
  sumViewsByDay,
  UNCATEGORIZED_LABEL,
  type ArticleFact,
} from "@/lib/queries/admin-analytics";
import { CATEGORY_LABELS } from "@/lib/categories";

const fact = (over: Partial<ArticleFact> = {}): ArticleFact => ({
  id: "x",
  category: null,
  tags: null,
  views: 0,
  published: true,
  ...over,
});

describe("aggregateCategories", () => {
  it("renders all canonical categories plus Uncategorized even with no rows", () => {
    const out = aggregateCategories([]);
    expect(out.map((b) => b.label)).toEqual([...CATEGORY_LABELS, UNCATEGORIZED_LABEL]);
    expect(out.every((b) => b.articles === 0 && b.totalViews === 0 && b.avgViews === 0)).toBe(true);
  });

  it("buckets nulls into Uncategorized and keeps unknown labels visible", () => {
    const out = aggregateCategories([
      fact({ category: "Fintech", views: 10 }),
      fact({ category: null, views: 5 }),
      fact({ category: "Typo Category", views: 3 }),
    ]);
    expect(out.map((b) => b.label)).toEqual([
      ...CATEGORY_LABELS,
      UNCATEGORIZED_LABEL,
      "Typo Category",
    ]);
    expect(out.find((b) => b.label === UNCATEGORIZED_LABEL)).toMatchObject({
      articles: 1,
      totalViews: 5,
    });
    expect(out.find((b) => b.label === "Typo Category")).toMatchObject({
      articles: 1,
      totalViews: 3,
    });
  });

  it("counts published separately and averages over published only", () => {
    const out = aggregateCategories([
      fact({ category: "Tech", views: 90, published: true }),
      fact({ category: "Tech", views: 10, published: true }),
      fact({ category: "Tech", views: 20, published: false }), // unpublished views still counted in total
    ]);
    const tech = out.find((b) => b.label === "Tech")!;
    expect(tech).toMatchObject({ articles: 3, published: 2, totalViews: 120, avgViews: 60 });
  });

  it("reports zero average when a bucket has no published articles", () => {
    const out = aggregateCategories([fact({ category: "Business", views: 40, published: false })]);
    const biz = out.find((b) => b.label === "Business")!;
    expect(biz).toMatchObject({ articles: 1, published: 0, totalViews: 40, avgViews: 0 });
  });
});

describe("aggregateTags", () => {
  it("skips null/blank tags and accumulates count + views per tag", () => {
    const out = aggregateTags([
      fact({ tags: ["ai", "fintech"], views: 10 }),
      fact({ tags: ["ai", "", "  "], views: 5 }),
      fact({ tags: null, views: 99 }),
    ]);
    expect(out).toEqual([
      { tag: "ai", count: 2, views: 15 },
      { tag: "fintech", count: 1, views: 10 },
    ]);
  });

  it("sorts by count desc, then views desc, then name, and honors topN", () => {
    const rows = [
      fact({ tags: ["b"], views: 5 }),
      fact({ tags: ["a"], views: 5 }),
      fact({ tags: ["c"], views: 9 }),
      fact({ tags: ["popular"], views: 1 }),
      fact({ tags: ["popular"], views: 1 }),
    ];
    const out = aggregateTags(rows, 3);
    expect(out.map((t) => t.tag)).toEqual(["popular", "c", "a"]);
  });
});

describe("sumViewsByDay", () => {
  const today = new Date("2026-07-07T15:30:00Z");

  it("zero-fills a contiguous UTC window ending today, oldest first", () => {
    const out = sumViewsByDay([], 3, today);
    expect(out).toEqual([
      { day: "2026-07-05", views: 0 },
      { day: "2026-07-06", views: 0 },
      { day: "2026-07-07", views: 0 },
    ]);
  });

  it("sums multiple rollup rows on the same day and ignores out-of-window days", () => {
    const out = sumViewsByDay(
      [
        { day: "2026-07-06", views: 3 },
        { day: "2026-07-06", views: 4 },
        { day: "2026-07-07", views: 1 },
        { day: "2026-01-01", views: 500 }, // outside window
        { day: "", views: 9 }, // malformed
      ],
      2,
      today,
    );
    expect(out).toEqual([
      { day: "2026-07-06", views: 7 },
      { day: "2026-07-07", views: 1 },
    ]);
  });

  it("accepts timestamp-shaped day values by truncating to the date part", () => {
    const out = sumViewsByDay([{ day: "2026-07-07T00:00:00", views: 2 }], 1, today);
    expect(out).toEqual([{ day: "2026-07-07", views: 2 }]);
  });
});
