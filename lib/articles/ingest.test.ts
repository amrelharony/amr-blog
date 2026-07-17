import { describe, it, expect } from "vitest";
import {
  MAX_TITLE,
  MAX_CONTENT,
  MAX_EXCERPT,
  MAX_TAGS,
  MAX_TAG,
  presentedKey,
  validKey,
  normTags,
  safeName,
  decodeBasename,
  isInternalHost,
  checkUrl,
  validateArticleFields,
  suffixSlug,
  resolveUniqueSlug,
} from "@/lib/articles/ingest";

const NOW = Date.UTC(2026, 6, 1); // fixed clock for schedule tests

function valid(body: Record<string, unknown>) {
  const r = validateArticleFields(body, NOW);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.prepared;
}
function invalid(body: Record<string, unknown>) {
  const r = validateArticleFields(body, NOW);
  if (r.ok) throw new Error("expected failure, got ok");
  return r;
}

describe("presentedKey", () => {
  it("extracts a Bearer token (case-insensitive, trimmed)", () => {
    expect(presentedKey(new Headers({ authorization: "Bearer  abc123 " }))).toBe("abc123");
    expect(presentedKey(new Headers({ authorization: "bearer xyz" }))).toBe("xyz");
  });
  it("falls back to x-articles-api-key", () => {
    expect(presentedKey(new Headers({ "x-articles-api-key": "k" }))).toBe("k");
  });
  it("prefers the Bearer header over the fallback", () => {
    expect(
      presentedKey(new Headers({ authorization: "Bearer a", "x-articles-api-key": "b" })),
    ).toBe("a");
  });
  it("returns null when neither is present", () => {
    expect(presentedKey(new Headers())).toBeNull();
    expect(presentedKey(new Headers({ authorization: "Basic abc" }))).toBeNull();
  });
});

describe("validKey", () => {
  it("accepts a matching key", () => {
    expect(validKey("secret", "secret")).toBe(true);
  });
  it("rejects a mismatched key", () => {
    expect(validKey("wrong", "secret")).toBe(false);
    expect(validKey("secre", "secret")).toBe(false); // length differs — must not throw
  });
  it("rejects when the server key is unset (regardless of what is presented)", () => {
    expect(validKey("anything", undefined)).toBe(false);
    expect(validKey("", undefined)).toBe(false);
    expect(validKey(null, undefined)).toBe(false);
  });
  it("treats an empty configured key as unset", () => {
    expect(validKey("", "")).toBe(false);
  });
  it("rejects a null presented key even when the server key is set", () => {
    expect(validKey(null, "secret")).toBe(false);
  });
});

describe("normTags", () => {
  it("accepts an array, trimming and dropping empties", () => {
    expect(normTags([" a ", "", "b", 3])).toEqual(["a", "b", "3"]);
  });
  it("splits a comma string", () => {
    expect(normTags("a, b ,,c")).toEqual(["a", "b", "c"]);
  });
  it("returns [] for anything else", () => {
    expect(normTags(null)).toEqual([]);
    expect(normTags(42)).toEqual([]);
    expect(normTags({})).toEqual([]);
  });
});

describe("safeName / decodeBasename", () => {
  it("keeps only the basename across / and \\ separators", () => {
    expect(safeName("dir/sub/file.pdf")).toBe("file.pdf");
    expect(safeName("dir\\sub\\file.pdf")).toBe("file.pdf");
    expect(safeName("../../etc/passwd")).toBe("passwd");
  });
  it("caps at 120 chars and falls back to document.pdf", () => {
    expect(safeName("x".repeat(200))).toHaveLength(120);
    expect(safeName("")).toBe("document.pdf");
    expect(safeName("dir/")).toBe("document.pdf");
  });
  it("decodeBasename never throws on malformed sequences", () => {
    expect(decodeBasename("file%20name.pdf")).toBe("file name.pdf");
    expect(decodeBasename("bad%zz")).toBe("bad%zz");
  });
});

