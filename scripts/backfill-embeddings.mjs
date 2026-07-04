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

const LIMIT_ARG = process.argv.indexOf("--limit");
const MAX_ROWS = LIMIT_ARG !== -1 ? Number(process.argv[LIMIT_ARG + 1] || 0) : Infinity;
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

async function fetchBatch() {
  return withRetry(async () => {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/longform_articles` +
        `?select=id,title,tldr,excerpt,content&embedding=is.null&order=id.asc&limit=${PAGE}`,
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
for (;;) {
  if (done + skipped >= MAX_ROWS) break;
  const batch = await fetchBatch();
  if (batch.length === 0) break;
  for (const row of batch) {
    if (done + skipped >= MAX_ROWS) break;
    const input = buildInput(row);
    if (!input) {
      // Nothing embeddable — stamp embedded_at only? No: leave NULL is a retry
      // loop trap since select filters on embedding. Store a zero-info skip log.
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
  // If every row in the page was skipped we'd refetch the same page forever.
  if (batch.every((r) => !buildInput(r))) break;
}
console.log(`Done. embedded=${done} skipped=${skipped}`);
