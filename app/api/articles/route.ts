// POST /api/articles — token-authed ingest endpoint so an external agent (the
// self-hosted "openclaw" model on the VPS) can publish long-form markdown
// articles. Articles render with full GFM (tables, headings, lists, callouts,
// footnotes, embeds) — only images are stripped, at display time, by
// lib/markdown/sanitize.ts. Content is therefore stored RAW here, mirroring the
// admin editor (app/admin/write/page.tsx).
//
// An article may carry one optional PDF: the agent hosts it on its VPS (HTTPS +
// CORS) and passes the URL as `pdf_url`; we store the URL and the inline pdf.js
// viewer (components/PdfViewer.tsx) fetches it client-side. We never fetch it
// server-side, so there's no SSRF surface.
//
// Auth: Authorization: Bearer <ARTICLES_API_KEY> (or x-articles-api-key header).
// Writes run through the service-role client (lib/supabase/service.ts) because the
// request has no admin session.
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { slugify } from "@/lib/format";
import { CATEGORY_LABELS, categoryByLabel } from "@/lib/categories";
import { slugTakenServer } from "@/lib/queries/admin-articles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TITLE = 200;
const MAX_BODY_BYTES = 1_000_000; // ~1 MB of JSON — generous for very long articles
const STATUSES = ["draft", "publish", "schedule"] as const;
type Status = (typeof STATUSES)[number];

function fail(error: string, status: number, field?: string) {
  return NextResponse.json({ ok: false, error, ...(field ? { field } : {}) }, { status });
}

/** Bearer token (or x-articles-api-key) presented by the caller, or null. */
function presentedKey(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  return req.headers.get("x-articles-api-key");
}

/** Constant-time key check. Hash both sides so length never leaks and
 *  timingSafeEqual (which throws on length mismatch) always gets equal lengths. */
