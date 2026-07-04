// AI-assisted tagging. The model may only CHOOSE from TAG_VOCABULARY — it can
// never mint a tag — so a hallucinated or off-vocabulary answer degrades to
// "no new tags", never to garbage in the corpus. All parsing regexes are
// bounded (they run on model output server-side; see the ReDoS budget test).
import { createServiceClient } from "@/lib/supabase/service";
import { openclawComplete, openclawConfigured } from "@/lib/ai/openclaw";

// Curated from the live corpus (top tags by frequency across ~2,900 published
// articles, June 2026) — all stored lowercase, matching ingest normalization.
export const TAG_VOCABULARY = [
  "semiconductors", "leadership", "innovation", "geopolitics", "communication",
  "electric vehicles", "apple", "entrepreneurship", "supply chain", "branding",
  "china", "franchising", "productivity", "artificial intelligence", "influence",
  "sustainability", "amazon", "e-commerce", "executive presence", "google",
  "career growth", "persuasion", "networking", "chip manufacturing", "microsoft",
  "business strategy", "tesla", "charisma", "negotiation", "management",
  "inflation", "emotional intelligence", "retail", "smartphones",
  "corporate strategy", "computer hardware", "manufacturing",
  "employee engagement", "decision making", "collaboration", "cybersecurity",
  "acquisitions", "body language", "personal finance", "tsmc", "big tech",
  "cryptocurrency", "fintech", "nvidia", "real estate", "change management",
  "remote work", "corporate governance", "retail strategy", "intel",
  "confidence", "resilience", "public speaking", "marketing", "banking",
  "startups", "automation", "creativity", "agile", "digital transformation",
] as const;

/** Caps mirror normTags in app/api/articles/route.ts. */
const MAX_TAG_LEN = 50;
const MAX_TOTAL_TAGS = 20;
export const MAX_SUGGESTED = 5;

const TAGS_SYSTEM_PROMPT =
  "You tag blog articles. Reply ONLY with a JSON array of 1 to 5 strings chosen " +
  "EXACTLY from the allowed list you are given. Pick the most specific fitting " +
  "topics. No other text, no markdown, no tags outside the list.";

export function buildTagUserContent(a: {
  title: string;
  excerpt?: string | null;
  content?: string | null;
}): string {
  return (
    `Allowed tags:\n${TAG_VOCABULARY.join(", ")}\n\n` +
    `Article title: ${a.title.trim().slice(0, 200)}\n\n` +
    `${(a.excerpt || "").trim().slice(0, 500)}\n\n` +
    (a.content || "").trim().slice(0, 4000)
  );
}

const VOCAB_SET = new Set<string>(TAG_VOCABULARY);

/**
 * Parse the model's reply into vocabulary tags, merged with the existing tags.
 * Accepts a JSON array or a comma/newline list; anything unparseable or
 * off-vocabulary is dropped. Pure — unit-tested in lib/ai/tags.test.ts.
 */
export function normalizeSuggestedTags(raw: string, existing: string[]): string[] {
  const input = (raw || "").slice(0, 2000); // bound everything downstream

  let candidates: string[] = [];
  const jsonMatch = input.match(/\[[^\]]{0,1500}\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) candidates = parsed.map((x) => String(x));
    } catch {
      /* fall through to list splitting */
    }
  }
  if (candidates.length === 0) {
    // Strip list bullets, quotes, and partial-JSON brackets around each piece.
    candidates = input
      .split(/[,\n;]/)
      .map((s) => s.replace(/^[\s"'`\-*\d.[\]]{0,10}|[\s"'`[\]]{0,10}$/g, ""));
  }

  const existingSet = new Set(existing.map((t) => t.toLowerCase()));
  const out: string[] = [];
  for (const c of candidates) {
    const tag = c.trim().toLowerCase().slice(0, MAX_TAG_LEN);
    if (!tag || !VOCAB_SET.has(tag) || existingSet.has(tag)) continue;
    existingSet.add(tag);
    out.push(tag);
    if (out.length >= MAX_SUGGESTED) break;
  }
  return [...existing, ...out].slice(0, MAX_TOTAL_TAGS);
}

/** Ask the model for suggestions (unsaved). Throws on AI failure. */
export async function suggestTags(a: {
  title: string;
  excerpt?: string | null;
  content?: string | null;
  tags?: string[] | null;
}): Promise<string[]> {
  const raw = await openclawComplete({
    system: TAGS_SYSTEM_PROMPT,
    user: buildTagUserContent(a),
    maxTokens: 120,
    temperature: 0.2,
  });
  return normalizeSuggestedTags(raw, a.tags || []);
}

/**
 * Ingest-side auto-tagging: if a just-published article arrived with fewer
 * than 2 tags, fill in vocabulary tags. Runs inside `after()` — swallows every
 * failure (the 201 has already been sent; AI must never affect publishing).
 */
export async function autoTagArticleFailOpen(articleId: string): Promise<void> {
  try {
    if (!openclawConfigured()) return;
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("longform_articles")
      .select("id,title,excerpt,content,tags,slug")
      .eq("id", articleId)
      .maybeSingle();
    if (error || !data) return;
    const existing: string[] = data.tags || [];
    if (existing.length >= 2) return;

    const merged = await suggestTags(data);
    if (merged.length === existing.length) return;

    const { error: upErr } = await sb
      .from("longform_articles")
      .update({ tags: merged })
      .eq("id", articleId);
    if (upErr) return;

    // Refresh the article page so the new tags render (fail-open too).
    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/p/${data.slug}`);
  } catch (e) {
    console.error("[auto-tag] fail-open:", articleId, e instanceof Error ? e.message : e);
  }
}
