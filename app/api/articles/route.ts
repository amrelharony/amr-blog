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
//
// All pure validation (auth check, SSRF guard, field caps, slug arithmetic)
// lives in lib/articles/ingest.ts, where it is unit-tested; this file owns I/O.
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { generateArticleEmbeddingFailOpen } from "@/lib/embeddings";
import { autoTagArticleFailOpen } from "@/lib/ai/tags";
import { runArticleNotify } from "@/lib/newsletter/notify";
import { categoryByLabel } from "@/lib/categories";
import { slugTakenServer } from "@/lib/queries/admin-articles";
import {
  MAX_BODY_BYTES,
  presentedKey,
  validKey,
  validateArticleFields,
  resolveUniqueSlug,
  suffixSlug,
} from "@/lib/articles/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: string, status: number, field?: string) {
  return NextResponse.json({ ok: false, error, ...(field ? { field } : {}) }, { status });
}

export async function POST(req: NextRequest) {
  // 1. Auth
  if (!validKey(presentedKey(req.headers), process.env.ARTICLES_API_KEY)) {
    return fail("Unauthorized", 401);
  }

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
  // 3–8. Field validation + normalization (pure, tested in lib/articles/ingest.test.ts)
  const v = validateArticleFields(body);
  if (!v.ok) return fail(v.error, 400, v.field);
  const p = v.prepared;

  // 9. Build the service client (service role bypasses RLS for a session-less write)
  let sb;
  try {
    sb = createServiceClient();
  } catch {
    return fail("Server not configured for article ingest", 500);
  }

  // 10. Resolve slug collisions. Explicit slug -> 409. Auto slug -> random suffix.
  const slugRes = await resolveUniqueSlug(
    p.baseSlug,
    p.explicitSlug,
    (s) => slugTakenServer(sb, s, ""),
    (n) => randomBytes(n).toString("hex"),
  );
  if (!slugRes.ok) return fail("slug already in use", 409, "slug");

  // 11. Insert — row shape mirrors save() in app/admin/write/page.tsx. created_at /
  //     updated_at are left to DB defaults so a published article stays fresh for
  //     the LinkedIn window.
  const row = {
    title: p.title,
    slug: slugRes.slug,
    excerpt: p.excerpt,
    content: p.content,
    cover_image: p.coverImage,
    tags: p.tags,
    category: p.category,
    source_url: p.sourceUrl,
    series_name: p.seriesName,
    series_order: p.seriesOrder,
    tldr: p.tldr,
    published: p.published,
    scheduled_at: p.scheduledAt,
    linkedin_posted: !p.linkedin,
    pdf_url: p.pdfUrl,
    pdf_name: p.pdfName,
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
    if (error.code === "23505" && !p.explicitSlug && attempt < 3) {
      row.slug = suffixSlug(p.baseSlug, randomBytes(3).toString("hex"));
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
  if (p.published) {
    revalidatePath("/");
    revalidatePath(`/p/${data.slug}`);
    revalidatePath("/sitemap.xml");
    revalidatePath("/feed.xml");
    if (p.category) {
      const def = categoryByLabel(p.category);
      if (def) revalidatePath(`/category/${def.slug}`);
    }
  }

  // 13. Post-response enrichment. `after()` runs once the 201 below has been
  //     sent, so these can never slow down or fail the ingest contract; each
  //     helper is fail-open (logs and returns on any error). Auto-tagging runs
  //     first so the embedding covers the final tag-enriched article state —
  //     order is cosmetic though; the embedding input doesn't include tags.
  //     The try/catch is a backstop: if one helper ever regresses to throwing,
  //     the remaining steps would otherwise be silently skipped.
  const articleId = data.id;
  const notifyNow = p.published;
  const tagCount = p.tags.length;
  after(async () => {
    try {
      if (tagCount < 2) await autoTagArticleFailOpen(articleId);
      await generateArticleEmbeddingFailOpen(articleId);
      if (notifyNow) await runArticleNotify(articleId);
    } catch (e) {
      console.error("[after:articles]", articleId, e);
    }
  });

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return NextResponse.json(
    {
      ok: true,
      id: data.id,
      slug: data.slug,
      url: `${site}/p/${data.slug}`,
      status: p.status,
      published: p.published,
      scheduled_at: p.scheduledAt,
      linkedin_posted: !p.linkedin,
      pdf_url: p.pdfUrl,
      pdf_name: p.pdfName,
      warnings: p.warnings,
    },
    { status: 201 },
  );
}
