// Read-only corpus analysis of the LinkedIn HTML exports in ../Articles.
// Extracts title/dates/series/body, then reports: counts, length distribution,
// exact + near duplicate rates, and series-label distribution (a category signal).
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const DIR = process.argv[2] || "D:/Claude Desktop/amr-blog/Articles";
const files = readdirSync(DIR).filter((f) => f.endsWith(".html"));

const pick = (re, s) => {
  const m = s.match(re);
  return m ? m[1].trim() : "";
};

function parse(html) {
  const title = pick(/<title>([\s\S]*?)<\/title>/i, html);
  const series = pick(/class="series-title">([\s\S]*?)<\/span>/i, html);
  const created = pick(/class="created">Created on ([^<]+)</i, html);
  const published = pick(/class="published">Published on ([^<]+)</i, html);
  const linkedin = pick(/<h1><a href="([^"]+)"/i, html);
  // Body = the last <div>…</div> (content wrapper) before </body>.
  let body = "";
  const dm = html.match(/<div>([\s\S]*?)<\/div>\s*<\/body>/i);
  if (dm) body = dm[1];
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text ? text.split(" ").length : 0;
  const h2 = (body.match(/<h[23]/gi) || []).length;
  const para = (body.match(/<p[ >]/gi) || []).length;
  const norm = text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const hash = createHash("md5").update(norm).digest("hex");
  const titleNorm = title.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return { title, series, created, published, linkedin, words, h2, para, hash, titleNorm };
}

const recs = files.map((f) => ({ file: f, ...parse(readFileSync(join(DIR, f), "utf8")) }));

// Length buckets
const buckets = { "0": 0, "1-149": 0, "150-299": 0, "300-599": 0, "600-999": 0, "1000+": 0 };
for (const r of recs) {
  if (r.words === 0) buckets["0"]++;
  else if (r.words < 150) buckets["1-149"]++;
  else if (r.words < 300) buckets["150-299"]++;
  else if (r.words < 600) buckets["300-599"]++;
  else if (r.words < 1000) buckets["600-999"]++;
  else buckets["1000+"]++;
}

// Exact-content duplicate groups
const byHash = new Map();
for (const r of recs) byHash.set(r.hash, (byHash.get(r.hash) || 0) + 1);
const exactDupExtra = [...byHash.values()].reduce((a, n) => a + (n - 1), 0);

// Near-dup by normalized title
const byTitle = new Map();
for (const r of recs) byTitle.set(r.titleNorm, (byTitle.get(r.titleNorm) || 0) + 1);
const titleDupExtra = [...byTitle.values()].reduce((a, n) => a + (n - 1), 0);

// Series distribution
const bySeries = new Map();
for (const r of recs) {
  const k = r.series || "(none)";
  bySeries.set(k, (bySeries.get(k) || 0) + 1);
}

// Date range
const dates = recs.map((r) => r.created || r.published).filter(Boolean).sort();

console.log("TOTAL FILES:", recs.length);
console.log("\nWORD-COUNT BUCKETS:", JSON.stringify(buckets, null, 0));
console.log("median words:", recs.map((r) => r.words).sort((a, b) => a - b)[Math.floor(recs.length / 2)]);
console.log("empty body (parse miss or no content):", buckets["0"]);
console.log("\nEXACT content-hash duplicate copies (beyond first):", exactDupExtra);
console.log("Normalized-title duplicate copies (beyond first):", titleDupExtra);
console.log("\nSERIES LABELS (top 25):");
for (const [k, n] of [...bySeries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(n).padStart(5)}  ${k}`);
}
console.log("\nDATE RANGE:", dates[0], "->", dates[dates.length - 1]);
console.log("missing created date:", recs.filter((r) => !r.created).length);
console.log("missing linkedin url:", recs.filter((r) => !r.linkedin).length);

// Show a few worst (shortest) titles to eyeball low-quality
console.log("\nSHORTEST 10 (likely low quality):");
for (const r of [...recs].sort((a, b) => a.words - b.words).slice(0, 10)) {
  console.log(`  ${String(r.words).padStart(4)}w  ${r.title.slice(0, 70)}`);
}
