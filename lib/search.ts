// Pure helpers for the server-backed full-text search (no Supabase, no DOM —
// fully unit-testable). The actual queries live in lib/queries/*; the route
// handler at app/api/search wires both together.
//
// Search runs over plain text columns via Postgres' implicit
// to_tsvector(col) @@ websearch_to_tsquery(q) — no schema changes required.
// A sequential scan is fine at blog scale. OPTIONAL: if search ever feels
// slow, the owner can run this once in the Supabase SQL editor:
//
//   CREATE INDEX longform_articles_fts ON longform_articles
//     USING gin (to_tsvector('english',
//       coalesce(title,'') || ' ' || coalesce(excerpt,'') || ' ' || coalesce(content,'')));

export interface SearchResultArticle {
  type: "article";
  slug: string;
  title: string;
  excerpt: string;
  snippet: string;
  tags: string[];
  created_at: string;
  views: number;
}

export interface SearchResultThought {
  type: "thought";
  id: string;
  snippet: string;
  created_at: string;
}

export interface SearchResponse {
  articles: SearchResultArticle[];
  thoughts: SearchResultThought[];
  tags: string[];
}

export const EMPTY_SEARCH_RESPONSE: SearchResponse = { articles: [], thoughts: [], tags: [] };

/**
 * Make a raw query safe to embed in a PostgREST `.or()` filter string, where
 * commas separate conditions, parens group them, and double quotes delimit
 * values — unescaped they corrupt the filter. websearch_to_tsquery itself is
 * safe with arbitrary input on the Postgres side.
 */
export function sanitizeSearchQuery(raw: string): string {
  return raw
    .replace(/[,()"\\]/g, " ")
    .replace(/[\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
}

/** Lowercased word terms of a sanitized query, for ranking and highlighting. */
export function queryTerms(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

interface RankableArticle {
  title: string;
  excerpt: string | null;
  content: string | null;
  tags: string[] | null;
  views: number | null;
  created_at: string;
}

/**
 * Rank matched rows in TS — PostgREST can't ORDER BY ts_rank without an RPC
 * (a migration), and result sets are tiny. Field weights: title 8, tag 4,
 * excerpt 2, body 1 per matched term; views then recency break ties.
 */
export function rankSearchResults<T extends RankableArticle>(rows: T[], q: string): T[] {
  const terms = queryTerms(q);
  // Score once per row, not per comparison — `content` can be tens of KB and
  // lowercasing it inside the comparator would repeat that O(n log n) times.
  const scored = rows.map((a) => {
    const title = a.title.toLowerCase();
    const excerpt = (a.excerpt || "").toLowerCase();
    const content = (a.content || "").toLowerCase();
    const tags = (a.tags || []).map((t) => t.toLowerCase());
    let s = 0;
    for (const term of terms) {
      if (title.includes(term)) s += 8;
      if (tags.some((t) => t.includes(term))) s += 4;
      if (excerpt.includes(term)) s += 2;
      if (content.includes(term)) s += 1;
    }
    return { a, s };
  });
  return scored
    .sort(
      (x, y) =>
        y.s - x.s ||
        (y.a.views || 0) - (x.a.views || 0) ||
        y.a.created_at.localeCompare(x.a.created_at),
    )
    .map((x) => x.a);
}

/** Crude markdown → plain text (good enough for snippet display). */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[!(?:NOTE|TIP|WARNING|DANGER|IMPORTANT|CAUTION|QUOTE)\]/gi, " ")
    // Bounded inner classes ({0,512}/{0,2048}/{1,2048}): an unbounded [^\]]*/[^>]+ over
    // a long run of '[' or '<' backtracks quadratically, and this runs on the FULL body
    // for every /api/search hit. buildSnippet also pre-truncates as the primary bound.
    .replace(/!\[([^\]]{0,512})\]\([^)]{0,2048}\)/g, "$1")
    .replace(/\[([^\]]{0,512})\]\([^)]{0,2048}\)/g, "$1")
    .replace(/<[^>]{1,2048}>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~`|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Plain-text window of ~len chars around the first term hit, with ellipses.
 * Falls back to the document head when no term matches the stripped text.
 */
export function buildSnippet(content: string, q: string, len = 160): string {
  // Truncate before stripping: a snippet needs only a small window, and stripMarkdown
  // runs several regexes over the whole body — capping the input bounds /api/search
  // CPU so a pathological body can't burn seconds per (cache-bypassing) query.
  const text = stripMarkdown((content || "").slice(0, 20000));
  if (!text) return "";
  const lower = text.toLowerCase();
  let hit = -1;
  for (const term of queryTerms(q)) {
    const i = lower.indexOf(term);
    if (i !== -1 && (hit === -1 || i < hit)) hit = i;
  }
  const start = hit === -1 ? 0 : Math.max(0, hit - Math.floor(len / 4));
  const end = Math.min(text.length, start + len);
  let out = text.slice(start, end).trim();
  if (start > 0) out = "…" + out;
  if (end < text.length) out = out + "…";
  return out;
}

/**
 * Reciprocal-rank fusion of two ranked lists (full-text + vector arms of
 * hybrid search). Standard RRF: score(item) = Σ 1/(k + rank); items present
 * in both lists rise. Stable for k=60 (the conventional constant).
 */
export function fuseResults<T>(
  a: T[],
  b: T[],
  key: (x: T) => string,
  limit = 12,
  k = 60,
): T[] {
  const scores = new Map<string, { item: T; score: number }>();
  for (const [list, weight] of [
    [a, 1],
    [b, 1],
  ] as [T[], number][]) {
    list.forEach((item, rank) => {
      const id = key(item);
      const cur = scores.get(id);
      const s = weight / (k + rank + 1);
      if (cur) cur.score += s;
      else scores.set(id, { item, score: s });
    });
  }
  return [...scores.values()]
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.item);
}

/** Tag names from matched articles that themselves match the query, unique, capped. */
export function matchedTags(rows: { tags: string[] | null }[], q: string, max = 6): string[] {
  const terms = queryTerms(q);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const tag of row.tags || []) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      if (terms.some((t) => key.includes(t))) {
        seen.add(key);
        out.push(tag);
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}
