// Phase A — parse the LinkedIn HTML exports into clean records.
//   - extract title / dates / series→category / source(LinkedIn) url
//   - convert the body HTML to Markdown, STRIPPING ALL IMAGES
//   - emit parsed.ndjson (one JSON record per line) + a summary
//
// Run: node scripts/migrate/parse.mjs [ARTICLES_DIR] [OUT_DIR]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const DIR = process.argv[2] || "D:/Claude Desktop/amr-blog/Articles";
const OUT = process.argv[3] || join(process.cwd(), "scripts/migrate/out");
mkdirSync(OUT, { recursive: true });

// ---------- helpers ----------
const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", middot: "·", bull: "•", deg: "°",
  trade: "™", reg: "®", copy: "©", eacute: "é", egrave: "è",
};
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in NAMED ? NAMED[n.toLowerCase()] : m));
}

function pick(re, s) {
  const m = s.match(re);
  return m ? m[1] : "";
}

function toISO(raw) {
  // raw like "2024-09-06 07:26" — treat as UTC.
  const m = (raw || "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi)).toISOString();
}

function categoryFromSeries(series) {
  if (/leadership/i.test(series)) return "Leadership";
  if (/tech/i.test(series)) return "Tech";
  if (/business/i.test(series)) return "Business";
  return ""; // unknown — LLM/default later
}

// Carve out the content region: after the published/created paragraph → </body>.
function bodyRegion(html) {
  let i = html.search(/class="published">[^<]*<\/p>/i);
  if (i !== -1) i = html.indexOf("</p>", i) + 4;
  else {
    i = html.search(/class="created">[^<]*<\/p>/i);
    if (i !== -1) i = html.indexOf("</p>", i) + 4;
    else {
      const h1 = html.search(/<\/h1>/i);
      // Advance past the FULL opening <body ...> tag (not a fixed +6, which lands
      // mid-tag and leaks attribute text when <body> carries attributes).
      const bm = html.match(/<body[^>]*>/i);
      i = h1 !== -1 ? h1 + 5 : (bm ? bm.index + bm[0].length : 0);
    }
  }
  const end = html.lastIndexOf("</body>");
  return html.slice(i, end === -1 ? html.length : end);
}

// ---------- HTML → Markdown (images stripped) ----------
function htmlToMarkdown(raw) {
  let s = raw;
  // 0. Drop images, scripts/styles, iframes, spans/divs (keep inner text).
  s = s.replace(/<img\b[^>]*>/gi, "");
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "");
  s = s.replace(/<\/?(span|div|figure|figcaption|section|article|body|html|head)\b[^>]*>/gi, "");

  // 1. Inline marks first (independent of block structure).
  s = s.replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_, _t, inner) => `**${inner.trim()}**`);
  s = s.replace(/<\s*(em|i)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_, _t, inner) => `*${inner.trim()}*`);
  s = s.replace(/<\s*code\b[^>]*>([\s\S]*?)<\/\s*code\s*>/gi, (_, inner) => "`" + inner.trim() + "`");
  s = s.replace(/<\s*a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/\s*a\s*>/gi,
    (_, href, txt) => {
      const t = txt.replace(/<[^>]+>/g, "").trim();
      return t ? `[${t}](${href})` : "";
    });

  // 2. Headings — promote the shallowest present to ## (h2) for SEO/TOC.
  const levels = [...s.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const minL = levels.length ? Math.min(...levels) : 2;
  s = s.replace(/<\s*h([1-6])\b[^>]*>([\s\S]*?)<\/\s*h\1\s*>/gi, (_, lvl, inner) => {
    const depth = Math.min(6, 2 + (Number(lvl) - minL));
    const text = inner.replace(/<[^>]+>/g, "").trim();
    return text ? `\n\n${"#".repeat(depth)} ${text}\n\n` : "\n\n";
  });

  // 3. Blockquotes.
  s = s.replace(/<\s*blockquote\b[^>]*>([\s\S]*?)<\/\s*blockquote\s*>/gi, (_, inner) => {
    const text = inner.replace(/<\/?p\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").trim();
    const quoted = text.split(/\n+/).map((l) => `> ${l.trim()}`).join("\n");
    return `\n\n${quoted}\n\n`;
  });

  // 4. Ordered lists (numbered) then unordered lists.
  s = s.replace(/<\s*ol\b[^>]*>([\s\S]*?)<\/\s*ol\s*>/gi, (_, inner) => {
    let n = 0;
    const items = inner.replace(/<\s*li\b[^>]*>([\s\S]*?)<\/\s*li\s*>/gi, (_, it) => {
      n += 1;
      return `\n${n}. ${it.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`;
    });
    return `\n\n${items.replace(/<[^>]+>/g, "").trim()}\n\n`;
  });
  s = s.replace(/<\s*ul\b[^>]*>([\s\S]*?)<\/\s*ul\s*>/gi, (_, inner) => {
    const items = inner.replace(/<\s*li\b[^>]*>([\s\S]*?)<\/\s*li\s*>/gi,
      (_, it) => `\n- ${it.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`);
    return `\n\n${items.replace(/<[^>]+>/g, "").trim()}\n\n`;
  });
  // Stray <li> outside a list → bullet.
  s = s.replace(/<\s*li\b[^>]*>([\s\S]*?)<\/\s*li\s*>/gi, (_, it) => `\n- ${it.replace(/<[^>]+>/g, " ").trim()}`);

  // 5. Horizontal rules, line breaks, paragraphs.
  s = s.replace(/<\s*hr\b[^>]*\/?>/gi, "\n\n---\n\n");
  s = s.replace(/<\s*br\b[^>]*\/?>/gi, "\n");
  s = s.replace(/<\s*p\b[^>]*>([\s\S]*?)<\/\s*p\s*>/gi, (_, inner) => `\n\n${inner.trim()}\n\n`);

  // 6. Strip any remaining tags, decode entities, normalize whitespace.
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

function plainText(md) {
  return md.replace(/[#>*_`\-]+/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
}
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

// ---------- main ----------
const files = readdirSync(DIR).filter((f) => f.endsWith(".html"));
const out = [];
const catCount = {};
let emptyBody = 0;
for (const file of files) {
  const html = readFileSync(join(DIR, file), "utf8");
  const title = decodeEntities(pick(/<title>([\s\S]*?)<\/title>/i, html).trim());
  const series = decodeEntities(pick(/class="series-title">([\s\S]*?)<\/span>/i, html).trim());
  const category = categoryFromSeries(series);
  const created = toISO(pick(/class="created">Created on ([^<]+)</i, html));
  const published = toISO(pick(/class="published">Published on ([^<]+)</i, html));
  const sourceUrl = pick(/<h1><a href="([^"]+)"/i, html).trim();
  const markdown = htmlToMarkdown(bodyRegion(html));
  const text = plainText(markdown);
  const words = text ? text.split(" ").length : 0;
  if (words === 0) emptyBody++;
  const firstPara = (markdown.split(/\n{2,}/).find((p) => p.trim() && !/^[#>\-]/.test(p.trim())) || "").trim();
  catCount[category || "(none)"] = (catCount[category || "(none)"] || 0) + 1;
  out.push({
    file,
    title,
    series,
    category,
    date: published || created || null,
    created,
    published,
    sourceUrl,
    markdown,
    words,
    firstPara,
    titleNorm: norm(title),
    contentHash: createHash("md5").update(norm(text)).digest("hex"),
  });
}

const outFile = join(OUT, "parsed.ndjson");
writeFileSync(outFile, out.map((r) => JSON.stringify(r)).join("\n") + "\n");

console.log("parsed:", out.length, "→", outFile);
console.log("category counts:", JSON.stringify(catCount));
console.log("empty-body (0 words):", emptyBody);
console.log("missing date:", out.filter((r) => !r.date).length);
console.log("missing source url:", out.filter((r) => !r.sourceUrl).length);
const ws = out.map((r) => r.words).sort((a, b) => a - b);
console.log("words: min", ws[0], "median", ws[Math.floor(ws.length / 2)], "max", ws[ws.length - 1]);
console.log("\n--- sample record (markdown preview) ---");
const sample = out.find((r) => r.words > 300 && r.category === "Tech") || out[0];
console.log("title:", sample.title);
console.log("category:", sample.category, "| date:", sample.date, "| words:", sample.words);
console.log(sample.markdown.slice(0, 700));
