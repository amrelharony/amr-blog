// Phase C apply — merge LLM enrichment with deterministic fallbacks and build
// the final insert rows (final.ndjson). Generates clean, collision-free slugs.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");
const ENR = join(OUT, "enrichment");

// Mirror lib/format.ts slugify exactly (ASCII-only, 80-char cap).
function slugify(str) {
  return (str ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Strip leading emojis/symbols and stray scheduling codes for the fallback title.
function cleanTitle(t) {
  return (t || "")
    .replace(/[\p{Extended_Pictographic}️‍]/gu, "")
    .replace(/^\s*\d{1,2}-\d{1,2}\s*/, "")
    .replace(/^[^\p{L}\p{N}"']+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackExcerpt(firstPara, markdown) {
  let s = (firstPara || markdown.replace(/[#>*_`]/g, " ")).replace(/\s+/g, " ").trim();
  if (s.length <= 155) return s;
  s = s.slice(0, 155);
  return s.slice(0, s.lastIndexOf(" ")).trim() + "…";
}

const survivors = readFileSync(join(OUT, "survivors.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

// Merge enrichment files (validated).
const enr = new Map();
let badEnrich = 0;
if (existsSync(ENR)) {
  for (const ef of readdirSync(ENR).filter((f) => /^e-\d+\.json$/.test(f))) {
    let arr;
    try { arr = JSON.parse(readFileSync(join(ENR, ef), "utf8")); } catch { badEnrich++; continue; }
    if (!Array.isArray(arr)) { badEnrich++; continue; }
    for (const e of arr) {
      if (!e || !e.file) continue;
      enr.set(e.file, e);
    }
  }
}

// Deterministic order for stable slugs: oldest first, then file name.
survivors.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.file.localeCompare(b.file));

const used = new Map(); // base slug -> count
function uniqueSlug(title) {
  let base = slugify(title);
  if (!base) base = "article";
  const seen = used.get(base) || 0;
  used.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

let fromLLM = 0, fromFallback = 0;
const rows = survivors.map((s) => {
  const e = enr.get(s.file);
  const valid = e && typeof e.seo_title === "string" && e.seo_title.trim() &&
    typeof e.excerpt === "string" && e.excerpt.trim() && Array.isArray(e.tags);
  if (valid) fromLLM++; else fromFallback++;

  const title = (valid ? e.seo_title : cleanTitle(s.title) || s.title).trim().slice(0, 120);
  const excerpt = (valid ? e.excerpt : fallbackExcerpt(s.firstPara, s.markdown)).trim().slice(0, 200);
  let tags = valid
    ? e.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 6)
    : [];
  if (tags.length === 0) {
    // fallback tags: meaningful words from the title
    tags = cleanTitle(s.title).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter((w) => w.length > 3 && !["with", "your", "that", "this", "from", "what", "why", "how", "the", "and", "for"].includes(w))
      .slice(0, 5);
  }
  const tldr = valid && typeof e.tldr === "string" && e.tldr.trim() ? e.tldr.trim().slice(0, 400) : null;

  return {
    title,
    slug: uniqueSlug(title),
    excerpt,
    content: s.markdown,
    cover_image: "",
    tags,
    category: s.category,
    source_url: s.sourceUrl || null,
    series_name: null,
    series_order: 0,
    tldr,
    published: true,
    created_at: s.date,
    file: s.file, // kept for the manifest / debugging; dropped before insert
  };
});

writeFileSync(join(OUT, "final.ndjson"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

const byCat = {};
for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;
const dupSlugs = rows.length - new Set(rows.map((r) => r.slug)).size;
console.log("rows:", rows.length, "→ final.ndjson");
console.log("enrichment used:", fromLLM, "| deterministic fallback:", fromFallback, "| bad enrich files:", badEnrich);
console.log("by category:", JSON.stringify(byCat));
console.log("slug collisions remaining (should be 0):", dupSlugs);
console.log("missing created_at:", rows.filter((r) => !r.created_at).length);
console.log("\nsample row:", JSON.stringify({ ...rows[0], content: rows[0].content.slice(0, 80) + "…" }, null, 1));
