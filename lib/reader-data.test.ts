import { describe, it, expect } from "vitest";
import {
  buildExport,
  validateImport,
  mergeLists,
  mergeAnnotations,
  mergeHistory,
  MAX_IMPORT_BYTES,
  type ExportedList,
  type ExportedAnnotation,
} from "@/lib/reader-data";

const list = (over: Partial<ExportedList>): ExportedList => ({
  id: "l1",
  cloudId: null,
  name: "Saved",
  emoji: "🔖",
  items: [],
  ...over,
});

const ann = (id: string): ExportedAnnotation => ({
  id,
  text: "highlighted",
  note: null,
  color: "yellow",
  start: 0,
  end: 10,
  created_at: "2026-01-01T00:00:00Z",
});

describe("buildExport", () => {
  it("assembles parsed stores and survives corrupt JSON", () => {
    const out = buildExport({
      lists: '{"lists":[{"id":"a","name":"Saved","emoji":"x","items":[]}]}',
      annotations: "{not json",
      history: null,
      theme: "dark",
    });
    expect(out.version).toBe(1);
    expect(out.lists).toHaveLength(1);
    expect(out.annotations).toEqual({});
    expect(out.history).toEqual({});
    expect(out.theme).toBe("dark");
  });
});

describe("validateImport", () => {
  it("rejects oversized payloads, bad JSON and wrong versions", () => {
    expect(() => validateImport("x".repeat(MAX_IMPORT_BYTES + 1))).toThrow(/too large/);
    expect(() => validateImport("{nope")).toThrow(/valid JSON/);
    expect(() => validateImport('{"version":2}')).toThrow(/version/);
  });

  it("normalizes malformed sections to empty", () => {
    const out = validateImport('{"version":1,"lists":"nope","annotations":[],"history":7}');
    expect(out.lists).toEqual([]);
    expect(out.annotations).toEqual({});
    expect(out.history).toEqual({});
  });
});

describe("mergeLists", () => {
  it("unions items by articleId, matching lists by name", () => {
    const cur = [list({ items: [{ articleId: "a", slug: "a" }] })];
    const inc = [list({ id: "other-device", items: [{ articleId: "a", slug: "a" }, { articleId: "b", slug: "b" }] })];
    const out = mergeLists(cur, inc);
    expect(out).toHaveLength(1);
    expect(out[0].items.map((i) => i.articleId)).toEqual(["a", "b"]);
  });

  it("adds unknown lists with cloudId cleared (cloud ids are per-account/device)", () => {
    const out = mergeLists([], [list({ name: "Deep dives", cloudId: "cloud-1" })]);
    expect(out[0].cloudId).toBeNull();
  });

  it("matches default lists even when renamed", () => {
    const cur = [list({ name: "Saved", isDefault: true })];
    const inc = [list({ name: "Guardado", isDefault: true, items: [{ articleId: "x", slug: "x" }] })];
    const out = mergeLists(cur, inc);
    expect(out).toHaveLength(1);
    expect(out[0].items.map((i) => i.articleId)).toEqual(["x"]);
  });
});

describe("mergeAnnotations", () => {
  it("unions per-article annotations by id", () => {
    const out = mergeAnnotations({ art1: [ann("a")] }, { art1: [ann("a"), ann("b")], art2: [ann("c")] });
    expect(out.art1.map((a) => a.id)).toEqual(["a", "b"]);
    expect(out.art2.map((a) => a.id)).toEqual(["c"]);
  });
});

describe("mergeHistory", () => {
  it("keeps the furthest progress and completion from either side", () => {
    const out = mergeHistory(
      { art1: { slug: "s", progress: 0.9, last_read_at: "2026-01-01T00:00:00Z" } },
      { art1: { slug: "s", progress: 0.4, completed: true, last_read_at: "2026-06-01T00:00:00Z" } },
    );
    expect(out.art1.progress).toBe(0.9);
    expect(out.art1.completed).toBe(true);
    expect(out.art1.last_read_at).toBe("2026-06-01T00:00:00Z");
  });

  it("adds entries missing locally", () => {
    const out = mergeHistory({}, { art2: { slug: "x", progress: 0.2 } });
    expect(out.art2.slug).toBe("x");
  });
});
