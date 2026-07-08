// Read-only verification for the July 2026 upgrade rollout (migrations
// 0011–0014 + embed Edge Function + backfills). Safe to run at any point:
// nothing here writes — RPC probes call only `stable` SQL functions.
//
// Usage:  node scripts/rollout/verify-rollout.mjs
//
// Prints one PASS/FAIL/SKIP/MANUAL line per check and exits 1 if anything
// FAILed. Run it BEFORE the rollout to confirm the checks detect the missing
// pieces, and AFTER to confirm everything landed.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function readEnv(key) {
  if (process.env[key]) return process.env[key];
  for (const p of [join(process.cwd(), ".env.local"), "D:/Claude Desktop/amr-blog/.env.local"]) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp("^" + key + "=(.*)$", "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const SUPA_URL = readEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const EMBED_FN_URL = readEnv("EMBED_FN_URL");
const EMBED_FN_SECRET = readEnv("EMBED_FN_SECRET");

if (!SUPA_URL || !SERVICE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (env or .env.local).");
  process.exit(1);
}

const sbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};
const TIMEOUT = 10_000;

let failed = 0;
function report(status, name, detail = "") {
  if (status === "FAIL") failed++;
  console.log(`[${status}]${" ".repeat(Math.max(1, 7 - status.length))}${name}${detail ? ` — ${detail}` : ""}`);
}