describe("isInternalHost", () => {
  const internal = [
    "localhost",
    "sub.localhost",
    "printer.local",
    "db.internal",
    "metadata.google.internal",
    "::1",
    "::",
    "[::1]", // bracketed IPv6
    "fe80::1", // link-local
    "fc00::1", // ULA
    "fd12:3456::1", // ULA
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:10.0.0.5", // IPv4-mapped private
    "0.0.0.0",
    "127.0.0.1",
    "127.255.255.255",
    "10.0.0.1",
    "169.254.169.254", // cloud metadata
    "169.254.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "100.64.0.1", // CGNAT low edge
    "100.127.255.255", // CGNAT high edge
    "2130706433", // bare decimal for 127.0.0.1
    "0x7f000001", // bare hex for 127.0.0.1
    "::ffff:7f00:1", // hex-form IPv4-mapped loopback
    "017.0.0.1", // octal-octet loopback (inet_aton parses 017 as 15)
    "010.0.0.1", // zero-padded octet ambiguity
  ];
  const external = [
    "example.com",
    "blog.amrelharony.com",
    "8.8.8.8",
    "11.0.0.1",
    "128.0.0.1",
    "172.15.0.1", // just below the private /12
    "172.32.0.1", // just above the private /12
    "192.169.1.1",
    "100.63.255.255", // just below CGNAT
    "100.128.0.0", // just above CGNAT
    "169.253.1.1",
    "999.1.1.1", // >255 octet: not a real v4 — let it fail at fetch time
    "2606:4700::1111", // public IPv6
  ];
  it.each(internal)("flags %s as internal", (h) => {
    expect(isInternalHost(h)).toBe(true);
  });
  it.each(external)("allows %s", (h) => {
    expect(isInternalHost(h)).toBe(false);
  });
});

describe("checkUrl", () => {
  it("treats absent values as ok with a null URL", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(checkUrl(v, "pdf_url", false)).toEqual({ ok: true, url: null });
    }
  });
  it("rejects unparseable URLs", () => {
    expect(checkUrl("not a url", "pdf_url", false)).toEqual({
      ok: false,
      error: "pdf_url must be a valid URL",
    });
  });
  it("enforces https when http is not allowed", () => {
    expect(checkUrl("http://example.com/a.pdf", "pdf_url", false)).toEqual({
      ok: false,
      error: "pdf_url must be an https URL",
    });
  });
  it("allows http only when allowHttp is set, never other protocols", () => {
    const ok = checkUrl("http://example.com/x", "source_url", true);
    expect(ok.ok).toBe(true);
    expect(checkUrl("ftp://example.com/x", "source_url", true)).toEqual({
      ok: false,
      error: "source_url must be an http(s) URL",
    });
  });
  it("rejects internal hosts", () => {
    expect(checkUrl("https://169.254.169.254/latest", "cover_image", false)).toEqual({
      ok: false,
      error: "cover_image must not point to an internal/loopback address",
    });
  });
  it("returns the parsed URL for a valid value (trimmed)", () => {
    const r = checkUrl(" https://example.com/doc.pdf ", "pdf_url", false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url?.href).toBe("https://example.com/doc.pdf");
  });
});

