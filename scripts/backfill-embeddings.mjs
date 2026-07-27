// Backfill pgvector embeddings for the existing corpus (~2,905 articles).
// Requires db/migrations/0011 applied and the `embed` Edge Function deployed.
//
// Usage:
//   node scripts/backfill-embeddings.mjs            # everything missing
//   node scripts/backfill-embeddings.mjs --limit 20 # sample run
//
// Naturally resumable: selects only rows where embedding IS NULL, so re-running
// continues where the last run stopped. Paced politely; PostgREST pages of 50
// stay far under the 1000-row response cap.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function readEnv(key) {
  if (process.env[key]) return process.env[key];
  for (const p of [join(process.cwd(), ".env.local"), "D:/Claude Desktop/amr-blog/.env.local"]) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp("^" + key + "=(.*)$", "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const SUPA_URL = readEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const EMBED_FN_URL = readEnv("EMBED_FN_URL");
const EMBED_FN_SECRET = readEnv("EMBED_FN_SECRET");
for (const [k, v] of Object.entries({ SUPA_URL, SERVICE_KEY, EMBED_FN_URL, EMBED_FN_SECRET })) {
  if (!v) {
    console.error(`ERROR: ${k} not set (env or .env.local).`);
    process.exit(1);
  }
}

// `--limit` with a missing or non-numeric value used to silently mean "0 rows"
// (Number(undefined || 0)) or "unbounded" (NaN, which fails every >= comparison) —
// both reported as a clean exit. A typo in the documented invocation must fail loudly.
const LIMIT_ARG = process.argv.indexOf("--limit");
let MAX_ROWS = Infinity;
if (LIMIT_ARG !== -1) {
  const raw = process.argv[LIMIT_ARG + 1];
  MAX_ROWS = Number(raw);
  if (!Number.isSafeInteger(MAX_ROWS) || MAX_ROWS < 1) {
    console.error(`ERROR: --limit needs a positive integer (got ${raw === undefined ? "nothing" : `"${raw}"`}).`);
    process.exit(1);
  }
}
const PAGE = 50;
const PACE_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function withRetry(fn, label, attempts = 5) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1) throw e;
      const wait = 1000 * 2 ** i;
      console.warn(`  retry ${label} in ${wait}ms: ${e.message}`);
      await sleep(wait);
    }
  }
}

// Keep in sync with buildEmbeddingInput in lib/embeddings.ts.
function buildInput(a) {
  return [a.title, a.tldr || "", a.excerpt || "", (a.content || "").slice(0, 1500)]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2000);
}

// `after` is an id cursor. Rows with no embeddable text are never written, so they
// stay in the `embedding is null` set forever — without the cursor the same page came
// back every time, and the "every row skipped" guard that stopped the resulting
// infinite loop also aborted the whole run when the FIRST page happened to be all
// skips, leaving thousands of embeddable rows behind it untouched.
async function fetchBatch(after) {
  return withRetry(async () => {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/longform_articles` +
        `?select=id,title,tldr,excerpt,content&embedding=is.null&order=id.asc&limit=${PAGE}` +
        (after ? `&id=gt.${encodeURIComponent(after)}` : ""),
      { headers: sbHeaders },
    );
    if (!r.ok) throw new Error(`select HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }, "select");
}

async function embed(text) {
  return withRetry(async () => {
    const r = await fetch(EMBED_FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-embed-secret": EMBED_FN_SECRET },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error(`embed HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const { embedding } = await r.json();
    if (!Array.isArray(embedding) || embedding.length !== 384) {
      throw new Error(`bad embedding (${Array.isArray(embedding) ? embedding.length : typeof embedding})`);
    }
    return embedding;
  }, "embed");
}

async function saveEmbedding(id, vector) {
  return withRetry(async () => {
    const r = await fetch(`${SUPA_URL}/rest/v1/longform_articles?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...sbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        embedding: JSON.stringify(vector),
        embedded_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) throw new Error(`patch HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }, "patch");
}

let done = 0;
let skipped = 0;
// --limit bounds rows actually EMBEDDED, so `--limit 20` spot-checks 20 real
// embeddings rather than being eaten by unembeddable rows.
let cursor = null;
for (;;) {
  if (done >= MAX_ROWS) break;
  const batch = await fetchBatch(cursor);
  if (batch.length === 0) break;
  for (const row of batch) {
    // Advance the cursor for every row we look at, embedded or skipped — that is what
    // guarantees forward progress across pages.
    cursor = row.id;
    if (done >= MAX_ROWS) break;
    const input = buildInput(row);
    if (!input) {
      // Nothing embeddable. We deliberately leave `embedding` NULL (stamping it would
      // fake a real vector); the id cursor is what keeps this from being a retry loop.
      console.warn(`  skip (empty input): ${row.id}`);
      skipped++;
      continue;
    }
    const vector = await embed(input);
    await saveEmbedding(row.id, vector);
    done++;
    if (done % 25 === 0) console.log(`embedded ${done}…`);
    await sleep(PACE_MS);
  }
}
console.log(`Done. embedded=${done} skipped=${skipped}`);
