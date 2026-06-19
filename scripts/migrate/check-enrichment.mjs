// Validate the enrichment files (e-*.json) against their batches; report missing
// or malformed ones so only those need re-running.
import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");
const EB = join(OUT, "enrich-batches");
const EN = join(OUT, "enrichment");

const batches = readdirSync(EB).filter((f) => /^eb-\d+\.json$/.test(f)).sort();
const missing = [];
let okBatches = 0, okItems = 0;
const problems = [];

for (const bf of batches) {
  const id = bf.match(/eb-(\d+)\.json/)[1];
  const batch = JSON.parse(readFileSync(join(EB, bf), "utf8"));
  const ep = join(EN, `e-${id}.json`);
  if (!existsSync(ep)) { missing.push(Number(id)); continue; }
  let arr;
  try { arr = JSON.parse(readFileSync(ep, "utf8")); } catch { problems.push(`${id}: bad JSON`); missing.push(Number(id)); continue; }
  if (!Array.isArray(arr) || arr.length !== batch.length) { problems.push(`${id}: len ${arr?.length} != ${batch.length}`); missing.push(Number(id)); continue; }
  let good = true;
  for (const e of arr) {
    if (!e || typeof e.seo_title !== "string" || !e.seo_title.trim() ||
        typeof e.excerpt !== "string" || !e.excerpt.trim() || !Array.isArray(e.tags)) { good = false; break; }
  }
  if (!good) { problems.push(`${id}: bad items`); missing.push(Number(id)); continue; }
  okBatches++; okItems += arr.length;
}

missing.sort((a, b) => a - b);
console.log(`enrich batches: ${batches.length} | valid: ${okBatches} (items ${okItems}) | missing/invalid: ${missing.length}`);
if (problems.length) console.log("problems:\n  " + problems.join("\n  "));
console.log("MISSING:", JSON.stringify(missing));
writeFileSync(join(OUT, "missing-enrich.json"), JSON.stringify(missing));
