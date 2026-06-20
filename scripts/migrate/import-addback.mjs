// Import the Leadership add-backs. Slugs are deduped against ALL existing DB
// slugs (so a new article can never overwrite an existing one); inserts use
// ON CONFLICT (slug) DO NOTHING for safe re-runs. Token via env only.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const OUT = join(process.cwd(), "scripts/migrate/out");
const MODE = process.argv[2] || "full";
const N = Number(process.argv[3] || 20);
const BATCH = 50;

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error("ERROR: SUPABASE_ACCESS_TOKEN env not set."); process.exit(1); }

function readEnv(key) {
  for (const p of [join(process.cwd(), ".env.local"), "D:/Claude Desktop/amr-blog/.env.local"]) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp("^" + key + "=(.*)$", "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
const REF = (readEnv("NEXT_PUBLIC_SUPABASE_URL").match(/^https?:\/\/([^.]+)\./) || [])[1];
if (!REF) { console.error("ERROR: could not resolve project ref"); process.exit(1); }
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runSql(query, attempt = 0) {
  try {
    const r = await fetch(API, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
    try { return JSON.parse(text); } catch { return text; }
  } catch (e) { if (attempt < 5) { await sleep(1000 * (attempt + 1)); return runSql(query, attempt + 1); } throw e; }
}
const lit = (v) => (v === null || v === undefined ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");
const arr = (a) => (!a || !a.length ? "ARRAY[]::text[]" : "ARRAY[" + a.map(lit).join(",") + "]::text[]");
const ts = (v) => (v ? lit(v) + "::timestamptz" : "NULL");

function valuesRow(r) {
  return `(${lit(r.title)},${lit(r.slug)},${lit(r.excerpt)},${lit(r.content)},${lit(r.cover_image)},${arr(r.tags)},${lit(r.category)},${lit(r.source_url)},NULL,0,${r.tldr ? lit(r.tldr) : "NULL"},${r.published ? "true" : "false"},${ts(r.created_at)})`;
}

async function main() {
  let rows = readFileSync(join(OUT, "leadership-final.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  if (MODE === "sample") rows = rows.slice(0, N);

  // Dedupe new slugs against EVERY existing slug + each other.
  const existing = new Set((await runSql(`SELECT slug FROM public.longform_articles;`)).map((r) => r.slug));
  let bumped = 0;
  const taken = new Set(existing);
  for (const r of rows) {
    if (taken.has(r.slug)) {
      r.slug = (r.slug.slice(0, 75) + "-" + createHash("md5").update(r.file).digest("hex").slice(0, 4)).slice(0, 80);
      bumped++;
    }
    taken.add(r.slug);
  }
  console.log(`importing ${rows.length} add-backs (mode=${MODE}); slugs bumped vs existing: ${bumped}`);

  const cols = "title,slug,excerpt,content,cover_image,tags,category,source_url,series_name,series_order,tldr,published,created_at";
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await runSql(`INSERT INTO public.longform_articles (${cols}) VALUES\n${chunk.map(valuesRow).join(",\n")}\nON CONFLICT (slug) DO NOTHING;`);
    done += chunk.length;
    process.stdout.write(`\r  inserted ${done}/${rows.length}`);
  }
  process.stdout.write("\n");

  writeFileSync(join(OUT, "leadership-inserted-slugs.json"), JSON.stringify(rows.map((r) => ({ slug: r.slug, file: r.file }))));
  writeFileSync(join(OUT, "leadership-revert.sql"), `DELETE FROM public.longform_articles WHERE slug IN (\n  ${rows.map((r) => lit(r.slug)).join(",\n  ")}\n);\n`);
  const counts = await runSql(`SELECT category, count(*) FROM public.longform_articles WHERE category IS NOT NULL GROUP BY category ORDER BY category;`);
  console.log("category counts in DB:", JSON.stringify(counts));
  console.log("wrote leadership-inserted-slugs.json + leadership-revert.sql");
}
main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
