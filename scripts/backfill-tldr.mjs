// Backfill AI TL;DRs ("Key takeaways") for published articles that lack one —
// primarily the ~2,900 imported LinkedIn posts. Talks to the OpenClaw endpoint
// directly with the same env the summarize route uses, paced politely for the
// VPS nginx rate limits.
//
// Usage:
//   node scripts/backfill-tldr.mjs --limit 20   # spot-check batch (recommended first)
//   node scripts/backfill-tldr.mjs --limit 300  # per-run cap; re-run to continue
//
// Resumable: selects only rows where tldr IS NULL. After each save the article
// page is revalidated through /api/revalidate (x-revalidate-secret).
//
// Prompt/cleanup mirror lib/ai/summarize.ts — keep them in sync.
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
const AI_URL =
  readEnv("SUMMARY_API_URL") || readEnv("OPENCLAW_URL") || "https://chat.amrelharony.com/v1/chat/completions";
const AI_KEY = readEnv("SUMMARY_API_KEY") || readEnv("OPENCLAW_API_KEY");
const AI_MODEL = readEnv("SUMMARY_MODEL") || readEnv("OPENCLAW_MODEL") || "openclaw";
const SITE_URL = readEnv("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
const REVALIDATE_SECRET = readEnv("REVALIDATE_SECRET");

for (const [k, v] of Object.entries({ SUPA_URL, SERVICE_KEY, AI_KEY })) {
  if (!v) {
    console.error(`ERROR: ${k} not set (env or .env.local).`);
    process.exit(1);
  }
}

const LIMIT_ARG = process.argv.indexOf("--limit");
const MAX_ROWS = LIMIT_ARG !== -1 ? Number(process.argv[LIMIT_ARG + 1] || 0) : Infinity;
const PAGE = 25;
const PACE_MS = 3000; // ~20/min — polite to the shared chat nginx limits
const MAX_TLDR = 500;
const MAX_CONTENT = 6000;

const SYSTEM_PROMPT =
  "You write a TL;DR for a blog article by Amr Elharony. Summarize the article below in 2-3 sentences (under 60 words). Speak as Amr in the first person, plainly and concretely. Capture the core thesis and takeaway only — do NOT invent facts, numbers, or links not present in the text. Return plain prose with no preamble, no markdown, no quotes.";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

function cleanTldr(raw) {
  return raw
    .replace(/<[^>]{0,2048}>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim()
    .slice(0, MAX_TLDR);
}

async function fetchBatch() {
  const r = await fetch(
    `${SUPA_URL}/rest/v1/longform_articles` +
      `?select=id,slug,title,content&tldr=is.null&published=is.true&order=id.asc&limit=${PAGE}`,
    { headers: sbHeaders },
  );
  if (!r.ok) throw new Error(`select HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function summarize(title, content, attempt = 0) {
  const userContent = `${title ? `Title: ${title}\n\n` : ""}Article:\n${content.slice(0, MAX_CONTENT)}`;
  const r = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      stream: false,
      max_tokens: 220,
      temperature: 0.4,
    }),
  });
  if (r.status === 429 || r.status >= 500) {
    if (attempt >= 5) throw new Error(`AI HTTP ${r.status} after ${attempt + 1} tries`);
    const wait = 5000 * 2 ** attempt;
    console.warn(`  AI ${r.status} — backing off ${wait}ms`);
    await sleep(wait);
    return summarize(title, content, attempt + 1);
  }
  if (!r.ok) throw new Error(`AI HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return cleanTldr((data?.choices?.[0]?.message?.content || "").toString());
}

async function saveTldr(id, tldr) {
  const r = await fetch(`${SUPA_URL}/rest/v1/longform_articles?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ tldr }),
  });
  if (!r.ok) throw new Error(`patch HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function revalidate(slug) {
  if (!SITE_URL || !REVALIDATE_SECRET) return; // optional — ISR refreshes within 300s anyway
  try {
    await fetch(`${SITE_URL}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-secret": REVALIDATE_SECRET },
      body: JSON.stringify({ slug }),
    });
  } catch {
    /* non-fatal */
  }
}

let done = 0;
let failed = 0;
outer: for (;;) {
  const batch = await fetchBatch();
  if (batch.length === 0) break;
  let progressed = false;
  for (const row of batch) {
    if (done >= MAX_ROWS) break outer;
    if ((row.content || "").trim().length < 50) {
      console.warn(`  skip (too short): ${row.slug}`);
      continue;
    }
    try {
      const tldr = await summarize(row.title || "", row.content || "");
      if (!tldr) throw new Error("empty summary");
      await saveTldr(row.id, tldr);
      await revalidate(row.slug);
      progressed = true;
      done++;
      console.log(`${done}. ${row.slug}\n   → ${tldr.slice(0, 120)}${tldr.length > 120 ? "…" : ""}`);
    } catch (e) {
      failed++;
      console.error(`  FAIL ${row.slug}: ${e.message}`);
      if (failed >= 10) {
        console.error("Too many failures — stopping (fix the cause, then re-run).");
        break outer;
      }
    }
    await sleep(PACE_MS);
  }
  // All rows in the page skipped as too-short → they'd repeat forever.
  if (!progressed && batch.every((r) => (r.content || "").trim().length < 50)) break;
}
console.log(`Done. generated=${done} failed=${failed}`);
