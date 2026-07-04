import { describe, it, expect } from "vitest";
import {
  groupByYear,
  articlesInYear,
  tagCounts,
  tagWeight,
  seriesIndex,
} from "@/lib/archive";

const row = (created_at: string, over: Record<string, unknown> = {}) => ({
  slug: "s",
  title: "t",
  created_at,
  ...over,
});

describe("groupByYear", () => {
  it("groups by UTC year, newest first", () => {
    const out = groupByYear([
      row("2024-05-01T00:00:00Z"),
      row("2026-01-01T00:00:00Z"),
      row("2026-12-31T23:59:59Z"),
    ]);
    expect(out).toEqual([
      { year: 2026, count: 2 },
      { year: 2024, count: 1 },
    ]);
  });

  it("drops unparseable dates and handles empty input", () => {
    expect(groupByYear([row("not-a-date"), row("2025-01-01T00:00:00Z")])).toEqual([
      { year: 2025, count: 1 },
    ]);
    expect(groupByYear([])).toEqual([]);
  });
});

describe("articlesInYear", () => {
  it("filters to the year and sorts newest first", () => {
    const a = row("2025-01-01T00:00:00Z", { slug: "a" });
    const b = row("2025-06-01T00:00:00Z", { slug: "b" });
    const c = row("2024-06-01T00:00:00Z", { slug: "c" });
    expect(articlesInYear([a, b, c], 2025).map((r) => r.slug)).toEqual(["b", "a"]);
  });
});

describe("tagCounts", () => {
  it("counts across rows, sorted by count then name", () => {
    const out = tagCounts([
      { tags: ["fintech", "agile"] },
      { tags: ["fintech"] },
      { tags: ["banking", "agile"] },
      { tags: null },
    ]);
    expect(out).toEqual([
      { tag: "agile", count: 2 },
      { tag: "fintech", count: 2 },
      { tag: "banking", count: 1 },
    ]);
  });

  it("ignores empty tags", () => {
    expect(tagCounts([{ tags: ["", "x"] }])).toEqual([{ tag: "x", count: 1 }]);
  });
});

describe("tagWeight", () => {
  it("maps the max count to maxPx and low counts near minPx, monotonic", () => {
    expect(tagWeight(100, 100)).toBe(26);
    expect(tagWeight(1, 100)).toBeGreaterThanOrEqual(12);
    expect(tagWeight(1, 100)).toBeLessThan(tagWeight(50, 100));
    expect(tagWeight(0, 100)).toBe(12);
    expect(tagWeight(3, 1)).toBe(12); // degenerate max
  });
});

describe("seriesIndex", () => {
  it("aggregates counts and latest date, most recently updated first", () => {
    const out = seriesIndex([
      { series_name: "Agile 101", created_at: "2025-01-01T00:00:00Z" },
      { series_name: "Fintech Deep Dives", created_at: "2026-03-01T00:00:00Z" },
      { series_name: "Agile 101", created_at: "2026-05-01T00:00:00Z" },
      { series_name: null, created_at: "2026-06-01T00:00:00Z" },
      { series_name: "  ", created_at: "2026-06-01T00:00:00Z" },
    ]);
    expect(out).toEqual([
      { name: "Agile 101", count: 2, latest: "2026-05-01T00:00:00Z" },
      { name: "Fintech Deep Dives", count: 1, latest: "2026-03-01T00:00:00Z" },
    ]);
  });
});
