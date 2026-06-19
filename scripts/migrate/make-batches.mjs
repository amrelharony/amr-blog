// Phase B prep — split candidates.ndjson into compact batch files for LLM scoring.
// Each article: { file, title, category, words, date, excerpt(first ~700 chars) }.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");
const BATCH_DIR = join(OUT, "batches");
const SIZE = Number(process.argv[2] || 50);

rmSync(BATCH_DIR, { recursive: true, force: true });
mkdirSync(BATCH_DIR, { recursive: true });

const recs = readFileSync(join(OUT, "candidates.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

let n = 0;
for (let i = 0; i < recs.length; i += SIZE) {
  const batch = recs.slice(i, i + SIZE).map((r) => ({
    file: r.file,
    title: r.title,
    category: r.category || "",
    words: r.words,
    date: (r.date || "").slice(0, 10),
    excerpt: r.markdown.replace(/\s+/g, " ").slice(0, 700),
  }));
  const id = String(n).padStart(3, "0");
  writeFileSync(join(BATCH_DIR, `batch-${id}.json`), JSON.stringify(batch));
  n++;
}
console.log("wrote", n, "batches of", SIZE, "to", BATCH_DIR, "(", recs.length, "articles )");
