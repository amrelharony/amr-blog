-- Phase 9 (per-article instant email notifications). Apply via the Supabase
-- dashboard SQL editor.
--
-- Additions:
--  * newsletter_subscribers.frequency — 'digest' (default, today's behavior)
--    or 'instant' (an email per published article).
--  * subscribe_newsletter_v2 — thin wrapper over the LIVE dashboard-managed
--    subscribe_newsletter (body untouched) that also records the frequency
--    choice. Wrapping instead of porting avoids re-stating a body that lives
--    only in the dashboard. Frequency is applied ONLY on a fresh/unconfirmed
--    signup (v1 returned a token), so a stranger re-submitting an existing
--    confirmed address cannot flip someone else's preference.
--  * article_notification_log — one row per article, ever. The UNIQUE
--    article_id is the concurrency claim: whichever trigger (agent ingest,
--    admin publish, scheduled-publish sweep) inserts first owns the send;
--    the rest see a conflict and skip. batch_remaining enables resume,
--    mirroring bulletin_log (see lib/newsletter/send.ts).
--
-- ⚠ MANUAL DASHBOARD EDIT REQUIRED (body lives in the dashboard, not here):
--    get_bulletin_subscribers must EXCLUDE instant subscribers so they are
--    not double-mailed by the biweekly digest. Add to its WHERE clause:
--        and coalesce(s.frequency, 'digest') = 'digest'

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
