// Pure validation/normalization logic for POST /api/articles (the token-authed
// ingest endpoint the openclaw agent publishes through). Kept here, free of
// Supabase/Next, so the auth check, SSRF guard, field caps, and slug-collision
// arithmetic are unit-testable (vitest covers lib/** only) — same split as
// lib/chat/rate-limit.ts. The route (app/api/articles/route.ts) owns I/O:
// body read, service client, insert + 23505 retry, revalidation, after().
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { slugify } from "@/lib/format";
import { CATEGORY_LABELS, categoryByLabel } from "@/lib/categories";

export const MAX_TITLE = 200;
export const MAX_BODY_BYTES = 1_000_000; // ~1 MB of JSON — generous for very long articles
// Per-field cap on the markdown body. Far beyond any real article (~100k words) but
// well under MAX_BODY_BYTES, so a single field can't carry a near-1 MB render payload —
// defense-in-depth backstop alongside the bounded markdown regexes (render is O(n)).
export const MAX_CONTENT = 600_000;
// Per-field caps. title+excerpt feed the LinkedIn auto-post (hard ~3000-char
// commentary limit), so excerpt must stay small; the rest bound cached feed/search
// payloads served to every reader.
export const MAX_EXCERPT = 500;
export const MAX_TLDR = 500;
export const MAX_SERIES = 200;
export const MAX_TAG = 50;
export const MAX_TAGS = 20;
export const MAX_SCHEDULE_MS = 2 * 365 * 24 * 60 * 60 * 1000; // schedule at most ~2 years out
export const STATUSES = ["draft", "publish", "schedule"] as const;
export type Status = (typeof STATUSES)[number];

/** Bearer token (or x-articles-api-key) presented by the caller, or null. */
export function presentedKey(headers: Headers): string | null {
  const auth = headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  return headers.get("x-articles-api-key");
}

// Random per-boot stand-in hashed when the real key or the presented key is
// absent, so every call does identical hash+compare work and response timing
// can't reveal whether ARTICLES_API_KEY is configured.
const DUMMY_KEY = randomBytes(32).toString("hex");

/** Constant-time key check. Hash both sides so length never leaks and
 *  timingSafeEqual (which throws on length mismatch) always gets equal lengths. */
export function validKey(presented: string | null, expected: string | undefined): boolean {
  const a = createHash("sha256").update(presented ?? DUMMY_KEY).digest();
  const b = createHash("sha256").update(expected || DUMMY_KEY).digest();
  const eq = timingSafeEqual(a, b);
  return eq && !!expected && presented !== null;
}

export function normTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

/** Download filename for the viewer: basename only, trimmed, length-capped. */
export function safeName(name: string): string {
  const base = (name || "").split(/[\\/]/).pop() || "";
  return base.trim().slice(0, 120) || "document.pdf";
}

/** decodeURIComponent that never throws on a malformed sequence. */
export function decodeBasename(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Reject URLs whose host is a loopback / private / link-local / cloud-metadata
 *  target, so an agent-supplied pdf_url/cover_image can't drive SSRF (the LinkedIn
 *  cron fetches cover_image server-side; pdf_url is fetched by visitors' browsers).
 *  Literal IPs + localhost-style names only — DNS-rebinding is caught at fetch time. */
export function isInternalHost(hostname: string): boolean {
  let h = hostname.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1); // strip IPv6 brackets
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal") return true;
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true; // IPv6 link-local + ULA
  const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/); // IPv4-mapped IPv6
  const ipv4 = mapped ? mapped[1] : (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) ? h : null);
  if (ipv4) {
    const p = ipv4.split(".").map(Number);
    if (p.some((n) => n > 255)) return false; // not a real v4 — let it fail at fetch
    const [a, b] = p;
    if (a === 0 || a === 127 || a === 10) return true; // this-host, loopback, private
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

/** Validate + normalize an optional URL field. Returns the parsed URL (or null
 *  when absent), or an error message for a 400. `allowHttp` permits http: too. */
export function checkUrl(
  raw: unknown,
  field: string,
  allowHttp: boolean,
): { ok: true; url: URL | null } | { ok: false; error: string } {
  if (raw == null || String(raw).trim() === "") return { ok: true, url: null };
  let u: URL;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return { ok: false, error: `${field} must be a valid URL` };
  }
  const okProto = u.protocol === "https:" || (allowHttp && u.protocol === "http:");
  if (!okProto) return { ok: false, error: `${field} must be an ${allowHttp ? "http(s)" : "https"} URL` };
  if (!u.hostname) return { ok: false, error: `${field} must include a host` };
  if (isInternalHost(u.hostname)) {
    return { ok: false, error: `${field} must not point to an internal/loopback address` };
  }
  return { ok: true, url: u };
}

