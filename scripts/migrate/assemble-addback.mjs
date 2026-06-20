// Assemble final insert rows for the Leadership add-backs (mirrors assemble-final.mjs).
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");
const ENR = join(OUT, "enrichment-addback");

function slugify(str) {
  return (str ?? "").toLowerCase().trim()
    .replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function cleanTitle(t) {
  return (t || "").replace(/[\p{Extended_Pictographic}️‍]/gu, "")
    .replace(/^\s*\d{1,2}-\d{1,2}\s*/, "").replace(/^[^\p{L}\p{N}"']+/u, "").replace(/\s+/g, " ").trim();
}
function fallbackExcerpt(firstPara, markdown) {
  let s = (firstPara || markdown.replace(/[#>*_`]/g, " ")).replace(/\s+/g, " ").trim();
  if (s.length <= 155) return s;
  s = s.slice(0, 155);
  return s.slice(0, s.lastIndexOf(" ")).trim() + "…";
}

const recs = readFileSync(join(OUT, "leadership-addback.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const enr = new Map();
if (existsSync(ENR)) {
  for (const ef of readdirSync(ENR).filter((f) => /^e-\d+\.json$/.test(f))) {
    let arr;
    try { arr = JSON.parse(readFileSync(join(ENR, ef), "utf8")); } catch { continue; }
    if (Array.isArray(arr)) for (const e of arr) if (e && e.file) enr.set(e.file, e);
  }
}

recs.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.file.localeCompare(b.file));
const used = new Map();
function uniqueSlug(title) {
  let base = slugify(title) || "article";
  const seen = used.get(base) || 0;
  used.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

let fromLLM = 0, fromFallback = 0;
const rows = recs.map((s) => {
  const e = enr.get(s.file);
  const valid = e && typeof e.seo_title === "string" && e.seo_title.trim() &&
    typeof e.excerpt === "string" && e.excerpt.trim() && Array.isArray(e.tags);
  if (valid) fromLLM++; else fromFallback++;
  const title = (valid ? e.seo_title : cleanTitle(s.title) || s.title).trim().slice(0, 120);
  const excerpt = (valid ? e.excerpt : fallbackExcerpt(s.firstPara, s.markdown)).trim().slice(0, 200);
  let tags = valid ? e.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 6) : [];
  if (tags.length === 0) {
    tags = cleanTitle(s.title).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter((w) => w.length > 3 && !["with", "your", "that", "this", "from", "what", "why", "how", "the", "and", "for"].includes(w)).slice(0, 5);
  }
  const tldr = valid && typeof e.tldr === "string" && e.tldr.trim() ? e.tldr.trim().slice(0, 400) : null;
  return {
    title, slug: uniqueSlug(title), excerpt, content: s.markdown, cover_image: "",
    tags, category: s.category, source_url: s.sourceUrl || null,
    series_name: null, series_order: 0, tldr, published: true, created_at: s.date, file: s.file,
  };
});

writeFileSync(join(OUT, "leadership-final.ndjson"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log("rows:", rows.length, "→ leadership-final.ndjson");
console.log("enrichment used:", fromLLM, "| fallback:", fromFallback);
console.log("self slug collisions (should be 0):", rows.length - new Set(rows.map((r) => r.slug)).size);
console.log("missing date:", rows.filter((r) => !r.created_at).length);
