import { describe, it, expect } from "vitest";
import { parseActivityFilters, activityQueryString } from "./activity";

describe("parseActivityFilters", () => {
  it("defaults to page 1 and empty filters", () => {
    const f = parseActivityFilters({});
    expect(f).toEqual({ action: "", entity: "", from: "", to: "", page: 1 });
  });

  it("keeps a valid page and valid ISO days", () => {
    const f = parseActivityFilters({ page: "4", from: "2026-07-01", to: "2026-07-27" });
    expect(f.page).toBe(4);
    expect(f.from).toBe("2026-07-01");
    expect(f.to).toBe("2026-07-27");
  });

  it("drops malformed dates", () => {
    const f = parseActivityFilters({ from: "2026-13-01", to: "nonsense" });
    expect(f.from).toBe("");
    expect(f.to).toBe("");
  });

  it("truncates over-long action/entity filters", () => {
    const f = parseActivityFilters({ action: "a".repeat(200) });
    expect(f.action).toHaveLength(64);
  });

  // An unbounded ?page= produced an offset that serializes into the PostgREST Range
  // header as "5e+21" or "Infinity". That is a parse error, not the PGRST103 that
  // fetchActivityPage catches, so the "empty page instead of a crash" guard was
  // bypassed and both /admin/activity and the CSV export 500'd.
  it.each([
    // Beyond Number.MAX_SAFE_INTEGER the value can't index anything meaningful, so it
    // falls back to page 1 rather than to the ceiling.
    ["1e20", 1],
    ["1e400", 1],
    ["Infinity", 1],
    ["9007199254740993", 1],
    ["abc", 1],
    ["", 1],
    ["0", 1],
    ["-5", 1],
    ["2.9", 2],
    // A merely large-but-safe page clamps to the ceiling.
    ["5000000", 1_000_000],
  ])("clamps ?page=%s to %i", (raw, expected) => {
    const { page } = parseActivityFilters({ page: raw });
    expect(page).toBe(expected);
    expect(Number.isSafeInteger(page)).toBe(true);
    // The offset it feeds must stay an exact integer, never exponential notation.
    expect(String((page - 1) * 50)).toMatch(/^\d+$/);
  });

  it("takes the first value when a param repeats", () => {
    expect(parseActivityFilters({ page: ["3", "9"] }).page).toBe(3);
  });
});

describe("activityQueryString", () => {
  it("omits page 1 and empty filters", () => {
    expect(activityQueryString({ action: "", entity: "", from: "", to: "", page: 1 })).toBe("");
  });

  it("round-trips filters back through the parser", () => {
    const f = { action: "publish", entity: "article", from: "2026-07-01", to: "2026-07-27", page: 3 };
    const qs = activityQueryString(f);
    const parsed = parseActivityFilters(
      Object.fromEntries(new URLSearchParams(qs.slice(1)).entries()),
    );
    expect(parsed).toEqual(f);
  });
});
