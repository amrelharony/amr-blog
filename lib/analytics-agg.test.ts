import { describe, it, expect } from "vitest";
import {
  bucketByPeriod,
  cumulative,
  sumReactions,
  tagDistribution,
  sparklinePoints,
} from "@/lib/analytics-agg";

describe("bucketByPeriod", () => {
  it("buckets by month, chronologically", () => {
    const out = bucketByPeriod(
      ["2026-01-10T00:00:00Z", "2026-01-20T00:00:00Z", "2026-03-01T00:00:00Z"],
      "month",
    );
    expect(out).toEqual([
      { label: "2026-01", count: 2 },
      { label: "2026-03", count: 1 },
    ]);
  });

  it("buckets by week using the Monday (UTC) and crosses year boundaries", () => {
    // 2026-01-01 is a Thursday → that ISO week's Monday is 2025-12-29.
    const out = bucketByPeriod(["2026-01-01T12:00:00Z"], "week");
    expect(out).toEqual([{ label: "2025-12-29", count: 1 }]);
  });

  it("skips invalid/empty dates and returns [] for none", () => {
    expect(bucketByPeriod(["nope", null, undefined], "month")).toEqual([]);
    expect(bucketByPeriod([], "week")).toEqual([]);
  });
});

describe("cumulative", () => {
  it("produces a monotonic running total", () => {
    const out = cumulative([
      { label: "a", count: 2 },
      { label: "b", count: 3 },
      { label: "c", count: 1 },
    ]);
    expect(out.map((x) => x.total)).toEqual([2, 5, 6]);
  });
});

describe("sumReactions", () => {
  it("sums reaction maps and sorts desc", () => {
    const out = sumReactions([
      { reactions: { heart: 2, fire: 1 } },
      { reactions: { heart: 3 } },
      { reactions: null },
    ]);
    expect(out).toEqual([
      { key: "heart", count: 5 },
      { key: "fire", count: 1 },
    ]);
  });
});

describe("tagDistribution", () => {
  it("counts articles + views per tag, sorted by count, capped", () => {
    const out = tagDistribution(
      [
        { tags: ["agile", "fintech"], views: 10 },
        { tags: ["agile"], views: 5 },
        { tags: ["scrum"], views: 100 },
      ],
      2,
    );
    expect(out).toEqual([
      { tag: "agile", count: 2, views: 15 },
      { tag: "scrum", count: 1, views: 100 },
    ]);
  });
});

describe("sparklinePoints", () => {
  it("returns empty for no values and maps a flat box for one value", () => {
    expect(sparklinePoints([], 100, 40)).toBe("");
    expect(sparklinePoints([5], 100, 40)).toMatch(/^\d/); // a single point
  });

  it("spans the width and is deterministic", () => {
    const pts = sparklinePoints([0, 10], 100, 40, 0).split(" ");
    expect(pts).toHaveLength(2);
    expect(pts[0]).toBe("0.0,40.0"); // min → bottom
    expect(pts[1]).toBe("100.0,0.0"); // max → top, full width
  });
});
