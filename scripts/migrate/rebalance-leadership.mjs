// Rebalance: recover quality-3 Leadership articles that were gated out as
// "non-distinctive" (keeping the q>=3 floor). Dedupe against topics already
// covered by current survivors. Output leadership-addback.ndjson.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");

// Merge verdicts into candidates
const cands = readFileSync(join(OUT, "candidates.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const byFile = new Map(cands.map((c) => [c.file, c]));
for (const vf of readdirSync(join(OUT, "verdicts")).filter((f) => /^v-\d+\.json$/.test(f))) {
  for (const v of JSON.parse(readFileSync(join(OUT, "verdicts", vf), "utf8"))) {
    const c = byFile.get(v.file);
    if (!c) continue;
    c.quality = v.quality;
    c.distinctive = !!v.distinctive;
    c.topic_signature = String(v.topic_signature || "").toLowerCase().trim();
    c.category = ["Leadership", "Business", "Tech"].includes(v.category) ? v.category : c.category;
  }
}

const survivors = readFileSync(join(OUT, "survivors.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const survivorFiles = new Set(survivors.map((s) => s.file));

// Topic key identical to apply-curation (sorted significant words)
const sigKey = (s) => (s || "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2).sort().join(" ");
const coveredTopics = new Set(survivors.map((s) => sigKey(s.topic_signature)).filter(Boolean));

// Add-back pool: Leadership, quality>=3, NOT already a survivor, topic not already covered.
const better = (a, b) =>
  b.quality - a.quality ||
  (b.distinctive === a.distinctive ? 0 : b.distinctive ? 1 : -1) ||
  b.words - a.words ||
  String(b.date).localeCompare(String(a.date));

const pool = cands.filter(
  (c) => c.category === "Leadership" && typeof c.quality === "number" && c.quality >= 3 && !survivorFiles.has(c.file),
);
// Dedup the pool by topic, keeping best, and skip topics already covered by survivors.
const byTopic = new Map();
const noTopic = [];
for (const c of pool) {
  const k = sigKey(c.topic_signature);
  if (!k) { noTopic.push(c); continue; }
  if (coveredTopics.has(k)) continue; // topic already represented among survivors
  if (!byTopic.has(k)) byTopic.set(k, []);
  byTopic.get(k).push(c);
}
const addback = [];
for (const g of byTopic.values()) { g.sort(better); addback.push(g[0]); }
addback.push(...noTopic); // unique (no signature) — keep all

// strip helper fields
for (const a of addback) { delete a._sig; }
writeFileSync(join(OUT, "leadership-addback.ndjson"), addback.map((a) => JSON.stringify(a)).join("\n") + "\n");

const qh = {};
for (const a of addback) qh[a.quality] = (qh[a.quality] || 0) + 1;
console.log("Leadership add-back pool (q>=3, not survivor):", pool.length);
console.log("after topic-dedup vs survivors + self:", addback.length);
console.log("quality histogram:", JSON.stringify(qh));
console.log("new Leadership total would be: 366 +", addback.length, "=", 366 + addback.length);
console.log("→ leadership-addback.ndjson");