describe("validateArticleFields", () => {
  it("accepts a minimal body with draft defaults", () => {
    const p = valid({ title: "Hello World", content: "body text" });
    expect(p).toMatchObject({
      title: "Hello World",
      content: "body text",
      category: null,
      status: "draft",
      published: false,
      scheduledAt: null,
      linkedin: false,
      warnings: [],
      excerpt: "",
      tldr: null,
      seriesName: null,
      tags: [],
      seriesOrder: 0,
      pdfUrl: null,
      pdfName: null,
      coverImage: "",
      sourceUrl: null,
      baseSlug: "hello-world",
      explicitSlug: false,
    });
  });

  it("requires and caps title", () => {
    expect(invalid({ content: "x" })).toEqual({ ok: false, error: "title is required", field: "title" });
    expect(invalid({ title: "   ", content: "x" }).field).toBe("title");
    expect(invalid({ title: "t".repeat(MAX_TITLE + 1), content: "x" })).toEqual({
      ok: false,
      error: `title must be ${MAX_TITLE} characters or fewer`,
      field: "title",
    });
  });

  it("requires and caps content", () => {
    expect(invalid({ title: "t" })).toEqual({ ok: false, error: "content is required", field: "content" });
    expect(invalid({ title: "t", content: "x".repeat(MAX_CONTENT + 1) }).field).toBe("content");
  });

  it("resolves category case-insensitively to the canonical label", () => {
    expect(valid({ title: "t", content: "c", category: "fintech" }).category).toBe("Fintech");
    expect(valid({ title: "t", content: "c", category: "TECH" }).category).toBe("Tech");
    const r = invalid({ title: "t", content: "c", category: "Sports" });
    expect(r.field).toBe("category");
    expect(r.error).toContain("category must be one of:");
  });

  it("validates status", () => {
    expect(valid({ title: "t", content: "c", status: "PUBLISH" }).published).toBe(true);
    expect(invalid({ title: "t", content: "c", status: "live" }).field).toBe("status");
  });

  it("validates the schedule matrix against the injected clock", () => {
    const base = { title: "t", content: "c", status: "schedule" };
    expect(invalid({ ...base }).error).toBe("scheduled_at is required when status is 'schedule'");
    expect(invalid({ ...base, scheduled_at: "not-a-date" }).error).toBe(
      "scheduled_at must be a valid ISO-8601 date",
    );
    expect(invalid({ ...base, scheduled_at: new Date(NOW - 1000).toISOString() }).error).toBe(
      "scheduled_at must be in the future",
    );
    expect(invalid({ ...base, scheduled_at: new Date(NOW).toISOString() }).error).toBe(
      "scheduled_at must be in the future", // boundary: exactly now is not future
    );
    expect(
      invalid({ ...base, scheduled_at: new Date(NOW + 3 * 365 * 86400_000).toISOString() }).error,
    ).toBe("scheduled_at is too far in the future (max ~2 years)");
    const p = valid({ ...base, scheduled_at: new Date(NOW + 86400_000).toISOString() });
    expect(p.published).toBe(false);
    expect(p.scheduledAt).toBe(new Date(NOW + 86400_000).toISOString());
  });

  it("warns when linkedin=true is set on a draft", () => {
    expect(valid({ title: "t", content: "c", linkedin: true }).warnings).toHaveLength(1);
    expect(valid({ title: "t", content: "c", status: "publish", linkedin: true }).warnings).toEqual([]);
    // only literal true opts in
    expect(valid({ title: "t", content: "c", linkedin: "true" }).linkedin).toBe(false);
  });

  it("caps the bounded text fields with exact error messages", () => {
    expect(invalid({ title: "t", content: "c", excerpt: "e".repeat(MAX_EXCERPT + 1) })).toEqual({
      ok: false,
      error: `excerpt must be ${MAX_EXCERPT} characters or fewer`,
      field: "excerpt",
    });
    expect(invalid({ title: "t", content: "c", tldr: "e".repeat(501) }).field).toBe("tldr");
    expect(invalid({ title: "t", content: "c", series_name: "s".repeat(201) }).field).toBe("series_name");
  });

  it("normalizes tags: string or array, per-tag and count caps", () => {
    expect(valid({ title: "t", content: "c", tags: "a, b" }).tags).toEqual(["a", "b"]);
    const many = valid({ title: "t", content: "c", tags: Array.from({ length: 30 }, (_, i) => `t${i}`) });
    expect(many.tags).toHaveLength(MAX_TAGS);
    const long = valid({ title: "t", content: "c", tags: ["x".repeat(80)] });
    expect(long.tags[0]).toHaveLength(MAX_TAG);
  });

  it("coerces series_order to a bounded non-negative integer", () => {
    const so = (v: unknown) => valid({ title: "t", content: "c", series_order: v }).seriesOrder;
    expect(so(3.7)).toBe(3);
    expect(so("5")).toBe(5);
    expect(so(-1)).toBe(0);
    expect(so(Infinity)).toBe(0);
    expect(so(NaN)).toBe(0);
    expect(so(1e9)).toBe(100000);
    expect(so(undefined)).toBe(0);
  });

  it("validates the URL fields and derives pdf_name", () => {
    expect(invalid({ title: "t", content: "c", pdf_url: "http://x.com/a.pdf" }).field).toBe("pdf_url");
    expect(invalid({ title: "t", content: "c", cover_image: "https://10.0.0.1/x.png" }).field).toBe("cover_image");
    // source_url may be http
    expect(valid({ title: "t", content: "c", source_url: "http://example.com/post" }).sourceUrl).toBe(
      "http://example.com/post",
    );
    // explicit pdf_name wins, sanitized to a basename
    const named = valid({
      title: "t",
      content: "c",
      pdf_url: "https://vps.example.com/files/report.pdf",
      pdf_name: "dir/../my report.pdf",
    });
    expect(named.pdfUrl).toBe("https://vps.example.com/files/report.pdf");
    expect(named.pdfName).toBe("my report.pdf");
    // otherwise derived from the URL basename, percent-decoded
    const derived = valid({ title: "t", content: "c", pdf_url: "https://vps.example.com/files/q3%20review.pdf" });
    expect(derived.pdfName).toBe("q3 review.pdf");
    // trailing slash -> fallback name
    const fallback = valid({ title: "t", content: "c", pdf_url: "https://vps.example.com/files/" });
    expect(fallback.pdfName).toBe("document.pdf");
    // pdf_name without pdf_url is ignored
    expect(valid({ title: "t", content: "c", pdf_name: "x.pdf" }).pdfName).toBeNull();
  });

  it("derives the slug from the title, or uses an explicit slug", () => {
    expect(valid({ title: "My Great Post!", content: "c" }).baseSlug).toBe("my-great-post");
    const p = valid({ title: "t", content: "c", slug: "Custom Slug" });
    expect(p.baseSlug).toBe("custom-slug");
    expect(p.explicitSlug).toBe(true);
    expect(invalid({ title: "!!!", content: "c" })).toEqual({
      ok: false,
      error: "could not derive a slug from the title; provide an explicit slug",
      field: "slug",
    });
  });
});

