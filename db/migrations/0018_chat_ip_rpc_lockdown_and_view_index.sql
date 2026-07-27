-- Two independent hardening fixes found in the July 2026 bug sweep.
--
-- ============================================================================
-- 1. check_chat_ip_rate_limit: stop anon from spending someone else's quota
-- ============================================================================
-- 0009 granted EXECUTE to anon/authenticated. The function is SECURITY DEFINER and
-- takes the IP as an ARGUMENT — the database cannot see the real client address —
-- so anyone holding the (public by design) anon key could call it directly against
-- the REST endpoint 200 times with a victim's IP and lock that IP out of /api/chat
-- for the rest of the UTC day. The same call with arbitrary strings also wrote
-- unbounded rows into chat_ip_usage, which nothing prunes.
--
-- Only our server knows the true client IP (Vercel's x-real-ip), so only our server
-- should be able to bill it: app/api/chat/route.ts now calls this with the
-- service-role client. Revoke the anon/authenticated grants accordingly.
--
-- Ordering is safe in both directions: the deployed route already uses service_role
-- (which bypasses these grants), and an older deploy that still uses the session
-- client simply gets an error the route logs and fails open on, exactly as it does
-- when the RPC is missing entirely.
revoke execute on function public.check_chat_ip_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.check_chat_ip_rate_limit(text, integer) to service_role;

-- Defence in depth: bound the key length so a caller that DOES reach this (e.g. a
-- future service-role path with a malformed header) can't write oversized rows.
-- An over-long value is treated like a missing IP: fail open, don't block chat.
create or replace function public.check_chat_ip_rate_limit(p_ip text, p_max integer default 200)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_ip is null or btrim(p_ip) = '' or length(btrim(p_ip)) > 45 then
    return true; -- no usable IP to key on (45 = longest IPv4-mapped IPv6 form) → don't block
  end if;
  insert into public.chat_ip_usage (ip, day, requests)
  values (btrim(p_ip), (now() at time zone 'utc')::date, 1)
  on conflict (ip, day) do update set requests = public.chat_ip_usage.requests + 1
  returning requests into v_count;
  return v_count <= greatest(p_max, 1);
end;
$$;

-- ============================================================================
-- 2. article_view_daily: index the column every read filters on
-- ============================================================================
-- 0012 gave the table only its (article_id, day) primary key. `day` is the SECOND
-- key column, so it cannot serve as a leading key — yet all three hot paths filter
-- on `day` ALONE:
--   * get_trending_articles  (0016)                       -- where v.day >= …
--   * fetchViewSeries        (lib/queries/admin-analytics) -- .gte("day", cutoff)
--   * the 60-day prune       (app/api/db-keepalive)        -- day=lt.<cutoff>
-- At ~2,900 articles x 60 days retention that is a full scan + aggregate on every
-- ISR regeneration of the homepage, article pages and /archive (all render
-- TrendingStrip, revalidate = 300).
create index if not exists idx_article_view_daily_day
  on public.article_view_daily (day);
