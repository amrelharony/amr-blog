-- ============================================================================
-- Ultra-Refined Upgrade (July 2026) — consolidated rollout SQL
--
-- Run this WHOLE file once in the Supabase dashboard SQL editor. It is fully
-- idempotent (if not exists / or replace / drop-if-exists) — re-running is
-- safe and re-audits the one manual step at the end.
--
-- Source of truth: db/migrations/0011–0014 (copied verbatim below, in order).
-- Companion steps (edge function deploy, env vars, backfills) are in
-- scripts/rollout/commands.md; verify afterwards with
--   node scripts/rollout/verify-rollout.mjs
-- ============================================================================


-- ===== 1/5: 0011_pgvector_embeddings (Phase 4 — semantic discovery) ========
-- Also deploy the companion Edge Function (supabase/functions/embed) and set
-- its EMBED_FN_SECRET — the Next app reads EMBED_FN_URL / EMBED_FN_SECRET.
--
--  * embedding — 384-dim gte-small vector of title+tldr+excerpt+body-head
--    (built by lib/embeddings.ts buildEmbeddingInput; dimension is locked to
--    EMBEDDING_DIMS there — change both together or not at all).
--  * embedded_at — audit stamp; the backfill filters on `embedding is null`,
--    so a re-run resumes for free.
--  * HNSW index — cosine ops; builds incrementally, no maintenance_work_mem
--    ceremony needed at ~3k rows.
--
-- The match functions are SECURITY INVOKER (anon-callable reads of published
-- rows only — the admin-guard rule applies to DEFINER mutations, not these) and
-- never accept or return raw vectors from/to the client:
--  * match_related_articles looks the source vector up server-side by id.
--  * match_articles takes a vector, but it is only called server-side by
--    /api/search (query-time embedding); RLS still bounds what rows it can see.

create extension if not exists vector;

alter table public.longform_articles
  add column if not exists embedding vector(384),
  add column if not exists embedded_at timestamptz;

create index if not exists idx_longform_articles_embedding
  on public.longform_articles
  using hnsw (embedding vector_cosine_ops);

-- Articles most similar to a given article (excluding it), published only.
-- Returns the CARD_COLUMNS shape used by lib/queries/articles.ts.
create or replace function public.match_related_articles(p_article_id uuid, p_count int default 5)
returns table (
  id uuid, title text, slug text, excerpt text, created_at timestamptz,
  tags text[], views integer, reactions jsonb, cover_image text,
  series_name text, category text
)
language sql
stable
set search_path = public, pg_temp
as $$
  select a.id, a.title, a.slug, a.excerpt, a.created_at,
         a.tags, a.views, a.reactions, a.cover_image, a.series_name, a.category
  from public.longform_articles a
  join public.longform_articles src on src.id = p_article_id
  where src.embedding is not null
    and a.published = true
    and a.embedding is not null
    and a.id <> p_article_id
  order by a.embedding <=> src.embedding
  limit least(greatest(p_count, 1), 20);
$$;

-- Articles most similar to an arbitrary query embedding (hybrid search arm).
create or replace function public.match_articles(p_embedding vector(384), p_count int default 12)
returns table (
  id uuid, title text, slug text, excerpt text, created_at timestamptz,
  tags text[], views integer, reactions jsonb, cover_image text,
  series_name text, category text
)
language sql
stable
set search_path = public, pg_temp
as $$
  select a.id, a.title, a.slug, a.excerpt, a.created_at,
         a.tags, a.views, a.reactions, a.cover_image, a.series_name, a.category
  from public.longform_articles a
  where a.published = true
    and a.embedding is not null
  order by a.embedding <=> p_embedding
  limit least(greatest(p_count, 1), 50);
$$;


-- ===== 2/5: 0012_view_rollup_trending (Phase 6 — trending) =================
-- Design: a per-(article, UTC-day) rollup fed by a TRIGGER on
-- longform_articles.views — deliberately NOT a port of the live
-- increment_article_views() RPC (whose body is dashboard-managed): any code
-- path that bumps `views` feeds the rollup, and the RPC keeps working
-- untouched. Counts only — no user identifiers, no IPs (privacy-preserving).
--
-- Retention: /api/db-keepalive prunes rows older than 60 days with the
-- service-role key (the table has RLS enabled and NO policies, so only the
-- service role and the definer functions below can touch it).

create table if not exists public.article_view_daily (
  article_id uuid not null references public.longform_articles(id) on delete cascade,
  day        date not null default ((now() at time zone 'utc')::date),
  views      integer not null default 0,
  primary key (article_id, day)
);

