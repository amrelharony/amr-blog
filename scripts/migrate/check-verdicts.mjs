// Validate the verdict files written by the curation workflow; report which
// batches are missing or malformed so only those need re-running.
import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");
const BATCH_DIR = join(OUT, "batches");
const VERD_DIR = join(OUT, "verdicts");

const batchFiles = readdirSync(BATCH_DIR).filter((f) => /^batch-\d+\.json$/.test(f)).sort();
const REQUIRED = ["file", "category", "quality", "distinctive", "topic_signature"];
const VALID_CAT = new Set(["Leadership", "Business", "Tech"]);

const missing = [];
let validBatches = 0;
let validVerdicts = 0;
const problems = [];

for (const bf of batchFiles) {
  const id = bf.match(/batch-(\d+)\.json/)[1];
  const idx = Number(id);
  const batch = JSON.parse(readFileSync(join(BATCH_DIR, bf), "utf8"));
  const vp = join(VERD_DIR, `v-${id}.json`);
  if (!existsSync(vp)) { missing.push(idx); continue; }
  let arr;
  try { arr = JSON.parse(readFileSync(vp, "utf8")); } catch { problems.push(`${id}: invalid JSON`); missing.push(idx); continue; }
  if (!Array.isArray(arr)) { problems.push(`${id}: not an array`); missing.push(idx); continue; }
  if (arr.length !== batch.length) { problems.push(`${id}: length ${arr.length} != ${batch.length}`); missing.push(idx); continue; }
  let ok = true;
  for (const v of arr) {
    if (!v || REQUIRED.some((k) => !(k in v)) || !VALID_CAT.has(v.category) || typeof v.quality !== "number") { ok = false; break; }
  }
  if (!ok) { problems.push(`${id}: bad verdict items`); missing.push(idx); continue; }
  validBatches++;
  validVerdicts += arr.length;
}

missing.sort((a, b) => a - b);
console.log(`batches total: ${batchFiles.length}`);
console.log(`valid verdict batches: ${validBatches}  (verdicts: ${validVerdicts})`);
console.log(`missing/invalid batches: ${missing.length}`);
if (problems.length) console.log("problems:\n  " + problems.join("\n  "));
console.log("MISSING INDICES:", JSON.stringify(missing));
writeFileSync(join(OUT, "missing-batches.json"), JSON.stringify(missing));
