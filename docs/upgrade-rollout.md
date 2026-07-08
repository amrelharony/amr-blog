# Ultra-Refined Upgrade — Rollout Runbook (July 2026)

Ten independently-shippable phases landed in this branch. **All code is
fail-open**: deploying before the manual steps below is safe — each feature
simply stays dormant until its schema/config exists.

## What shipped (no manual steps needed)

| Phase | Feature | Where |
|---|---|---|
| 1 | Copy-link + native share, visible breadcrumbs, skip-to-content + TOC a11y, "Read next" card, "Key takeaways" relabel | article/category/home/tag pages |
| 2 | Server-side syntax highlighting (highlight.js, 15 languages), copy-code buttons, language badges, print stylesheet | markdown pipeline |
| 3 | `/archive` (+ per-year), `/tags`, `/series` (+ per-series), full `/search` page with filters & keyboard nav; nav + palette + sitemap wiring | new routes |
| 7 | `/library` — saves, highlights, history + JSON export/import | new route |
| 8 | PWA: manifest, service worker, `/offline`, offline copies of saved articles | `public/sw.js`, `app/manifest.ts` |
| 10 | Full-content RSS (`content:encoded`), JSON Feed (`/feed.json`), per-tag RSS (`/feed/tag/<tag>`) | feed routes |

## Manual steps, in order

### 0. Probe what's already live (read-only)

Before touching the dashboard, see which steps are actually applied:

```
node scripts/rollout/verify-rollout.mjs
```

It issues only GETs / `stable` RPC probes (never mutates) and prints a
PASS/FAIL/SKIP/MANUAL line per migration, plus embed-function reachability,
backfill counts, and the subscriber frequency split. It detects each migration
by a schema marker; it CANNOT read function bodies, so 0015's
`claim_pending_bulletin` and `get_bulletin_subscribers` show `MANUAL`. As of
2026-07-08, **0011–0015 are all live** — 0011–0014 + embed function + backfills
were confirmed via the probe, and 0015's `claim_pending_bulletin` sent_at fix was
applied to prod on 2026-07-08 (the repo file had also been missing that stamp —
now corrected). Rollout is complete; re-run the probe after any future schema
change.

### 1. Apply migrations in the Supabase dashboard (SQL editor)

Run in numeric order; each is idempotent (`if not exists` / `create or replace`):

1. `db/migrations/0011_pgvector_embeddings.sql` — pgvector, embedding column, match RPCs *(Phase 4)*
2. `db/migrations/0012_view_rollup_trending.sql` — view rollup trigger + `get_trending_articles` *(Phase 6)*
3. `db/migrations/0013_instant_notifications.sql` — subscriber `frequency`, `subscribe_newsletter_v2`, notification log *(Phase 9)*
   - ⚠ Also edit the live `get_bulletin_subscribers` body (dashboard-managed):
     add `and coalesce(s.frequency, 'digest') = 'digest'` to its WHERE clause
     so instant subscribers aren't double-mailed by the digest.
4. `db/migrations/0014_comment_reply_notifications.sql` — comment subscriptions + `post_article_comment` with `p_notify_email` *(Phase 10)*
5. `db/migrations/0015_bulletin_claim_and_grants.sql` — `claim_pending_bulletin`
   (stamps `sent_at` on claim), the `idx_bulletin_in_progress` concurrency
   guard, and the anon/authenticated EXECUTE revokes on the bulletin RPCs.
   - ✅ Applied to prod 2026-07-08: the corrected `claim_pending_bulletin` (with
     `sent_at = now()` on claim) is live; EXECUTE remains `service_role`-only.
     The repo file previously shipped WITHOUT the sent_at stamp — that one-line
     bug is now fixed in-file too. If re-applying to a fresh environment, this
     file is `create or replace` + idempotent grants, safe to run whole.

### 2. Deploy the embeddings Edge Function (Phase 4)

Source: `supabase/functions/embed/index.ts` (built-in gte-small model, no external provider).

```
supabase functions deploy embed --no-verify-jwt
supabase secrets set EMBED_FN_SECRET=<random long string>
```

Then add to Vercel env (and `.env.local`):

```
EMBED_FN_URL=https://<project-ref>.supabase.co/functions/v1/embed
EMBED_FN_SECRET=<same random string>
```

### 3. Backfill scripts (run locally, resumable, paced)

```
# Embeddings for the ~2,905-article corpus (~30–60 min at polite pacing)
node scripts/backfill-embeddings.mjs --limit 20   # spot-check first
node scripts/backfill-embeddings.mjs              # full run

# AI TL;DRs for imported LinkedIn articles (via OpenClaw; ~20/min pacing)
node scripts/backfill-tldr.mjs --limit 20         # REVIEW these 20 before continuing
node scripts/backfill-tldr.mjs --limit 300        # repeat until done
```

Both filter on missing values, so re-running resumes automatically.

### 4. Optional switches

- `SEARCH_HYBRID=1` (Vercel env) — turns on the semantic arm of `/api/search`
  (needs step 2 + 3 embeddings). Off = pure full-text, exactly as before.
- GitHub Actions: the hourly LinkedIn workflow now also curls
  `/api/db-keepalive` for the scheduled-publish + notification sweep — it uses
  the existing `CRON_SECRET` secret; add it to the repo secrets if not present.
- PWA icons `public/icon-192.png` / `icon-512.png` were generated from the
  48px `app/icon.png` — replace with high-res art when convenient.

## Verification checklist (post-deploy)

- Run `node scripts/rollout/verify-rollout.mjs` — 0011–0014 + embed-function
  checks PASS, backfills report "done", and only the two 0015/​bulletin
  function-body items show MANUAL (re-apply 0015 and eyeball those bodies).
- `get_bulletin_subscribers` frequency filter is live: after 0013, a subscriber with `frequency='instant'` must NOT appear in a digest preview (admin newsletter console → Preview shows only digest subscribers).
- Article page: breadcrumbs render; copy-link button copies; TL;DR card says "Key takeaways"; Read-next card appears; code blocks are highlighted with a copy button.
- `/archive`, `/tags`, `/series`, `/search`, `/library` all load; command palette (⌘K) lists them.
- After migration 0011 + backfill: related articles change from recency/tag-based to semantic; `select count(*) from longform_articles where embedding is not null` grows.
- After migration 0012: browse an article, then `select * from article_view_daily order by day desc limit 5` shows the increment; homepage "Trending this week" appears once ≥3 articles have recent views.
- After migration 0013: subscribe with "Every new article", confirm, publish a test article → exactly one email + one `article_notification_log` row; re-running the sweep sends nothing.
- After migration 0014: comment with the email field filled, reply from another browser → exactly one reply notification; unsubscribe link works.
- Feeds: `/feed.xml` items contain `<content:encoded>`; `/feed.json` validates at validator.jsonfeed.org; `/feed/tag/fintech` returns items.
- PWA: DevTools → Application shows the manifest + registered SW; offline mode serves saved articles and `/offline` for everything else; `/admin` and `/api/chat` bypass the SW.