describe("suffixSlug", () => {
  it("appends the suffix to a short base", () => {
    expect(suffixSlug("my-post", "ab12")).toBe("my-post-ab12");
  });
  it("truncates the base at 75 and the whole slug at 80", () => {
    const long = "x".repeat(100);
    const out = suffixSlug(long, "abcd");
    expect(out).toBe("x".repeat(75) + "-abcd");
    expect(out.length).toBeLessThanOrEqual(80);
    expect(suffixSlug(long, "abcdef").length).toBeLessThanOrEqual(80);
  });
});

describe("resolveUniqueSlug", () => {
  const hexSeq = (...vals: string[]) => {
    let i = 0;
    return () => vals[i++] ?? "ffff";
  };

  it("returns the base slug untouched when free", async () => {
    const isTaken = async () => false;
    expect(await resolveUniqueSlug("my-post", false, isTaken, hexSeq())).toEqual({
      ok: true,
      slug: "my-post",
    });
  });

  it("conflicts on a taken explicit slug without retrying", async () => {
    let calls = 0;
    const isTaken = async () => (calls++, true);
    expect(await resolveUniqueSlug("my-post", true, isTaken, hexSeq("aaaa"))).toEqual({ ok: false });
    expect(calls).toBe(1);
  });

  it("retries an auto slug with random suffixes until free", async () => {
    const taken = new Set(["my-post", "my-post-aaaa"]);
    const isTaken = async (s: string) => taken.has(s);
    expect(await resolveUniqueSlug("my-post", false, isTaken, hexSeq("aaaa", "bbbb"))).toEqual({
      ok: true,
      slug: "my-post-bbbb",
    });
  });

  it("gives up after 5 attempts and returns the last candidate (DB constraint is the backstop)", async () => {
    let checks = 0;
    const isTaken = async () => (checks++, true);
    const r = await resolveUniqueSlug("my-post", false, isTaken, hexSeq("1111", "2222", "3333", "4444", "5555"));
    expect(r).toEqual({ ok: true, slug: "my-post-5555" });
    expect(checks).toBe(5);
  });
});
