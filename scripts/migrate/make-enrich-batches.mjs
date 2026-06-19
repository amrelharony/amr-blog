// Phase C prep — split survivors into enrichment batch files for the LLM SEO pass.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");
const DIR = join(OUT, "enrich-batches");
const SIZE = Number(process.argv[2] || 60);

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const recs = readFileSync(join(OUT, "survivors.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

let n = 0;
for (let i = 0; i < recs.length; i += SIZE) {
  const batch = recs.slice(i, i + SIZE).map((r) => ({
    file: r.file,
    title: r.title,
    category: r.category,
    body: r.markdown.replace(/\s+/g, " ").slice(0, 1100),
  }));
  writeFileSync(join(DIR, `eb-${String(n).padStart(3, "0")}.json`), JSON.stringify(batch));
  n++;
}
console.log("wrote", n, "enrichment batches of", SIZE, "(", recs.length, "articles )");
