import { describe, it, expect } from "vitest";
import { buildAffinity, scoreArticle, rankForYou, type HistoryEntry } from "@/lib/affinity";
import type { ArticleCard } from "@/lib/types";

const NOW = new Date("2026-06-13T00:00:00Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function hist(entries: Record<string, HistoryEntry>): Record<string, HistoryEntry> {
  return entries;
}
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

describe("buildAffinity", () => {
  it("weights completed reads above partial above the visit floor", () => {
    const a = buildAffinity(
      hist({
        done: { tags: ["x"], completed: true, last_read_at: daysAgo(0) },
        half: { tags: ["y"], progress: 50, last_read_at: daysAgo(0) },
        peek: { tags: ["z"], progress: 1, last_read_at: daysAgo(0) },
      }),
      NOW,
    );
    expect(a.get("x")).toBeCloseTo(1, 5);
    expect(a.get("y")).toBeCloseTo(0.5, 5);
    expect(a.get("z")).toBeCloseTo(0.15, 5); // floor
    expect(a.get("x")!).toBeGreaterThan(a.get("y")!);
    expect(a.get("y")!).toBeGreaterThan(a.get("z")!);
  });

  it("halves a tag's weight roughly every 30 days", () => {
    const a = buildAffinity(
      hist({
        recent: { tags: ["agile"], completed: true, last_read_at: daysAgo(0) },
      }),
      NOW,
    );
    const b = buildAffinity(
      hist({
        old: { tags: ["agile"], completed: true, last_read_at: daysAgo(30) },
      }),
      NOW,
    );
    expect(b.get("agile")! / a.get("agile")!).toBeCloseTo(0.5, 2);
  });

  it("accumulates a tag across multiple articles", () => {
    const a = buildAffinity(
      hist({
        one: { tags: ["fintech"], completed: true, last_read_at: daysAgo(0) },
        two: { tags: ["fintech"], completed: true, last_read_at: daysAgo(0) },
      }),
      NOW,
    );
    expect(a.get("fintech")).toBeCloseTo(2, 5);
  });

  it("ignores entries with no tags and never crashes on missing fields", () => {
    const a = buildAffinity(
      hist({
        notags: { completed: true, last_read_at: daysAgo(0) },
        nodate: { tags: ["d"], progress: 100 },
      }),
      NOW,
    );
    expect(a.has("undefined")).toBe(false);
    // missing last_read_at → no decay (treated as fresh)
    expect(a.get("d")).toBeCloseTo(1, 5);
  });

  it("returns an empty map for empty/missing history", () => {
    expect(buildAffinity({}, NOW).size).toBe(0);
    expect(buildAffinity(undefined as unknown as Record<string, HistoryEntry>, NOW).size).toBe(0);
  });
});

describe("scoreArticle", () => {
  it("averages matched-tag affinities so tag-stuffing doesn't win", () => {
    const aff = new Map([
      ["agile", 1],
      ["fintech", 1],
    ]);
    const focused = scoreArticle(["agile", "fintech"], aff); // mean 1
    const stuffed = scoreArticle(["agile", "fintech", "x", "y", "z", "w"], aff); // mean 2/6
    expect(focused).toBeGreaterThan(stuffed);
    expect(focused).toBeCloseTo(1, 5);
    expect(stuffed).toBeCloseTo(2 / 6, 5);
  });

  it("scores no-tag and unknown-tag articles as 0", () => {
    const aff = new Map([["agile", 1]]);
    expect(scoreArticle([], aff)).toBe(0);
    expect(scoreArticle(null, aff)).toBe(0);
    expect(scoreArticle(["unknown"], aff)).toBe(0);
  });
});

describe("rankForYou", () => {
  const aff = new Map([
    ["agile", 2],
    ["fintech", 1],
  ]);

  it("excludes touched slugs and zero-affinity articles", () => {
    const pool = [
      card({ id: "a", slug: "read-it", tags: ["agile"] }),
      card({ id: "b", slug: "no-affinity", tags: ["cooking"] }),
      card({ id: "c", slug: "fresh", tags: ["fintech"] }),
    ];
    const out = rankForYou(pool, aff, { excludeSlugs: new Set(["read-it"]), n: 10 });
    expect(out.map((a) => a.slug)).toEqual(["fresh"]);
  });

  it("sorts by score then views then recency, capped at n", () => {
    const pool = [
      card({ id: "lo", slug: "lo", tags: ["fintech"], views: 100 }),
      card({ id: "hi", slug: "hi", tags: ["agile"], views: 1 }),
      card({ id: "tieA", slug: "tieA", tags: ["agile"], views: 5, created_at: "2026-02-01T00:00:00Z" }),
      card({ id: "tieB", slug: "tieB", tags: ["agile"], views: 5, created_at: "2026-03-01T00:00:00Z" }),
    ];
    const out = rankForYou(pool, aff, { excludeSlugs: new Set(), n: 3 });
    // agile (score 2) ranks above fintech (score 1); among agile ties, higher
    // views first, then newer created_at.
    expect(out.map((a) => a.slug)).toEqual(["tieB", "tieA", "hi"]);
  });

  it("does not mutate the input pool", () => {
    const pool = [
      card({ id: "a", slug: "a", tags: ["fintech"] }),
      card({ id: "b", slug: "b", tags: ["agile"] }),
    ];
    rankForYou(pool, aff, { excludeSlugs: new Set(), n: 10 });
    expect(pool.map((a) => a.slug)).toEqual(["a", "b"]);
  });
});