alter table public.article_view_daily enable row level security;
-- (intentionally no policies — reads go through get_trending_articles below)

-- SECURITY DEFINER so the rollup insert bypasses the no-policy RLS regardless
-- of which role performed the outer views update. Not directly callable as a
-- mutation by clients (it's a trigger function), so the admin-guard pattern
-- for anon-callable DEFINER RPCs does not apply.
create or replace function public.bump_view_rollup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.views > coalesce(old.views, 0) then
    insert into public.article_view_daily (article_id, day, views)
    values (new.id, (now() at time zone 'utc')::date, new.views - coalesce(old.views, 0))
    on conflict (article_id, day)
    do update set views = article_view_daily.views + excluded.views;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_article_view_rollup on public.longform_articles;
create trigger trg_article_view_rollup
  after update of views on public.longform_articles
  for each row
  execute function public.bump_view_rollup();

-- Read-side: top published articles by views in the last p_days. SECURITY
-- DEFINER only to read the policy-less rollup table; it exposes nothing but
-- aggregate counts of PUBLISHED articles (no PII, no mutation), which is why
-- it needs no admin guard. Bounds: p_days ≤ 60 (retention window), p_count ≤ 12.
create or replace function public.get_trending_articles(p_days int default 7, p_count int default 5)
returns table (
  id uuid, title text, slug text, excerpt text, created_at timestamptz,
  tags text[], views integer, reactions jsonb, cover_image text,
  series_name text, category text, recent_views bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.title, a.slug, a.excerpt, a.created_at,
         a.tags, a.views, a.reactions, a.cover_image, a.series_name, a.category,
         sum(v.views)::bigint as recent_views
  from public.article_view_daily v
  join public.longform_articles a on a.id = v.article_id and a.published = true
  where v.day >= (now() at time zone 'utc')::date - least(greatest(p_days, 1), 60)
  group by a.id
  order by recent_views desc, a.views desc
  limit least(greatest(p_count, 1), 12);
$$;


-- ===== 3/5: 0013_instant_notifications (Phase 9 — per-article emails) ======
-- Additions:
--  * newsletter_subscribers.frequency — 'digest' (default, today's behavior)
--    or 'instant' (an email per published article).
--  * subscribe_newsletter_v2 — thin wrapper over the LIVE dashboard-managed
--    subscribe_newsletter (body untouched) that also records the frequency
--    choice. Frequency is applied ONLY on a fresh/unconfirmed signup (v1
--    returned a token), so a stranger re-submitting an existing confirmed
--    address cannot flip someone else's preference.
--  * article_notification_log — one row per article, ever. The UNIQUE
--    article_id is the concurrency claim; batch_remaining enables resume,
--    mirroring bulletin_log (see lib/newsletter/send.ts).
--
-- ⚠ The companion MANUAL edit to get_bulletin_subscribers is audited by
--   section 5/5 at the end of this file.

alter table public.newsletter_subscribers
  add column if not exists frequency text not null default 'digest'
  check (frequency in ('digest', 'instant'));

create or replace function public.subscribe_newsletter_v2(
  p_email text,
  p_job_title text,
  p_phone text default null,
  p_frequency text default 'digest'
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
  v_freq text := case when p_frequency in ('digest', 'instant') then p_frequency else 'digest' end;
begin
  -- Delegate ALL validation/rate-limiting/upsert semantics to the live v1.
  v_token := public.subscribe_newsletter(p_email, p_job_title, p_phone)::text;
  if v_token is not null then
    update public.newsletter_subscribers
       set frequency = v_freq
     where lower(email) = lower(btrim(p_email));
  end if;
  return v_token;
end;
$$;

create table if not exists public.article_notification_log (
  id              uuid primary key default gen_random_uuid(),
  article_id      uuid not null unique references public.longform_articles(id) on delete cascade,
  status          text not null default 'in_progress', -- in_progress | pending | sent
  recipient_count integer not null default 0,
  batch_remaining integer not null default 0,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

alter table public.article_notification_log enable row level security;
-- (intentionally no policies — only the service role touches this table)


-- ===== 4/5: 0014_comment_reply_notifications (Phase 10) ====================
-- Design constraints:
--  * Emails must NEVER sit on the publicly-readable article_comments row —
--    opt-in emails live in comment_subscriptions: RLS enabled, NO policies
--    (service-role only).
--  * One notification per reply, ever: comment_reply_notification_log's
--    primary key is the claim (insert-first wins).
--  * post_article_comment gains optional p_notify_email. The 4-arg version
--    is DROPPED first — two overloads would be ambiguous to PostgREST when
--    called with named params. Body is the 0007 version verbatim, plus the
--    email validation + subscription insert.

create table if not exists public.comment_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  comment_id      uuid not null unique references public.article_comments(id) on delete cascade,
  email           text not null,
  token           uuid not null default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  unsubscribed_at timestamptz
);

create index if not exists idx_comment_subscriptions_token on public.comment_subscriptions (token);

alter table public.comment_subscriptions enable row level security;
-- (intentionally no policies — only the service role reads/writes emails)

create table if not exists public.comment_reply_notification_log (
  reply_comment_id uuid primary key references public.article_comments(id) on delete cascade,
  created_at       timestamptz not null default now()
);

alter table public.comment_reply_notification_log enable row level security;
-- (intentionally no policies — service-role only)

drop function if exists public.post_article_comment(uuid, uuid, text, text);

create or replace function public.post_article_comment(
  p_article_id uuid, p_parent_id uuid, p_author text, p_content text,
  p_notify_email text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin constant text := '82dd079f-de7b-477b-84eb-6d34d9eded05';
  v_uid uuid := auth.uid();
  v_recent int;
  v_id uuid;
  v_content text := btrim(p_content);
  v_email text := lower(btrim(coalesce(p_notify_email, '')));
begin
  if v_uid is null then
    raise exception 'must be signed in to comment';
  end if;
  if length(v_content) < 1 or length(v_content) > 4000 then
    raise exception 'comment must be 1 to 4000 characters';
  end if;
  -- notify email is optional; when present it must look like one address
  if v_email <> '' and (length(v_email) > 254 or v_email !~ '^[^@[:space:]]{1,64}@[^@[:space:]]{1,190}\.[a-z]{2,24}$') then
    raise exception 'invalid notification email';
  end if;
  -- only published articles accept comments (drafts never render publicly)
  if not exists (select 1 from public.longform_articles where id = p_article_id and published) then
    raise exception 'article not available for comments';
  end if;
  -- a reply's parent must be a real, STILL-APPROVED comment on the SAME article, so a
  -- reply can't be attached to a thread the admin has hidden (pending/spam).
  if p_parent_id is not null and not exists (
    select 1 from public.article_comments
    where id = p_parent_id and article_id = p_article_id and status = 'approved'
  ) then
    raise exception 'invalid parent comment';
  end if;
  -- the owner's display name is reserved (badge is author_id-driven, but block the
  -- name too so plain-text impersonation of the owner is impossible)
  if (v_uid)::text is distinct from v_admin
     and lower(coalesce(btrim(p_author), '')) = 'amr elharony' then
    raise exception 'that name is reserved';
  end if;
  -- max 5 comments per author per 10 minutes
  select count(*) into v_recent
  from public.article_comments
  where author_id = v_uid and created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'rate limit: too many comments, please slow down';
  end if;
  insert into public.article_comments (article_id, parent_id, author_name, content, author_id, status)
  values (p_article_id, p_parent_id,
          coalesce(nullif(btrim(p_author), ''), 'Anonymous'), v_content, v_uid, 'approved')
  returning id into v_id;
  -- store the opt-in inside this DEFINER body so the email never transits an
  -- anon-writable table
  if v_email <> '' then
    insert into public.comment_subscriptions (comment_id, email)
    values (v_id, v_email)
    on conflict (comment_id) do nothing;
  end if;
  return v_id;
end;
$$;


-- ===== 5/5: MANUAL EDIT + self-audit — get_bulletin_subscribers ============
-- The body of get_bulletin_subscribers lives ONLY in the dashboard (like all
-- base RLS/RPC bodies in this project), so this file cannot CREATE OR REPLACE
-- it. You must edit it by hand, ONCE, in Database → Functions:
--
--     Add to its WHERE clause:
--         and coalesce(s.frequency, 'digest') = 'digest'
--
-- Without the edit, 'instant' subscribers are ALSO mailed by the biweekly
-- digest (double-mailed). The block below audits the live body on every run
-- of this file and raises a WARNING while the edit is missing.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_bulletin_subscribers'
  limit 1;

  if v_def is null then
    raise warning 'get_bulletin_subscribers() not found — newsletter schema missing?';
  elsif v_def !~ 'frequency' then
    raise warning e'get_bulletin_subscribers() does NOT filter on frequency yet.\n'
      'Instant subscribers WILL be double-mailed by the digest until you add\n'
      '    and coalesce(s.frequency, ''digest'') = ''digest''\n'
      'to its WHERE clause (Database -> Functions -> get_bulletin_subscribers).';
  else
    raise notice 'get_bulletin_subscribers() frequency filter present — OK';
  end if;
end $$;