export interface PreparedArticle {
  title: string;
  content: string;
  category: string | null;
  status: Status;
  published: boolean;
  scheduledAt: string | null;
  linkedin: boolean;
  warnings: string[];
  excerpt: string;
  tldr: string | null;
  seriesName: string | null;
  tags: string[];
  seriesOrder: number;
  pdfUrl: string | null;
  pdfName: string | null;
  coverImage: string;
  sourceUrl: string | null;
  baseSlug: string;
  explicitSlug: boolean;
}

export type ValidationResult =
  | { ok: true; prepared: PreparedArticle }
  | { ok: false; error: string; field?: string };

/** Steps 3–8 of ingest: required fields, category, status/schedule matrix,
 *  bounded text fields, URL checks, PDF filename, and slug derivation.
 *  Every failure maps to a 400 with the offending field. */
export function validateArticleFields(
  body: Record<string, unknown>,
  now: number = Date.now(),
): ValidationResult {
  const bad = (error: string, field?: string): ValidationResult => ({ ok: false, error, field });

  // Required fields
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return bad("title is required", "title");
  if (title.length > MAX_TITLE) return bad(`title must be ${MAX_TITLE} characters or fewer`, "title");

  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) return bad("content is required", "content");
  if (content.length > MAX_CONTENT) return bad(`content must be ${MAX_CONTENT} characters or fewer`, "content");

  // Category (case-insensitive; stored as the canonical label)
  let category: string | null = null;
  if (body.category != null && String(body.category).trim() !== "") {
    const def = categoryByLabel(String(body.category));
    if (!def) return bad(`category must be one of: ${CATEGORY_LABELS.join(", ")}`, "category");
    category = def.label;
  }

  // Status -> (published, scheduled_at)
  const status = (body.status ? String(body.status) : "draft").toLowerCase() as Status;
  if (!STATUSES.includes(status)) {
    return bad(`status must be one of: ${STATUSES.join(", ")}`, "status");
  }
  let published = false;
  let scheduledAt: string | null = null;
  if (status === "publish") {
    published = true;
  } else if (status === "schedule") {
    if (body.scheduled_at == null || String(body.scheduled_at).trim() === "") {
      return bad("scheduled_at is required when status is 'schedule'", "scheduled_at");
    }
    const d = new Date(String(body.scheduled_at));
    if (Number.isNaN(d.getTime())) return bad("scheduled_at must be a valid ISO-8601 date", "scheduled_at");
    if (d.getTime() <= now) return bad("scheduled_at must be in the future", "scheduled_at");
    if (d.getTime() > now + MAX_SCHEDULE_MS) {
      return bad("scheduled_at is too far in the future (max ~2 years)", "scheduled_at");
    }
    scheduledAt = d.toISOString();
  }

  // LinkedIn opt-in: linkedin=true -> linkedin_posted=false (the hourly cron
  // picks it up); linkedin=false -> linkedin_posted=true (suppressed).
  const linkedin = body.linkedin === true;
  const warnings: string[] = [];
  if (status === "draft" && linkedin) {
    warnings.push(
      "linkedin=true has no effect on a draft: LinkedIn auto-posts only published or scheduled articles within the ~6h freshness window. Publish or schedule to distribute.",
    );
  }

  // Bounded text fields. Caps stop agent input from breaking shared surfaces:
  // an oversized title+excerpt 422s the LinkedIn auto-post, and long values
  // bloat the cached RSS/feed payloads served to every reader.
  const excerpt = typeof body.excerpt === "string" ? body.excerpt.trim() : "";
  if (excerpt.length > MAX_EXCERPT) return bad(`excerpt must be ${MAX_EXCERPT} characters or fewer`, "excerpt");
  const tldr = typeof body.tldr === "string" && body.tldr.trim() !== "" ? body.tldr.trim() : null;
  if (tldr && tldr.length > MAX_TLDR) return bad(`tldr must be ${MAX_TLDR} characters or fewer`, "tldr");
  const seriesName = typeof body.series_name === "string" && body.series_name.trim() !== "" ? body.series_name.trim() : null;
  if (seriesName && seriesName.length > MAX_SERIES) {
    return bad(`series_name must be ${MAX_SERIES} characters or fewer`, "series_name");
  }
  const tags = normTags(body.tags).map((t) => t.slice(0, MAX_TAG)).slice(0, MAX_TAGS);
  // Coerce series_order to a bounded non-negative integer (the column is integer;
  // floats / Infinity / huge values would otherwise error or truncate at the DB).
  const so = Math.trunc(Number(body.series_order));
  const seriesOrder = Number.isFinite(so) && so > 0 ? Math.min(so, 100000) : 0;

  // Optional URLs — validate + normalize. pdf_url/cover_image must be https
  // (pdf renders client-side; cover_image is fetched server-side by the LinkedIn
  // cron, so pinning it to a real https URL matters); source_url may be http(s).
  const pdfCheck = checkUrl(body.pdf_url, "pdf_url", false);
  if (!pdfCheck.ok) return bad(pdfCheck.error, "pdf_url");
  const coverCheck = checkUrl(body.cover_image, "cover_image", false);
  if (!coverCheck.ok) return bad(coverCheck.error, "cover_image");
  const sourceCheck = checkUrl(body.source_url, "source_url", true);
  if (!sourceCheck.ok) return bad(sourceCheck.error, "source_url");

  const pdfUrl = pdfCheck.url ? pdfCheck.url.href : null;
  const pdfName = pdfCheck.url
    ? typeof body.pdf_name === "string" && body.pdf_name.trim() !== ""
      ? safeName(body.pdf_name)
      : safeName(decodeBasename(pdfCheck.url.pathname.split("/").pop() || ""))
    : null;
  const coverImage = coverCheck.url ? coverCheck.url.href : "";
  const sourceUrl = sourceCheck.url ? sourceCheck.url.href : null;

  // Slug — derive from title unless an explicit slug is given
  const explicitSlug = typeof body.slug === "string" && body.slug.trim() !== "";
  const baseSlug = slugify(explicitSlug ? (body.slug as string) : title);
  if (!baseSlug) {
    return bad("could not derive a slug from the title; provide an explicit slug", "slug");
  }

  return {
    ok: true,
    prepared: {
      title,
      content,
      category,
      status,
      published,
      scheduledAt,
      linkedin,
      warnings,
      excerpt,
      tldr,
      seriesName,
      tags,
      seriesOrder,
      pdfUrl,
      pdfName,
      coverImage,
      sourceUrl,
      baseSlug,
      explicitSlug,
    },
  };
}

/** Collision suffix arithmetic shared by the pre-check loop and the route's
 *  23505 insert retry: keep room for "-xxxx(xx)" and stay within 80 chars. */
export function suffixSlug(base: string, hex: string): string {
  return (base.slice(0, 75) + "-" + hex).slice(0, 80);
}

/** Resolve slug collisions ahead of insert. Explicit slug -> conflict is the
 *  caller's to fix. Auto slug -> retry with a random suffix; after 5 attempts
 *  the last candidate is returned anyway — the DB unique constraint (and the
 *  route's 23505 retry) is the backstop for the check->insert TOCTOU race. */
export async function resolveUniqueSlug(
  baseSlug: string,
  explicit: boolean,
  isTaken: (slug: string) => Promise<boolean>,
  randHex: (bytes: number) => string,
): Promise<{ ok: true; slug: string } | { ok: false }> {
  let slug = baseSlug;
  if (explicit) {
    if (await isTaken(slug)) return { ok: false };
    return { ok: true, slug };
  }
  for (let attempt = 0; attempt < 5 && (await isTaken(slug)); attempt++) {
    slug = suffixSlug(baseSlug, randHex(2)); // 4 hex chars
  }
  return { ok: true, slug };
}
