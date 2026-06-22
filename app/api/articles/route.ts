// POST /api/articles — token-authed ingest endpoint so an external agent (the
// self-hosted "openclaw" model on the VPS) can publish long-form markdown
// articles. Articles render with full GFM (tables, headings, lists, callouts,
// footnotes, embeds) — only images are stripped, at display time, by
// lib/markdown/sanitize.ts. Content is therefore stored RAW here, mirroring the
// admin editor (app/admin/write/page.tsx).
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

export async function POST(req: NextRequest) {
  // 1. Auth
  if (!validKey(presentedKey(req))) {
    return fail("Unauthorized", 401);
  }

  // 2. Read + size-cap + parse body
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return fail("Request body too large", 413);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}");
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("not an object");
  } catch {
    return fail("Invalid JSON body", 400);
  }

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

  // 7. Slug — derive from title unless an explicit slug is given
  const explicitSlug = typeof body.slug === "string" && body.slug.trim() !== "";
  const baseSlug = slugify(explicitSlug ? (body.slug as string) : title);
  if (!baseSlug) {
    return fail("could not derive a slug from the title; provide an explicit slug", 400, "slug");
  }

  // 8. Build the service client (service role bypasses RLS for a session-less write)
  let sb;
  try {
    sb = createServiceClient();
  } catch {
    return fail("Server not configured for article ingest", 500);
  }

  // 9. Resolve slug collisions. Explicit slug -> 409. Auto slug -> md5/random suffix.
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

  // 10. Insert — row shape mirrors save() in app/admin/write/page.tsx. created_at /
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
  };

  const { data, error } = await sb
    .from("longform_articles")
    .insert(row)
    .select("id,slug")
    .single();

  if (error || !data) {
    if (error?.code === "23505") return fail("slug already in use", 409, "slug"); // unique violation backstop
    return fail("Failed to save article", 500);
  }

  // 11. Revalidate ISR caches when the article is visible now. Drafts and future
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
      warnings,
    },
    { status: 201 },
  );
}
