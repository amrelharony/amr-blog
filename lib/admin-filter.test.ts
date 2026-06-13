import { describe, it, expect } from "vitest";
import { textMatch, filterSort, pubStatus } from "@/lib/admin-filter";

describe("textMatch", () => {
  it("matches case-insensitively and treats empty query as match-all", () => {
    expect(textMatch("Agile Banking", "agile")).toBe(true);
    expect(textMatch("Agile", "  ")).toBe(true);
    expect(textMatch("Agile", "xyz")).toBe(false);
    expect(textMatch("", "a")).toBe(false);
  });
});

interface Row {
  title: string;
  author?: string;
  published?: boolean;
  scheduled_at?: string | null;
  views?: number;
  created_at: string;
}
const rows: Row[] = [
  { title: "Agile", author: "Amr", published: true, views: 10, created_at: "2026-03-01" },
  { title: "FinTech", author: "Guest", published: false, scheduled_at: "2026-09-01", views: 5, created_at: "2026-02-01" },
  { title: "Draft One", author: "Amr", published: false, scheduled_at: null, views: 99, created_at: "2026-01-01" },
];

const comparators = {
  newest: (a: Row, b: Row) => b.created_at.localeCompare(a.created_at),
  views: (a: Row, b: Row) => (b.views || 0) - (a.views || 0),
  title: (a: Row, b: Row) => a.title.localeCompare(b.title),
};

describe("filterSort", () => {
  it("filters by query across multiple fields", () => {
    const out = filterSort(rows, { query: "amr", fields: (r) => [r.title, r.author] });
    expect(out.map((r) => r.title)).toEqual(["Agile", "Draft One"]);
  });

  it("filters by derived status", () => {
    const out = filterSort(rows, { status: "sched", statusOf: pubStatus });
    expect(out.map((r) => r.title)).toEqual(["FinTech"]);
  });

  it("returns all when status is 'all'", () => {
    expect(filterSort(rows, { status: "all", statusOf: pubStatus })).toHaveLength(3);
  });

  it("sorts via the named comparator", () => {
    expect(filterSort(rows, { sort: "views", comparators }).map((r) => r.title)).toEqual([
      "Draft One",
      "Agile",
      "FinTech",
    ]);
    expect(filterSort(rows, { sort: "title", comparators }).map((r) => r.title)).toEqual([
      "Agile",
      "Draft One",
      "FinTech",
    ]);
  });

  it("combines query, status, and sort", () => {
    const out = filterSort(rows, {
      query: "amr",
      fields: (r) => [r.author],
      status: "draft",
      statusOf: pubStatus,
      sort: "newest",
      comparators,
    });
    expect(out.map((r) => r.title)).toEqual(["Draft One"]);
  });

  it("does not mutate the input when sorting", () => {
    const order = rows.map((r) => r.title);
    filterSort(rows, { sort: "title", comparators });
    expect(rows.map((r) => r.title)).toEqual(order);
  });
});

describe("pubStatus", () => {
  it("maps published/scheduled/draft", () => {
    expect(pubStatus({ published: true })).toBe("live");
    expect(pubStatus({ published: false, scheduled_at: "2026-09-01" })).toBe("sched");
    expect(pubStatus({ published: false, scheduled_at: null })).toBe("draft");
    expect(pubStatus({})).toBe("draft");
  });
});
