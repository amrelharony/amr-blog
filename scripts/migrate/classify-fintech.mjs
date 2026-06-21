// Classify which published "Business" articles are really Fintech, so they can
// be recategorized. READ-ONLY: pulls rows via the anon REST API (RLS-safe) and
// scores each against a fintech lexicon. Writes a reviewable ranked CSV plus the
// slug list that apply-fintech.mjs will move to category='Fintech'.
//
// Precision-first: an article only QUALIFIES if it has at least one STRONG
// (decisively-fintech) hit. GENERIC financial terms (bank, finance, trading…)
// never qualify an article alone — they only refine ranking among real fintech.
//
// Usage:
//   node scripts/migrate/classify-fintech.mjs            # default threshold
//   node scripts/migrate/classify-fintech.mjs 7          # custom score cutoff
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "scripts/migrate/out");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const THRESHOLD = Number(process.argv[2] || 5);

function readEnv(key) {
  for (const p of [join(process.cwd(), ".env.local"), "D:/Claude Desktop/amr-blog/.env.local"]) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp("^" + key + "=(.*)$", "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
const URL = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const KEY = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!URL || !KEY) { console.error("ERROR: Supabase URL/anon key not found in .env.local"); process.exit(1); }

// ── Fintech lexicon ────────────────────────────────────────────────────────
// STRONG: decisively-fintech. A single STRONG hit qualifies the article.
// Bare common words (square, wise, swift, aml) are deliberately excluded —
// only their unambiguous phrase forms appear.
const STRONG = [
  "fintech", "financial technology", "neobank", "challenger bank", "digital bank",
  "digital banking", "mobile banking", "online banking", "open banking",
  "banking-as-a-service", "baas", "embedded finance", "buy now pay later", "bnpl",
  "payment", "payments", "payment gateway", "payment processor", "payment processing",
  "card network", "card issuing", "merchant acquiring", "contactless payment",
  "qr payment", "instant payment", "real-time payment", "cross-border payment",
  "money transfer", "remittance", "remittances", "mobile money", "m-pesa", "mpesa",
  "digital wallet", "e-wallet", "mobile wallet", "paypal", "stripe", "apple pay",
  "google pay", "venmo", "adyen", "klarna", "revolut", "paytm", "coinbase", "binance",
  "cryptocurrency", "crypto", "blockchain", "bitcoin", "ethereum", "stablecoin",
  "defi", "decentralized finance", "central bank digital currency", "cbdc",
  "tokenization", "digital lending", "peer-to-peer lending", "p2p lending",
  "microfinance", "credit scoring", "robo-advisor", "robo advisor", "wealthtech",
  "insurtech", "regtech", "paytech", "kyc", "anti-money laundering", "pci dss",
  "psd2", "super app", "iban",
];
// GENERIC: financial but not fintech-specific. Refines ranking only; cannot
// qualify an article on its own.
const GENERIC = [
  "bank", "banking", "finance", "financial", "financial services", "financial inclusion",
  "unbanked", "underbanked", "credit card", "debit card", "loan", "loans", "lending",
  "mortgage", "investment", "investing", "investor", "trading", "trader", "brokerage",
  "broker", "stock market", "stock exchange", "capital markets", "asset management",
  "wealth management", "hedge fund", "insurance", "foreign exchange", "forex", "currency",
  "interest rate", "interest rates", "monetary policy", "central bank", "wall street",
  "nasdaq", "economy", "economic",
];
// Tags carry author intent. STRONG_TAGS qualify; GENERIC_TAGS only rank.
const STRONG_TAGS = new Set([
  "fintech", "payments", "payment", "crypto", "cryptocurrency", "blockchain", "bitcoin",
  "ethereum", "defi", "stablecoin", "neobank", "bnpl", "remittance", "wallet", "insurtech",
  "regtech", "wealthtech", "paytech", "payment processing", "open banking", "digital banking",
  "mobile money",
]);
const GENERIC_TAGS = new Set([
  "bank", "banking", "finance", "financial", "financial services", "financial inclusion",
  "unbanked", "lending", "mortgage", "investment", "investing", "trading", "insurance",
  "stock market", "capital markets", "economy", "economics",
]);

const isPhrase = (t) => t.includes(" ") || t.includes("-");
const wordRe = (t) => new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
const hit = (term, hay) => (isPhrase(term) ? hay.includes(term) : wordRe(term).test(hay));

function scoreArticle(a) {
  const title = (a.title || "").toLowerCase();
  const excerpt = (a.excerpt || "").toLowerCase();
  const tags = (a.tags || []).map((t) => String(t).toLowerCase());
  let strong = 0, score = 0;
  const hits = [];
  for (const t of STRONG) {
    if (hit(t, title)) { score += 5; strong++; hits.push(`${t}@title`); }
    if (hit(t, excerpt)) { score += 3; strong++; hits.push(`${t}@excerpt`); }
  }
  for (const t of GENERIC) {
    if (hit(t, title)) { score += 1; hits.push(`${t}@title`); }
    if (hit(t, excerpt)) { score += 0.5; hits.push(`${t}@excerpt`); }
  }
  for (const tag of tags) {
    if (STRONG_TAGS.has(tag)) { score += 5; strong++; hits.push(`tag:${tag}!`); }
    else if (GENERIC_TAGS.has(tag)) { score += 1; hits.push(`tag:${tag}`); }
  }
  return { strong, score, hits };
}

async function fetchAllBusiness() {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; from < 100000; from += PAGE) {
    const url = `${URL}/rest/v1/longform_articles?select=slug,title,excerpt,tags,created_at&published=eq.true&category=eq.Business&order=created_at.desc`;
    const r = await fetch(url, {
      headers: {
        apikey: KEY, Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items",
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const batch = await r.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function main() {
  console.log("fetching Business articles…");
  const rows = await fetchAllBusiness();
  console.log(`fetched ${rows.length} Business articles`);

  // Qualify only on a strong signal; rank by total score.
  const scored = rows
    .map((a) => ({ ...a, ...scoreArticle(a) }))
    .filter((a) => a.strong >= 1)
    .sort((x, y) => y.score - x.score);

  const keep = scored.filter((a) => a.score >= THRESHOLD);

  writeFileSync(
    join(OUT, "fintech-candidates.csv"),
    "score,strong,keep,title,slug,tags,matched\n" +
      scored
        .map((a) =>
          [a.score, a.strong, a.score >= THRESHOLD ? "yes" : "no", a.title, a.slug,
            (a.tags || []).join("|"), a.hits.join(" ")]
            .map(csvEsc).join(","),
        )
        .join("\n") + "\n",
  );
  writeFileSync(
    join(OUT, "fintech-slugs.json"),
    JSON.stringify({ threshold: THRESHOLD, count: keep.length, slugs: keep.map((a) => a.slug) }, null, 2),
  );

  const buckets = {};
  for (const a of scored) {
    const b = a.score >= 20 ? "20+" : String(Math.floor(a.score / 2) * 2);
    buckets[b] = (buckets[b] || 0) + 1;
  }
  console.log(`\nqualified (>=1 strong hit): ${scored.length}`);
  console.log("score distribution:");
  for (const k of Object.keys(buckets).sort((a, b) => Number(a) - Number(b))) {
    console.log(`  score ${k}: ${buckets[k]}`);
  }
  console.log(`\nthreshold=${THRESHOLD} → ${keep.length} articles to move to Fintech`);
  console.log("wrote out/fintech-candidates.csv (review this) + out/fintech-slugs.json");
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
