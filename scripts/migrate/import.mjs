// Phase E — import final.ndjson into Supabase via the Management API (runs as DB
// owner, bypasses RLS, preserves original created_at). Token from env only.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/migrate/import.mjs schema
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/migrate/import.mjs sample 20
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/migrate/import.mjs full
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/migrate/import.mjs revert
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const OUT = join(process.cwd(), "scripts/migrate/out");
const MODE = process.argv[2] || "schema";
const N = Number(process.argv[3] || 20);
const BATCH = 50;

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error("ERROR: SUPABASE_ACCESS_TOKEN env not set."); process.exit(1); }

// Project ref from NEXT_PUBLIC_SUPABASE_URL (worktree or main repo .env.local).
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
if (!REF) { console.error("ERROR: could not resolve project ref from NEXT_PUBLIC_SUPABASE_URL"); process.exit(1); }
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

// SQL literal helpers (standard_conforming_strings on: backslashes are literal).
const lit = (v) => (v === null || v === undefined ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");
const arr = (a) => (!a || !a.length ? "ARRAY[]::text[]" : "ARRAY[" + a.map(lit).join(",") + "]::text[]");
const ts = (v) => (v ? lit(v) + "::timestamptz" : "NULL");

function loadRows() {
  return readFileSync(join(OUT, "final.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
}

async function doSchema() {
  console.log(`project ref: ${REF}`);
  await runSql(`
    ALTER TABLE public.longform_articles ADD COLUMN IF NOT EXISTS category text;
    ALTER TABLE public.longform_articles ADD COLUMN IF NOT EXISTS source_url text;
    CREATE INDEX IF NOT EXISTS longform_articles_category_idx ON public.longform_articles (category);
  `);
  const cols = await runSql(`SELECT column_name FROM information_schema.columns WHERE table_name='longform_articles' AND column_name IN ('category','source_url') ORDER BY column_name;`);
  console.log("schema OK — columns present:", JSON.stringify(cols));
}

// Only NON-migrated rows (category IS NULL) constrain our slugs. Our own migrated
// rows (category set) are upserted by slug and must never be treated as collisions
// — that is what corrupts a resumed run into creating duplicates.
async function preexistingSlugs() {
  const rowsBack = await runSql(`SELECT slug FROM public.longform_articles WHERE category IS NULL;`);
  return new Set((Array.isArray(rowsBack) ? rowsBack : []).map((r) => r.slug));
}

function finalizeSlugs(rows, preexisting) {
  const taken = new Set(preexisting);
  let bumped = 0;
  for (const r of rows) {
    if (taken.has(r.slug)) {
      const suffix = "-" + createHash("md5").update(r.file).digest("hex").slice(0, 4);
      r.slug = (r.slug.slice(0, 75) + suffix).slice(0, 80);
      bumped++;
    }
    taken.add(r.slug);
  }
  if (bumped) console.log(`slugs bumped to avoid pre-existing (non-migrated) collisions: ${bumped}`);
  return rows;
}

function valuesRow(r) {
  return `(${lit(r.title)},${lit(r.slug)},${lit(r.excerpt)},${lit(r.content)},${lit(r.cover_image)},${arr(r.tags)},${lit(r.category)},${lit(r.source_url)},${r.series_name ? lit(r.series_name) : "NULL"},${Number(r.series_order) || 0},${r.tldr ? lit(r.tldr) : "NULL"},${r.published ? "true" : "false"},${ts(r.created_at)})`;
}

async function upsert(rows) {
  const cols = "title,slug,excerpt,content,cover_image,tags,category,source_url,series_name,series_order,tldr,published,created_at";
  const updates = ["title", "excerpt", "content", "cover_image", "tags", "category", "source_url", "tldr", "published", "created_at"]
    .map((c) => `${c}=EXCLUDED.${c}`).join(",");
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const sql = `INSERT INTO public.longform_articles (${cols}) VALUES\n${chunk.map(valuesRow).join(",\n")}\nON CONFLICT (slug) DO UPDATE SET ${updates};`;
    await runSql(sql);
    done += chunk.length;
    process.stdout.write(`\r  upserted ${done}/${rows.length}`);
  }
  process.stdout.write("\n");
}

function writeManifest(rows) {
  writeFileSync(join(OUT, "inserted-slugs.json"), JSON.stringify(rows.map((r) => ({ slug: r.slug, file: r.file, category: r.category }))));
  const slugList = rows.map((r) => lit(r.slug)).join(",\n  ");
  writeFileSync(join(OUT, "revert.sql"), `-- Reverts this migration batch only.\nDELETE FROM public.longform_articles WHERE slug IN (\n  ${slugList}\n);\n`);
  console.log("wrote inserted-slugs.json + revert.sql");
}

async function main() {
  if (MODE === "schema") { await doSchema(); return; }

  if (MODE === "purge") {
    // Remove ALL migrated rows (category IS NOT NULL). Originals have category NULL.
    const before = await runSql(`SELECT count(*) FROM public.longform_articles WHERE category IS NOT NULL;`);
    await runSql(`DELETE FROM public.longform_articles WHERE category IS NOT NULL;`);
    const after = await runSql(`SELECT count(*) FROM public.longform_articles WHERE category IS NOT NULL;`);
    console.log(`purged migrated rows. before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    return;
  }

  if (MODE === "revert") {
    const mf = join(OUT, "inserted-slugs.json");
    if (!existsSync(mf)) { console.error("no manifest to revert"); process.exit(1); }
    const slugs = JSON.parse(readFileSync(mf, "utf8")).map((m) => m.slug);
    for (let i = 0; i < slugs.length; i += 200) {
      await runSql(`DELETE FROM public.longform_articles WHERE slug IN (${slugs.slice(i, i + 200).map(lit).join(",")});`);
      process.stdout.write(`\r  deleted ${Math.min(i + 200, slugs.length)}/${slugs.length}`);
    }
    process.stdout.write("\n done revert.\n");
    return;
  }

  // sample | full
  await doSchema();
  let rows = loadRows();
  if (MODE === "sample") rows = rows.slice(0, N);
  rows = finalizeSlugs(rows, await preexistingSlugs());
  console.log(`importing ${rows.length} rows (mode=${MODE})…`);
  await upsert(rows);
  writeManifest(rows);
  // verify a couple back
  const sample = rows.slice(0, 3).map((r) => r.slug);
  const back = await runSql(`SELECT slug,category,created_at,left(title,50) AS title FROM public.longform_articles WHERE slug IN (${sample.map(lit).join(",")});`);
  console.log("verify sample:", JSON.stringify(back, null, 1));
  // counts per category
  const counts = await runSql(`SELECT category, count(*) FROM public.longform_articles WHERE category IS NOT NULL GROUP BY category ORDER BY category;`);
  console.log("category counts in DB:", JSON.stringify(counts));
}

main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
