// Phase B apply — join LLM verdicts to candidates and perform the AGGRESSIVE cut.
// Steps: (A) drop quality<=2  (B) collapse same topic_signature, keep best
//        (C) quality/distinctiveness gate, adaptively targeting ~2,500-3,000.
// Writes survivors.ndjson + curation-dropped.csv.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");
const VERD = join(OUT, "verdicts");
const TARGET_MIN = 2500, TARGET_MAX = 3000;

const cands = readFileSync(join(OUT, "candidates.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const byFile = new Map(cands.map((c) => [c.file, c]));

// Merge verdicts
let merged = 0;
for (const vf of readdirSync(VERD).filter((f) => /^v-\d+\.json$/.test(f))) {
  const arr = JSON.parse(readFileSync(join(VERD, vf), "utf8"));
  for (const v of arr) {
    const c = byFile.get(v.file);
    if (!c) continue;
    c.quality = v.quality;
    c.distinctive = !!v.distinctive;
    c.topic_signature = String(v.topic_signature || "").toLowerCase().trim();
    c.category = ["Leadership", "Business", "Tech"].includes(v.category) ? v.category : c.category;
    merged++;
  }
}
const scored = cands.filter((c) => typeof c.quality === "number");
console.log("candidates:", cands.length, "| merged verdicts:", merged, "| scored:", scored.length);
console.log("unscored (no verdict):", cands.length - scored.length);

// Distributions
const qh = {};
for (const c of scored) qh[c.quality] = (qh[c.quality] || 0) + 1;
console.log("quality histogram:", JSON.stringify(qh));
console.log("distinctive=true:", scored.filter((c) => c.distinctive).length);

const dropped = [];
const drop = (c, reason) => { dropped.push({ ...c, reason }); };

// (A) drop quality <= 2
let pool = [];
for (const c of scored) (c.quality <= 2 ? drop(c, `low-quality(${c.quality})`) : pool.push(c));
// also drop any unscored as a safety (no verdict -> treat as low)
for (const c of cands) if (typeof c.quality !== "number") drop(c, "unscored");
console.log("after (A) drop quality<=2:", pool.length);

// (B) collapse by topic signature (sorted-words key catches word-order variants)
const sigKey = (s) => (s || "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2).sort().join(" ");
const groups = new Map();
for (const c of pool) {
  const k = sigKey(c.topic_signature);
  if (!k) { // no signature -> unique
    groups.set(`__uniq_${c.file}`, [c]);
    continue;
  }
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}
const better = (a, b) =>
  b.quality - a.quality ||
  (b.distinctive === a.distinctive ? 0 : b.distinctive ? 1 : -1) ||
  b.words - a.words ||
  String(b.date).localeCompare(String(a.date));
let deduped = [];
let topicDupes = 0;
for (const g of groups.values()) {
  if (g.length === 1) { deduped.push(g[0]); continue; }
  g.sort(better);
  deduped.push(g[0]);
  for (let i = 1; i < g.length; i++) { drop(g[i], `topic-dup(${g[0].file})`); topicDupes++; }
}
console.log("after (B) topic-signature dedup:", deduped.length, "| topic dupes dropped:", topicDupes);

// (C) quality/distinctiveness gate, adaptive to target band
function gate(keepQ3Distinctive, keepQ3All) {
  const keep = [], cut = [];
  for (const c of deduped) {
    const ok =
      c.quality >= 4 ||
      (c.quality === 3 && (keepQ3All || (keepQ3Distinctive && c.distinctive)));
    (ok ? keep : cut).push(c);
  }
  return { keep, cut };
}
let { keep, cut } = gate(true, false); // q>=4, or q3+distinctive
if (keep.length > TARGET_MAX) {
  // too many: also drop the weakest q3-distinctive (fewest words) down to TARGET_MAX
  const q4 = keep.filter((c) => c.quality >= 4);
  const q3 = keep.filter((c) => c.quality === 3).sort((a, b) => b.words - a.words);
  const room = Math.max(0, TARGET_MAX - q4.length);
  keep = q4.concat(q3.slice(0, room));
  cut = cut.concat(q3.slice(room));
} else if (keep.length < TARGET_MIN) {
  // too few: add back best q3 (non-distinctive) by words until TARGET_MIN
  const addable = cut.filter((c) => c.quality === 3).sort((a, b) => b.words - a.words);
  const need = TARGET_MIN - keep.length;
  keep = keep.concat(addable.slice(0, need));
  cut = addable.slice(need).concat(cut.filter((c) => c.quality !== 3));
}
for (const c of cut) drop(c, `gated(q${c.quality},d${c.distinctive ? 1 : 0})`);
const survivors = keep;

// strip internal fields not needed downstream
for (const s of survivors) { delete s._sig; }

writeFileSync(join(OUT, "survivors.ndjson"), survivors.map((s) => JSON.stringify(s)).join("\n") + "\n");
const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
writeFileSync(join(OUT, "curation-dropped.csv"),
  "reason,quality,distinctive,category,title,file\n" +
  dropped.map((d) => [d.reason, d.quality, d.distinctive, d.category, d.title, d.file].map(csvEsc).join(",")).join("\n") + "\n");

const byCat = {};
for (const s of survivors) byCat[s.category || "(none)"] = (byCat[s.category || "(none)"] || 0) + 1;
console.log("\n=== FINAL SURVIVORS:", survivors.length, "===");
console.log("by category:", JSON.stringify(byCat));
console.log("dropped total:", dropped.length, "→ curation-dropped.csv");
const fq = {};
for (const s of survivors) fq[s.quality] = (fq[s.quality] || 0) + 1;
console.log("survivor quality histogram:", JSON.stringify(fq));
