// Article embeddings for semantic discovery (related articles, read-next,
// hybrid search). The provider is a Supabase Edge Function running the built-in
// gte-small model (supabase/functions/embed) — swapping providers is a change
// to THIS file only; keep the dimension in sync with the vector(384) column
// from db/migrations/0011_pgvector_embeddings.sql.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export const EMBEDDING_DIMS = 384;

/** gte-small has a ~512-token window; cap well inside it. */
export const MAX_EMBED_INPUT_CHARS = 2000;

const EMBED_TIMEOUT_MS = 15_000;

/**
 * The text that represents an article for similarity: title + tldr + excerpt +
 * the head of the body. Pure — unit-tested in lib/embeddings.test.ts.
 */
export function buildEmbeddingInput(a: {
  title: string;
  tldr?: string | null;
  excerpt?: string | null;
  content?: string | null;
}): string {
  const parts = [a.title, a.tldr || "", a.excerpt || "", (a.content || "").slice(0, 1500)];
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_EMBED_INPUT_CHARS);
}

/** Embed a text via the Edge Function. Throws on any failure (callers decide). */
export async function embedText(text: string): Promise<number[]> {
  const url = process.env.EMBED_FN_URL;
  const secret = process.env.EMBED_FN_SECRET;
  if (!url || !secret) throw new Error("Embeddings not configured (EMBED_FN_URL/EMBED_FN_SECRET)");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-embed-secret": secret },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`embed fn HTTP ${r.status}`);
    const data = (await r.json()) as { embedding?: number[] };
    const v = data.embedding;
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMS) {
      throw new Error(`embed fn returned ${Array.isArray(v) ? v.length : typeof v} dims`);
    }
    return v;
  } finally {
    clearTimeout(timeout);
  }
}

/** Store an article's embedding (service client — session-less write). */
export async function updateArticleEmbedding(
  sb: SupabaseClient,
  id: string,
  vector: number[],
): Promise<void> {
  const { error } = await sb
    .from("longform_articles")
    .update({ embedding: JSON.stringify(vector), embedded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Fetch → embed → store, swallowing every failure (log-only). Runs inside
 * `after()` on the ingest/admin paths, so it must never throw and never
 * affect the response that has already been sent.
 */
export async function generateArticleEmbeddingFailOpen(articleId: string): Promise<void> {
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("longform_articles")
      .select("id,title,tldr,excerpt,content")
      .eq("id", articleId)
      .maybeSingle();
    if (error || !data) return;
    const input = buildEmbeddingInput(data);
    if (!input) return;
    const vector = await embedText(input);
    await updateArticleEmbedding(sb, articleId, vector);
  } catch (e) {
    console.error("[embeddings] fail-open:", articleId, e instanceof Error ? e.message : e);
  }
}
