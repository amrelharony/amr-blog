// POST /api/articles — token-authed ingest endpoint so an external agent (the
// self-hosted "openclaw" model on the VPS) can publish long-form markdown
// articles. Articles render with full GFM (tables, headings, lists, callouts,
// footnotes, embeds) — only images are stripped, at display time, by
// lib/markdown/sanitize.ts. Content is therefore stored RAW here, mirroring the
// admin editor (app/admin/write/page.tsx).
//
// Two request shapes:
//   - application/json: the article fields (back-compatible original contract).
//   - multipart/form-data: a `payload` field holding that SAME JSON, plus an
//     optional `pdf` file part. The PDF is hosted in a public Supabase Storage
//     bucket and rendered inline on the article page.
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
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const PDF_BUCKET = "article-pdfs";
const STATUSES = ["draft", "publish", "schedule"] as const;
type Status = (typeof STATUSES)[number];

type PdfUpload = { buffer: Buffer; name: string };

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

export async function POST(req: NextRequest) {
  // 1. Auth
  if (!validKey(presentedKey(req))) return fail("Unauthorized", 401);

  // 2. Parse the body (+ optional PDF) by content-type. The JSON branch is
  //    byte-for-byte the original behavior; multipart adds the PDF.
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  let body: Record<string, unknown>;
  let pdf: PdfUpload | null = null;

  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail("Invalid multipart body", 400);
    }
    const payloadRaw = form.get("payload");
    try {
      body = JSON.parse(typeof payloadRaw === "string" ? payloadRaw : "{}");
      if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("not an object");
    } catch {
      return fail("invalid payload JSON", 400, "payload");
    }

    const file = form.get("pdf");
    if (file && typeof file !== "string") {
      // Validate before any DB write: size, then authoritative magic bytes
      // (client Content-Type is advisory only).
      if (file.size === 0) return fail("empty PDF", 400, "pdf");
      if (file.size > MAX_PDF_BYTES) return fail("PDF too large (max 25MB)", 413, "pdf");
      const ab = await file.arrayBuffer();
      const head = new Uint8Array(ab.slice(0, 5));
      const isPdf =
        head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d; // "%PDF-"
      if (!isPdf) return fail("file is not a valid PDF", 415, "pdf");
      pdf = { buffer: Buffer.from(ab), name: safeName(file.name) };
    }
  } else {
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return fail("Request body too large", 413);
    try {
      body = JSON.parse(raw || "{}");
      if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("not an object");
    } catch {
      return fail("Invalid JSON body", 400);
    }
  }

  return ingest(body, pdf);
}

/** Validate the article fields, insert the row, optionally attach a PDF, and
 *  revalidate. Shared by the JSON and multipart paths. */
async function ingest(body: Record<string, unknown>, pdf: PdfUpload | null): Promise<NextResponse> {
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

  // 9. Resolve slug collisions. Explicit slug -> 409. Auto slug -> random suffix.
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
  //     the LinkedIn window. pdf_url/pdf_name are set after upload (step 11).
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

  const { data, error } = await sb.from("longform_articles").insert(row).select("id,slug").single();
  if (error || !data) {
    if (error?.code === "23505") return fail("slug already in use", 409, "slug"); // unique violation backstop
    return fail("Failed to save article", 500);
  }

  // 11. Attach the PDF, if any. Insert-first/upload-after means a partial failure
  //     never orphans a Storage object, and the row is rolled back on error so we
  //     never leave an article pointing at a missing PDF. The path uses the row id
  //     (server-generated) so the client can't influence it (no traversal).
  let pdfUrl: string | null = null;
  let pdfName: string | null = null;
  if (pdf) {
    const path = `${data.id}/${randomBytes(8).toString("hex")}.pdf`;
    const up = await sb.storage
      .from(PDF_BUCKET)
      .upload(path, pdf.buffer, { contentType: "application/pdf", upsert: false });
    if (up.error) {
      await sb.from("longform_articles").delete().eq("id", data.id);
      return fail("PDF upload failed", 502, "pdf");
    }
    pdfUrl = sb.storage.from(PDF_BUCKET).getPublicUrl(path).data.publicUrl;
    pdfName = pdf.name;
    const upd = await sb
      .from("longform_articles")
      .update({ pdf_url: pdfUrl, pdf_name: pdfName })
      .eq("id", data.id);
    if (upd.error) {
      await sb.storage.from(PDF_BUCKET).remove([path]);
      await sb.from("longform_articles").delete().eq("id", data.id);
      return fail("Failed to save article PDF", 500, "pdf");
    }
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
