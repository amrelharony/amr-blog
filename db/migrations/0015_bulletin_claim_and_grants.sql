-- Bulletin pipeline repair + lockdown (July 2026 rollout follow-up). Applied
-- live via the Management API on 2026-07-05; recorded here so the repo stops
-- drifting from the dashboard for these pieces.
--
-- Three problems found while executing docs/upgrade-rollout.md:
--  1. claim_pending_bulletin() did not exist, yet it is the FIRST RPC
--     lib/newsletter/send.ts calls — every digest run threw before sending
--     anything.
--  2. idx_bulletin_in_progress did not exist, so the create-path concurrency
--     guard send.ts relies on (unique violation -> "another send in progress")
--     never actually guarded anything.
--  3. All bulletin RPCs were executable by anon/authenticated. They are
--     SECURITY DEFINER and get_bulletin_subscribers returns every confirmed
--     subscriber's email + unsubscribe token — a PII dump one PostgREST call
--     away from anyone holding the public anon key. send.ts now authenticates
--     with the service-role key, and EXECUTE is revoked below.
--
-- get_bulletin_subscribers' body is restated here verbatim from the live
-- (dashboard-managed) version PLUS the frequency filter required by 0013 —
-- from now on this file is its source of truth.

-- At most ONE row may be status='in_progress': create_bulletin_log inserts
-- with that status before dispatching the first batch.
create unique index if not exists idx_bulletin_in_progress
  on public.bulletin_log (status)
  where status = 'in_progress';

-- Atomically claim a resumable run: a 'pending' row with batches remaining,
-- or an 'in_progress' row stale for >2h (a crashed run that never flipped
-- back to pending — without reclaim it would block every future send).
-- Returns the shape send.ts expects; empty set when there is nothing to resume.
create or replace function public.claim_pending_bulletin()
returns table (id uuid, recipient_count integer, batch_remaining integer, articles_since timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.bulletin_log b
     -- Stamp sent_at as the claim heartbeat: without it a just-claimed run keeps
     -- its old sent_at and can instantly re-satisfy the >2h staleness predicate
     -- below, letting a concurrent call re-claim it and double-send the batch.
     set status = 'in_progress', sent_at = now()
   where b.id = (
     select b2.id
       from public.bulletin_log b2
      where (b2.status = 'pending' and b2.batch_remaining > 0)
         or (b2.status = 'in_progress' and b2.sent_at < now() - interval '2 hours')
      order by b2.sent_at asc
        for update skip locked
      limit 1
   )
  returning b.id, b.recipient_count, b.batch_remaining, b.articles_since;
end;
$$;

-- Digest recipient list. Excludes 'instant' subscribers (0013) so they are
-- not double-mailed, and keeps the deterministic ORDER BY that rpcAll's
-- Range-header pagination in lib/newsletter/send.ts depends on.
create or replace function public.get_bulletin_subscribers()
returns table (email text, unsubscribe_token uuid, job_title text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    select ns.email, ns.unsubscribe_token, ns.job_title
    from public.newsletter_subscribers ns
    where ns.confirmed = true and ns.unsubscribed_at is null
      and coalesce(ns.frequency, 'digest') = 'digest'
    order by ns.created_at asc;
end;
$$;

-- Lockdown: these run ONLY from lib/newsletter/send.ts with the service-role
-- key. subscribe_newsletter_v2 (public signup) and get_recent_bulletins
-- (admin dashboard metadata, no PII) intentionally keep their default grants.
revoke execute on function public.get_bulletin_subscribers() from public, anon, authenticated;
revoke execute on function public.claim_pending_bulletin() from public, anon, authenticated;
revoke execute on function public.get_last_bulletin(text) from public, anon, authenticated;
revoke execute on function public.get_bulletin_articles(timestamptz) from public, anon, authenticated;
revoke execute on function public.create_bulletin_log(integer, integer, integer, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.update_bulletin_log(uuid, integer, text) from public, anon, authenticated;

grant execute on function public.get_bulletin_subscribers() to service_role;
grant execute on function public.claim_pending_bulletin() to service_role;
grant execute on function public.get_last_bulletin(text) to service_role;
grant execute on function public.get_bulletin_articles(timestamptz) to service_role;
grant execute on function public.create_bulletin_log(integer, integer, integer, timestamptz, text) to service_role;
grant execute on function public.update_bulletin_log(uuid, integer, text) to service_role;
