-- Make get_bulletin_subscribers' order a deterministic TOTAL order.
--
-- The bulletin send pages the recipient list two ways that both assume a stable order
-- across separate query executions: the >1000-row Range pagination in rpcAll, and the
-- offset-based resume that re-fetches the whole list each biweekly batch
-- (lib/newsletter/send.ts, whose comment states "Relies on the RPC having a deterministic
-- ORDER BY"). 0015 ordered by `ns.created_at asc` alone, which is NOT unique — subscribers
-- sharing a created_at (e.g. a bulk import inserted in one statement) can come back in a
-- different relative order on a later run, so one could be skipped or double-emailed at a
-- page/batch boundary. Add the unique unsubscribe_token as a tiebreaker for a total order.
--
-- Body is otherwise identical to 0015's function. `create or replace` preserves the 0015
-- grants (revoked from public/anon/authenticated, granted to service_role), re-stated below
-- to keep this migration self-contained and idempotent.
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
    order by ns.created_at asc, ns.unsubscribe_token asc;
end;
$$;

revoke execute on function public.get_bulletin_subscribers() from public, anon, authenticated;
grant execute on function public.get_bulletin_subscribers() to service_role;