function validKey(presented: string | null): boolean {
  const expected = process.env.ARTICLES_API_KEY;
  if (!expected || !presented) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function normTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

/** Download filename for the viewer: basename only, trimmed, length-capped. */
function safeName(name: string): string {
  const base = (name || "").split(/[\\/]/).pop() || "";
  return base.trim().slice(0, 120) || "document.pdf";
}

/** decodeURIComponent that never throws on a malformed sequence. */
function decodeBasename(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export async function POST(req: NextRequest) {
  // 1. Auth
  if (!validKey(presentedKey(req))) return fail("Unauthorized", 401);

  // 2. Read + size-cap + parse the JSON body
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return fail("Request body too large", 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}");
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("not an object");
  } catch {
    return fail("Invalid JSON body", 400);
  }

  return ingest(body);
}

/** Validate the article fields, attach an optional PDF URL, insert, and revalidate. */
async function ingest(body: Record<string, unknown>): Promise<NextResponse> {
  // 3. Required fields
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return fail("title is required", 400, "title");
  if (title.length > MAX_TITLE) return fail(`title must be ${MAX_TITLE} characters or fewer`, 400, "title");

  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) return fail("content is required", 400, "content");

  // 4. Category (case-insensitive; stored as the canonical label)
  let category: string | null = null;
  if (body.category != null && String(body.category).trim() !== "") {
    const def = categoryByLabel(String(body.category));
    if (!def) return fail(`category must be one of: ${CATEGORY_LABELS.join(", ")}`, 400, "category");
    category = def.label;
  }

  // 5. Status -> (published, scheduled_at)
  const status = (body.status ? String(body.status) : "draft").toLowerCase() as Status;
  if (!STATUSES.includes(status)) {
    return fail(`status must be one of: ${STATUSES.join(", ")}`, 400, "status");
  }
  let published = false;
  let scheduledAt: string | null = null;
  if (status === "publish") {
    published = true;
  } else if (status === "schedule") {
    if (body.scheduled_at == null || String(body.scheduled_at).trim() === "") {
      return fail("scheduled_at is required when status is 'schedule'", 400, "scheduled_at");
    }
    const d = new Date(String(body.scheduled_at));
    if (Number.isNaN(d.getTime())) return fail("scheduled_at must be a valid ISO-8601 date", 400, "scheduled_at");
    if (d.getTime() <= Date.now()) return fail("scheduled_at must be in the future", 400, "scheduled_at");
    scheduledAt = d.toISOString();
  }

  // 6. LinkedIn opt-in: linkedin=true -> linkedin_posted=false (the hourly cron
  //    picks it up); linkedin=false -> linkedin_posted=true (suppressed).
  const linkedin = body.linkedin === true;
  const warnings: string[] = [];
  if (status === "draft" && linkedin) {
    warnings.push(
      "linkedin=true has no effect on a draft: LinkedIn auto-posts only published or scheduled articles within the ~6h freshness window. Publish or schedule to distribute.",
    );
  }

  // 7. Optional PDF — the agent hosts it on its VPS and passes the URL. Must be
  //    https (the blog is https; an http URL would be blocked as mixed content).
  //    Validate only; the browser fetches it, so there's no server-side fetch.
  let pdfUrl: string | null = null;
  let pdfName: string | null = null;
  if (body.pdf_url != null && String(body.pdf_url).trim() !== "") {
    const candidate = String(body.pdf_url).trim();
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return fail("pdf_url must be a valid URL", 400, "pdf_url");
    }
    if (parsed.protocol !== "https:") return fail("pdf_url must be an https URL", 400, "pdf_url");
    if (!parsed.hostname) return fail("pdf_url must include a host", 400, "pdf_url");
    pdfUrl = parsed.href; // store the normalized absolute URL, not the raw caller string
    pdfName =
      typeof body.pdf_name === "string" && body.pdf_name.trim() !== ""
        ? safeName(body.pdf_name)
        : safeName(decodeBasename(parsed.pathname.split("/").pop() || ""));
  }

  // 8. Slug — derive from title unless an explicit slug is given
  const explicitSlug = typeof body.slug === "string" && body.slug.trim() !== "";
  const baseSlug = slugify(explicitSlug ? (body.slug as string) : title);
  if (!baseSlug) {
    return fail("could not derive a slug from the title; provide an explicit slug", 400, "slug");
  }

  // 9. Build the service client (service role bypasses RLS for a session-less write)
  let sb;
  try {
    sb = createServiceClient();
  } catch {
    return fail("Server not configured for article ingest", 500);
  }

  // 10. Resolve slug collisions. Explicit slug -> 409. Auto slug -> random suffix.
  let slug = baseSlug;
  if (explicitSlug) {
    if (await slugTakenServer(sb, slug, "")) {
      return fail("slug already in use", 409, "slug");
    }
  } else {
    for (let attempt = 0; attempt < 5 && (await slugTakenServer(sb, slug, "")); attempt++) {
      const suffix = "-" + randomBytes(2).toString("hex"); // 4 hex chars
      slug = (baseSlug.slice(0, 75) + suffix).slice(0, 80);
    }
  }

  // 11. Insert — row shape mirrors save() in app/admin/write/page.tsx. created_at /
  //     updated_at are left to DB defaults so a published article stays fresh for
  //     the LinkedIn window.
  const row = {
    title,
    slug,
    excerpt: typeof body.excerpt === "string" ? body.excerpt.trim() : "",
    content,
    cover_image: typeof body.cover_image === "string" ? body.cover_image.trim() : "",
    tags: normTags(body.tags),
    category,
    source_url:
      typeof body.source_url === "string" && body.source_url.trim() !== "" ? body.source_url.trim() : null,
    series_name:
      typeof body.series_name === "string" && body.series_name.trim() !== "" ? body.series_name.trim() : null,
    series_order: Number(body.series_order) || 0,
    tldr: typeof body.tldr === "string" && body.tldr.trim() !== "" ? body.tldr.trim() : null,
    published,
    scheduled_at: scheduledAt,
    linkedin_posted: !linkedin,
    pdf_url: pdfUrl,
    pdf_name: pdfName,
  };

  // Insert. For an AUTO-derived slug, a 23505 unique-violation (a collision the
  // pre-check missed, or a check->insert TOCTOU race) is retried with a fresh
  // suffix. An EXPLICIT slug surfaces 409 — that's the caller's to fix.
  let data: { id: string; slug: string } | null = null;
  let error: { code?: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await sb.from("longform_articles").insert(row).select("id,slug").single();
    data = res.data;
    error = res.error;
    if (!error) break;
    if (error.code === "23505" && !explicitSlug && attempt < 3) {
      row.slug = (baseSlug.slice(0, 75) + "-" + randomBytes(3).toString("hex")).slice(0, 80);
      continue;
    }
    break;
  }
  if (error || !data) {
    if (error?.code === "23505") return fail("slug already in use", 409, "slug"); // unique-constraint backstop
    return fail("Failed to save article", 500);
  }

  // 12. Revalidate ISR caches when the article is visible now. Drafts and future
  //     schedules are refreshed later by the db-keepalive publish cron.
  if (published) {
    revalidatePath("/");
    revalidatePath(`/p/${data.slug}`);
    revalidatePath("/sitemap.xml");
    revalidatePath("/feed.xml");
    if (category) {
      const def = categoryByLabel(category);
      if (def) revalidatePath(`/category/${def.slug}`);
    }
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return NextResponse.json(
    {
      ok: true,
      id: data.id,
      slug: data.slug,
      url: `${site}/p/${data.slug}`,
      status,
      published,
      scheduled_at: scheduledAt,
      linkedin_posted: !linkedin,
      pdf_url: pdfUrl,
      pdf_name: pdfName,
      warnings,
    },
    { status: 201 },
  );
}
