// Phase A — quality floor + de-duplication (exact + near-dup via MinHash/LSH).
// Reads parsed.ndjson; writes candidates.ndjson (survivors) and audit CSVs.
//
// Run: node scripts/migrate/prepare.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");
const MIN_WORDS = 120;       // quality floor
const H = 128;               // minhash functions
const BANDS = 16, ROWS = 8;  // 16*8 = 128; LSH knee ≈ 0.81
const K = 8;                 // shingle size (words)
const JACCARD = 0.82;        // near-dup threshold

const recs = readFileSync(join(OUT, "parsed.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

// ---------- quality floor ----------
const dropped = [];
const kept = [];
for (const r of recs) {
  if (r.words < MIN_WORDS) dropped.push({ ...r, reason: r.words === 0 ? "empty" : "thin(<120w)" });
  else kept.push(r);
}

// ---------- minhash ----------
function shingles(text) {
  const w = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const set = new Set();
  if (w.length < K) { set.add(w.join(" ")); return set; }
  for (let i = 0; i + K <= w.length; i++) set.add(w.slice(i, i + K).join(" "));
  return set;
}
function strHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mix(x, seed) {
  let h = (x ^ Math.imul(seed + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
function signature(text) {
  const sig = new Uint32Array(H).fill(0xffffffff);
  for (const sh of shingles(text)) {
    const x = strHash(sh);
    for (let i = 0; i < H; i++) { const v = mix(x, i); if (v < sig[i]) sig[i] = v; }
  }
  return sig;
}

// Use the parsed plain text proxy: reconstruct from markdown like parse.mjs did.
function plain(md) {
  return md.replace(/[#>*_`-]+/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
}
for (const r of kept) r._sig = signature(plain(r.markdown));

// ---------- LSH candidate pairs (category-agnostic: catches cross-category reposts) ----------
const buckets = new Map();
kept.forEach((r, idx) => {
  for (let b = 0; b < BANDS; b++) {
    let hh = 0x811c9dc5;
    for (let j = 0; j < ROWS; j++) { hh ^= r._sig[b * ROWS + j]; hh = Math.imul(hh, 0x01000193); }
    const key = b + ":" + (hh >>> 0);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(idx);
  }
});

// ---------- union-find over verified near-dup pairs ----------
const parent = kept.map((_, i) => i);
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
function simSig(a, b) { let eq = 0; for (let i = 0; i < H; i++) if (a[i] === b[i]) eq++; return eq / H; }

const seenPair = new Set();
let comparisons = 0;
for (const list of buckets.values()) {
  if (list.length < 2) continue;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const pk = a < b ? a * 1e7 + b : b * 1e7 + a;
      if (seenPair.has(pk)) continue;
      seenPair.add(pk);
      comparisons++;
      // exact-hash shortcut, else verify by signature similarity
      if (kept[a].contentHash === kept[b].contentHash || simSig(kept[a]._sig, kept[b]._sig) >= JACCARD) union(a, b);
    }
  }
}

// ---------- also union exact identical titles (cross-category reposts) ----------
const byTitle = new Map();
kept.forEach((r, idx) => {
  if (!r.titleNorm) return; // ignore empty titles
  if (!byTitle.has(r.titleNorm)) byTitle.set(r.titleNorm, []);
  byTitle.get(r.titleNorm).push(idx);
});
for (const idxs of byTitle.values()) {
  for (let i = 1; i < idxs.length; i++) union(idxs[0], idxs[i]);
}

// ---------- pick best per cluster ----------
const clusters = new Map();
kept.forEach((_, i) => { const r = find(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(i); });
const survivors = [];
const dupDropped = [];
for (const members of clusters.values()) {
  if (members.length === 1) { survivors.push(kept[members[0]]); continue; }
  // best = most words, then newest date
  members.sort((a, b) => kept[b].words - kept[a].words || String(kept[b].date).localeCompare(String(kept[a].date)));
  survivors.push(kept[members[0]]);
  for (let i = 1; i < members.length; i++) {
    dupDropped.push({ kept: kept[members[0]].file, dropped: kept[members[i]].file, title: kept[members[i]].title, cat: kept[members[i]].category });
  }
}

// strip helper field
for (const s of survivors) delete s._sig;

writeFileSync(join(OUT, "candidates.ndjson"), survivors.map((r) => JSON.stringify(r)).join("\n") + "\n");

const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
writeFileSync(join(OUT, "dropped-quality.csv"),
  "reason,words,category,title,file\n" + dropped.map((d) => [d.reason, d.words, d.category, d.title, d.file].map(csvEsc).join(",")).join("\n") + "\n");
writeFileSync(join(OUT, "dropped-duplicates.csv"),
  "category,title,dropped_file,kept_file\n" + dupDropped.map((d) => [d.cat, d.title, d.dropped, d.kept].map(csvEsc).join(",")).join("\n") + "\n");

const byCat = {};
for (const s of survivors) byCat[s.category || "(none)"] = (byCat[s.category || "(none)"] || 0) + 1;
console.log("input:", recs.length);
console.log("dropped by quality floor:", dropped.length, "(empty:", dropped.filter((d) => d.reason === "empty").length, ")");
console.log("LSH candidate comparisons:", comparisons);
console.log("dropped as duplicates:", dupDropped.length);
console.log("SURVIVORS → candidates.ndjson:", survivors.length);
console.log("survivors by category:", JSON.stringify(byCat));
