# Backlog — deferred features & gaps

Prioritized list from the July 2026 gap audit. Items here were intentionally
scoped OUT of the reliability/security/observability remediation (see
`docs/upgrade-rollout.md` and the git history around that work). Grouped by
theme; roughly high → low within each.

## Admin observability pages
The pipelines now log to stdout, but there's no in-app view of them.
- **Notification log viewer** — surface `article_notification_log` (instant) and
  `comment_reply_notification_log` (replies): status, recipient_count,
  batch_remaining, sent_at; a manual "retry sweep" button. Pairs naturally with
  the reliability fixes already shipped in `lib/newsletter/notify.ts`.
- **Chat usage & limits** — read `chat_ip_usage`: request volume, top IPs,
  currently-blocked IPs; a lever to adjust the per-IP ceiling.
- **LinkedIn publish history** — what posted / failed / is queued, from the
  `linkedin_posted` flags on `longform_articles` and `microblog` (today this is
  SQL-only).
- **Embeddings status** — per-article embedded/not, a re-index button (the
  `/api/admin/embed` route already exists for single articles).

## Newsletter & subscribers
- **Per-run bulletin detail** — which articles a given `bulletin_log` run
  included, recipient/bounce counts, and a way to resume/pause a batch.
- **Test send** — send the next digest to a single admin address before the
  real run.
- **Subscriber bulk actions + frequency audit** — bulk unsubscribe/delete;
  breakdown of digest vs instant (`frequency`) subscribers.

## Editor workflow
- **Edit scheduled posts in place** — today you must unschedule → edit →
  reschedule.
- **Archive / soft-delete** — currently only hard delete exists; add an archived
  state (needs a migration).
- **Version diff view** — `article_versions` snapshots exist; add a
  before/after diff and one-click revert.
- **Poll analytics** — vote counts per option on `microblog` polls.

## Platform / hardening
- **CSP header** — `next.config.ts` deliberately omits Content-Security-Policy
  pending a strategy (inline styles/scripts inventory first). Biggest remaining
  header gap.
- **Error-aggregation service** — logs currently go to Vercel stdout only
  (`lib/log.ts` `logEvent`). A Sentry-class sink would add alerting + history;
  deliberately not added in the observability pass (stdout is greppable for now).
- **Activity-log retention** — `activity_log` grows unbounded; add a prune
  (mirror the 60-day `article_view_daily` prune in `/api/db-keepalive`).
- **Per-recipient delivery records** — would let the notification reclaim resume
  without re-sending a whole batch (the current accepted trade-off; see the
  `resolveClaim` comments in `lib/newsletter/notify.ts`).
