// Move the reviewed slug list from category='Business' to category='Fintech'.
// Writes through the Supabase Management API (runs as DB owner, bypasses RLS),
// same auth path as import.mjs. Reads the slug list from out/fintech-slugs.json.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/migrate/apply-fintech.mjs dry
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/migrate/apply-fintech.mjs apply
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/migrate/apply-fintech.mjs revert
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");
const MODE = process.argv[2] || "dry";
const BATCH = 200;

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN && MODE !== "list") { console.error("ERROR: SUPABASE_ACCESS_TOKEN env not set."); process.exit(1); }

function readEnv(key) {
  for (const p of [join(process.cwd(), ".env.local"), "D:/Claude Desktop/amr-blog/.env.local"]) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp("^" + key + "=(.*)$", "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
const SUPA_URL = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const REF = (SUPA_URL.match(/^https?:\/\/([^.]+)\./) || [])[1];
if (!REF) { console.error("ERROR: could not resolve project ref"); process.exit(1); }
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runSql(query, attempt = 0) {
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 400)}`);
    try { return JSON.parse(text); } catch { return text; }
  } catch (e) {
    if (attempt < 5) { await sleep(1000 * (attempt + 1)); return runSql(query, attempt + 1); }
    throw e;
  }
}
const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";

function loadSlugs() {
  const f = join(OUT, "fintech-slugs.json");
  if (!existsSync(f)) { console.error("ERROR: run classify-fintech.mjs first (out/fintech-slugs.json missing)"); process.exit(1); }
  const { slugs, threshold } = JSON.parse(readFileSync(f, "utf8"));
  return { slugs: slugs || [], threshold };
}

async function main() {
  const { slugs, threshold } = loadSlugs();
  console.log(`slug list: ${slugs.length} articles (threshold=${threshold})`);
  if (!slugs.length) { console.log("nothing to do"); return; }

  if (MODE === "dry") {
    // Report current categories of the listed slugs without writing.
    const counts = {};
    for (let i = 0; i < slugs.length; i += BATCH) {
      const chunk = slugs.slice(i, i + BATCH).map(lit).join(",");
      const rows = await runSql(`SELECT category, count(*) AS n FROM public.longform_articles WHERE slug IN (${chunk}) GROUP BY category;`);
      for (const r of (Array.isArray(rows) ? rows : [])) counts[r.category ?? "(null)"] = (counts[r.category ?? "(null)"] || 0) + Number(r.n);
    }
    console.log("current categories of listed slugs:", JSON.stringify(counts));
    console.log("DRY RUN — no changes written. Re-run with `apply` to move them to Fintech.");
    return;
  }

  if (MODE === "apply" || MODE === "revert") {
    const to = MODE === "apply" ? "Fintech" : "Business";
    const from = MODE === "apply" ? "Business" : "Fintech";
    for (let i = 0; i < slugs.length; i += BATCH) {
      const chunk = slugs.slice(i, i + BATCH).map(lit).join(",");
      // Guard on the source category so re-runs and reverts are idempotent.
      await runSql(
        `UPDATE public.longform_articles SET category=${lit(to)} WHERE slug IN (${chunk}) AND category=${lit(from)};`,
      );
      process.stdout.write(`\r  processed ${Math.min(i + BATCH, slugs.length)}/${slugs.length}`);
    }
    process.stdout.write("\n");
    const counts = await runSql(`SELECT category, count(*) AS n FROM public.longform_articles WHERE category IS NOT NULL GROUP BY category ORDER BY category;`);
    console.log(`${MODE === "apply" ? "Moved Business→Fintech" : "Reverted Fintech→Business"}.`);
    console.log("category counts now:", JSON.stringify(counts));
    return;
  }

  console.error(`unknown mode: ${MODE} (use dry | apply | revert)`);
  process.exit(1);
}

main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