/** GET a table selection; 200 = schema piece exists, 400/404 = missing. */
async function probeSelect(name, pathAndQuery, hint) {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${pathAndQuery}`, {
      headers: sbHeaders,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.ok) report("PASS", name);
    else report("FAIL", name, `HTTP ${res.status} — ${hint}`);
  } catch (e) {
    report("FAIL", name, e.message);
  }
}

/** POST an RPC; ok = exists (body content irrelevant), 404 = function missing. */
async function probeRpc(name, fn, params, hint) {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: sbHeaders,
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.ok) report("PASS", name);
    else report("FAIL", name, `HTTP ${res.status} — ${hint}`);
  } catch (e) {
    report("FAIL", name, e.message);
  }
}

/** Exact row count via a Range:0-0 request (never fetches the rows). */
async function count(pathAndQuery) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${pathAndQuery}`, {
    headers: { ...sbHeaders, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  const range = res.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  if (!Number.isFinite(total)) throw new Error(`unparseable content-range: ${range}`);
  return total;
}

async function main() {
  console.log(`Verifying rollout against ${SUPA_URL}\n`);

  // ---- 0011: pgvector embeddings -------------------------------------------
  await probeSelect(
    "0011 embedding columns on longform_articles",
    "longform_articles?select=id,embedded_at&limit=1",
    "run scripts/rollout/upgrade-2026-07.sql (section 1/5)",
  );
  await probeRpc(
    "0011 match_related_articles()",
    "match_related_articles",
    { p_article_id: "00000000-0000-0000-0000-000000000000", p_count: 1 },
    "RPC missing — run section 1/5",
  );
  // Unit vector (not zeros) so cosine distance is well-defined.
  const unitVec = `[1${",0".repeat(383)}]`;
  await probeRpc(
    "0011 match_articles()",
    "match_articles",
    { p_embedding: unitVec, p_count: 1 },
    "RPC missing — run section 1/5",
  );

  // ---- 0012: trending rollup ------------------------------------------------
  await probeSelect(
    "0012 article_view_daily table",
    "article_view_daily?select=day&limit=1",
    "run section 2/5",
  );
  await probeRpc("0012 get_trending_articles()", "get_trending_articles", {}, "RPC missing — run section 2/5");

  // ---- 0013: instant notifications ------------------------------------------
  await probeSelect(
    "0013 newsletter_subscribers.frequency column",
    "newsletter_subscribers?select=frequency&limit=1",
    "run section 3/5",
  );
  await probeSelect(
    "0013 article_notification_log table",
    "article_notification_log?select=id&limit=1",
    "run section 3/5",
  );
  // subscribe_newsletter_v2 is NOT probed — calling it would write.

  // ---- 0014: comment reply notifications ------------------------------------
  await probeSelect(
    "0014 comment_subscriptions table",
    "comment_subscriptions?select=id&limit=1",
    "run section 4/5",
  );
  await probeSelect(
    "0014 comment_reply_notification_log table",
    "comment_reply_notification_log?select=reply_comment_id&limit=1",
    "run section 4/5",
  );

  // ---- 0015: bulletin claim + grants ----------------------------------------
  await probeSelect(
    "0015 bulletin_log.batch_remaining column",
    "bulletin_log?select=batch_remaining&limit=1",
    "run db/migrations/0015_bulletin_claim_and_grants.sql",
  );
  // The claim_pending_bulletin BODY (sent_at-on-claim fix) and idx_bulletin_in_progress
  // can't be introspected over PostgREST, and calling the RPC would mutate — so flag it
  // for a dashboard check + unconditional re-apply.
  report(
    "MANUAL",
    "0015 claim_pending_bulletin body + idx_bulletin_in_progress",
    "body is not introspectable and the LIVE function is known to carry the sent_at drift bug — RE-APPLY 0015 unconditionally (create or replace, idempotent). Dashboard check: select pg_get_functiondef('public.claim_pending_bulletin'::regproc);",
  );

  // ---- get_bulletin_subscribers manual edit ---------------------------------
  // PostgREST cannot expose function bodies; the SQL file's section 5/5 audits
  // it on every run. Point at the dashboard check here.
  report(
    "MANUAL",
    "get_bulletin_subscribers frequency filter",
    "in the dashboard SQL editor run: select pg_get_functiondef('public.get_bulletin_subscribers'::regproc); — the body must contain `frequency`",
  );

  // ---- Embed Edge Function ---------------------------------------------------
  if (!EMBED_FN_URL || !EMBED_FN_SECRET) {
    report("SKIP", "embed function reachable", "EMBED_FN_URL / EMBED_FN_SECRET not set");
    report("SKIP", "embed function enforces its secret", "EMBED_FN_URL / EMBED_FN_SECRET not set");
  } else {
    try {
      const res = await fetch(EMBED_FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-embed-secret": EMBED_FN_SECRET },
        body: JSON.stringify({ text: "healthcheck" }),
        signal: AbortSignal.timeout(20_000), // cold start can be slow
      });
      const body = res.ok ? await res.json() : null;
      if (res.ok && Array.isArray(body?.embedding) && body.embedding.length === 384) {
        report("PASS", "embed function reachable (384-dim response)");
      } else {
        report("FAIL", "embed function reachable", `HTTP ${res.status} — deploy per commands.md step 2`);
      }
    } catch (e) {
      report("FAIL", "embed function reachable", e.message);
    }
    try {
      const res = await fetch(EMBED_FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" }, // no secret on purpose
        body: JSON.stringify({ text: "healthcheck" }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 401) report("PASS", "embed function enforces its secret (401 without header)");
      else report("FAIL", "embed function enforces its secret", `expected 401, got ${res.status}`);
    } catch (e) {
      report("FAIL", "embed function enforces its secret", e.message);
    }
  }

  // ---- Backfill progress ------------------------------------------------------
  try {
    const published = await count("longform_articles?select=id&published=eq.true");
    console.log(`\nPublished articles: ${published}`);
    try {
      const noEmbedding = await count("longform_articles?select=id&published=eq.true&embedding=is.null");
      console.log(`  missing embedding: ${noEmbedding}  (backfill-embeddings.mjs${noEmbedding ? " still has work" : " done"})`);
    } catch {
      console.log("  missing embedding: n/a (0011 not applied)");
    }
    const noTldr = await count("longform_articles?select=id&published=eq.true&tldr=is.null");
    console.log(`  missing tldr:      ${noTldr}  (backfill-tldr.mjs${noTldr ? " still has work" : " done"})`);
  } catch (e) {
    report("FAIL", "backfill counts", e.message);
  }

  // ---- Subscriber frequency distribution --------------------------------------
  try {
    const total = await count("newsletter_subscribers?select=id");
    const instant = await count("newsletter_subscribers?select=id&frequency=eq.instant");
    const digest = await count("newsletter_subscribers?select=id&frequency=eq.digest");
    console.log(`Newsletter subscribers: ${total} total — ${digest} digest / ${instant} instant`);
  } catch {
    console.log("Newsletter subscribers: frequency split n/a (0013 not applied)");
  }

  console.log(failed ? `\n${failed} check(s) FAILED.` : "\nAll automated checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("verify-rollout crashed:", e);
  process.exit(1);
});
