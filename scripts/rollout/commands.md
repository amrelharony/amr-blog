# Ultra-Refined Upgrade — rollout command sheet (July 2026)

Every command below is copy-pasteable. Full context: `docs/upgrade-rollout.md`.
Everything is fail-open in code, so nothing breaks if you stop halfway.

## 0. One-time prerequisites

```
# Supabase CLI linked to the project (once per machine)
supabase login
supabase link --project-ref <PROJECT_REF>
```

`<PROJECT_REF>` is the subdomain of your Supabase URL
(`https://<PROJECT_REF>.supabase.co`).

## 1. Apply the database schema (dashboard)

Open **Supabase dashboard → SQL editor**, paste the whole of
`scripts/rollout/upgrade-2026-07.sql`, run it. It is idempotent — re-run it
any time. Watch the *Messages* pane:

- `get_bulletin_subscribers() frequency filter present — OK` → nothing to do.
- A **WARNING** about `get_bulletin_subscribers` → do the one manual edit
  (Database → Functions → `get_bulletin_subscribers` → edit the WHERE clause):

  ```sql
  and coalesce(s.frequency, 'digest') = 'digest'
  ```

  Then re-run the SQL file to confirm the warning is gone.

While you are in the dashboard (5 extra minutes, flagged by the code audit):
verify the newsletter RPCs (`claim_pending_bulletin`, `get_last_bulletin`,
`get_bulletin_articles`, `get_bulletin_subscribers`, `create_bulletin_log`,
`update_bulletin_log`) are not anon-executable (or carry an internal guard),
and that `get_bulletin_subscribers` has a deterministic `ORDER BY` — the
paged send in `lib/newsletter/send.ts` (rpcAll) relies on stable ordering
across pages.

## 2. Deploy the embeddings Edge Function

```
# generate a secret (any long random string works)
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

supabase functions deploy embed --no-verify-jwt
supabase secrets set EMBED_FN_SECRET=<the secret>
```

## 3. Environment variables

**Vercel (Production):**

```
vercel env add EMBED_FN_URL production      # https://<PROJECT_REF>.supabase.co/functions/v1/embed
vercel env add EMBED_FN_SECRET production   # same secret as step 2
```

(or dashboard: Settings → Environment Variables). While there, confirm these
already exist: `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`ARTICLES_API_KEY`, `NEWSLETTER_ADMIN_SECRET`. The `/api/health` endpoint
(with `Authorization: Bearer $CRON_SECRET`) reports which are missing.

**Local (parent repo `D:/Claude Desktop/amr-blog/.env.local`)** — add the same
two lines so the backfill + verify scripts can run:

```
EMBED_FN_URL=https://<PROJECT_REF>.supabase.co/functions/v1/embed
EMBED_FN_SECRET=<the secret>
```

**GitHub (repo secrets)** — the hourly LinkedIn workflow curls
`/api/db-keepalive`; make sure the repo secret `CRON_SECRET` exists and
matches the Vercel value.

Do **NOT** set `SEARCH_HYBRID=1` yet — that comes last (step 6).

## 4. Backfills (local, resumable, paced)

```
# Embeddings for the ~2,905-article corpus (~30–60 min at polite pacing)
node scripts/backfill-embeddings.mjs --limit 20   # spot-check first
node scripts/backfill-embeddings.mjs              # full run

# AI TL;DRs for imported LinkedIn articles (via OpenClaw; ~20/min pacing)
node scripts/backfill-tldr.mjs --limit 20         # REVIEW these 20 before continuing
node scripts/backfill-tldr.mjs --limit 300        # repeat until done
```

Both filter on missing values — re-running resumes automatically.

## 5. Verify

```
node scripts/rollout/verify-rollout.mjs
```

Read-only. Expect all PASS (plus one MANUAL line pointing at the
`get_bulletin_subscribers` dashboard check). Running it BEFORE step 1 should
show the migration checks as FAIL — that's how you know detection works.

## 6. Flip the hybrid-search switch (only after step 4 finishes)

```
vercel env add SEARCH_HYBRID production    # value: 1
```

Redeploy (any push, or `vercel redeploy`). `/api/search` now fuses the
semantic arm; unset the var to fall back to pure full-text at any time.

## 7. Post-rollout smoke checks

The full checklist lives in `docs/upgrade-rollout.md` (§ Verification). The
three fastest signals:

- an article page shows semantic (not just tag-based) related articles;
- `GET /api/health` with the `CRON_SECRET` bearer shows every check green;
- homepage "Trending this week" appears once ≥3 articles have recent views.
