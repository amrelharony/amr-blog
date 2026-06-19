// One-off: census of HTML tags appearing in the article body region, so the
// HTML→Markdown converter covers every element actually present in the corpus.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2] || "D:/Claude Desktop/amr-blog/Articles";
const files = readdirSync(DIR).filter((f) => f.endsWith(".html"));

function bodyRegion(html) {
  // Content starts after the published (or created) paragraph; falls back to after </h1>.
  let i = html.search(/class="published">[^<]*<\/p>/i);
  if (i !== -1) i = html.indexOf("</p>", i) + 4;
  else {
    i = html.search(/class="created">[^<]*<\/p>/i);
    if (i !== -1) i = html.indexOf("</p>", i) + 4;
    else {
      i = html.search(/<\/h1>/i);
      i = i !== -1 ? i + 5 : html.search(/<body[^>]*>/i);
    }
  }
  const end = html.lastIndexOf("</body>");
  return html.slice(i, end === -1 ? html.length : end);
}

const tagCount = new Map();
let headingCombos = new Map();
let withCover = 0;
let inlineImgs = 0;
for (const f of files) {
  const html = readFileSync(join(DIR, f), "utf8");
  const body = bodyRegion(html);
  for (const m of body.matchAll(/<\s*\/?\s*([a-z0-9]+)/gi)) {
    const t = m[1].toLowerCase();
    tagCount.set(t, (tagCount.get(t) || 0) + 1);
  }
  const hs = [...body.matchAll(/<h([1-6])/gi)].map((m) => m[1]);
  const combo = [...new Set(hs)].sort().join("");
  headingCombos.set(combo, (headingCombos.get(combo) || 0) + 1);
  // Cover image lives in header (before content) — count separately
  if (/<img[^>]+>/i.test(html.slice(0, html.indexOf(body)))) withCover++;
  if (/<img/i.test(body)) inlineImgs++;
}

console.log("TAG FREQUENCY in body region:");
for (const [t, n] of [...tagCount.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(7)}  <${t}>`);
}
console.log("\nHEADING-LEVEL COMBOS present in body (count of files):");
for (const [c, n] of [...headingCombos.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(6)}  h-levels: ${c || "(none)"}`);
}
console.log("\nfiles with a header/cover <img>:", withCover);
console.log("files with inline <img> inside body:", inlineImgs);
