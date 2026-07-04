import { describe, it, expect } from "vitest";
import { rxCount, isTrending, rankRelated } from "@/lib/ranking";
import type { ArticleCard } from "@/lib/types";

function card(over: Partial<ArticleCard>): ArticleCard {
  return {
    id: "id",
    title: "t",
    slug: "s",
    excerpt: "",
    created_at: "2026-01-01T00:00:00Z",
    tags: [],
    views: 0,
    reactions: {},
    cover_image: "",
    series_name: null,
    ...over,
  };
}

describe("rxCount", () => {
  it("sums all reaction buckets", () => {
    expect(rxCount({ heart: 3, fire: 2 })).toBe(5);
  });

  it("treats null/undefined maps and counts as zero", () => {
    expect(rxCount(null)).toBe(0);
    expect(rxCount(undefined)).toBe(0);
    expect(rxCount({ heart: undefined as unknown as number })).toBe(0);
  });
});

describe("isTrending", () => {
  it("trips at 50 views", () => {
    expect(isTrending(card({ views: 49 }))).toBe(false);
    expect(isTrending(card({ views: 50 }))).toBe(true);
  });

  it("trips at 10 total reactions", () => {
    expect(isTrending(card({ reactions: { heart: 9 } }))).toBe(false);
    expect(isTrending(card({ reactions: { heart: 6, fire: 4 } }))).toBe(true);
  });
});

describe("rankRelated", () => {
  it("ranks tag overlap above views", () => {
    const pool = [
      card({ id: "a", tags: ["x"], views: 999 }),
      card({ id: "b", tags: ["agile", "fintech"], views: 1 }),
    ];
    expect(rankRelated(pool, ["agile", "fintech"]).map((a) => a.id)).toEqual(["b", "a"]);
  });

  it("breaks overlap ties by views, descending", () => {
    const pool = [
      card({ id: "low", tags: ["agile"], views: 5 }),
      card({ id: "high", tags: ["agile"], views: 50 }),
    ];
    expect(rankRelated(pool, ["agile"]).map((a) => a.id)).toEqual(["high", "low"]);
  });

  it("caps results at n (default 4)", () => {
    const pool = Array.from({ length: 7 }, (_, i) => card({ id: `a${i}` }));
    expect(rankRelated(pool, []).length).toBe(4);
    expect(rankRelated(pool, [], 2).length).toBe(2);
  });

  it("does not mutate the input array", () => {
    const pool = [card({ id: "a", views: 1 }), card({ id: "b", views: 2 })];
    rankRelated(pool, []);
    expect(pool.map((a) => a.id)).toEqual(["a", "b"]);
  });

  // The "Read next" card takes the top-1 pick (getReadNextAndRelated slices
  // rankRelated's output), so the head of the ranking must be well-defined.
  it("puts the strongest pick first when the article has no tags (views order)", () => {
    const pool = [
      card({ id: "quiet", views: 1 }),
      card({ id: "popular", views: 100 }),
    ];
    expect(rankRelated(pool, [], 5)[0].id).toBe("popular");
  });

  it("keeps pool order for full ties (stable sort)", () => {
    const pool = [
      card({ id: "first", tags: ["agile"], views: 10 }),
      card({ id: "second", tags: ["agile"], views: 10 }),
    ];
    expect(rankRelated(pool, ["agile"], 5).map((a) => a.id)).toEqual(["first", "second"]);
  });

  it("returns fewer than n when the pool is small, empty pool → empty", () => {
    expect(rankRelated([card({ id: "only" })], ["x"], 5)).toHaveLength(1);
    expect(rankRelated([], ["x"], 5)).toEqual([]);
  });
});
