-- Close the check-then-act race in the per-session chat rate limit.
--
-- The dashboard-managed check_chat_rate_limit() is a pure READ: it reports usage that
-- only moves when record_chat_usage() runs, and the route calls that at the END of the
-- SSE stream — 10-30s after admission. So N requests fired in parallel from one session
-- all observe the same pre-increment usage and all pass: ~100 concurrent POSTs sail
-- through a daily_max of 25. Concurrency, not session rotation, is the bypass here (the
-- per-IP backstop in 0009 is the control for rotation).
--
-- The fix is the shape 0009 already uses for chat_ip_usage: one statement that
-- increments and reports the new value — `insert … on conflict … do update
-- set requests = requests + 1 returning requests` — tested against the cap. Postgres
-- serialises concurrent upserts on the same primary key, so the Nth concurrent caller
-- reads N, never a stale pre-increment count.
--
-- Two deliberate differences from 0009:
--
--   * Keyed on auth.uid(), taken from the signed session JWT — NOT on an argument. That
--     is why anon/authenticated keep EXECUTE here, unlike check_chat_ip_rate_limit after
--     0018: an IP is caller-suppliable, so anyone with the public anon key could bill a
--     victim's quota, whereas a caller cannot forge someone else's auth.uid(). The route
--     must therefore call this with the visitor's COOKIE client; a service-role call sees
--     auth.uid() = NULL and is handled as "no session" below.
--
--   * Counts at ADMISSION, not on completion. A request that is subsequently refused
--     (429, or a downstream failure) has already been counted, exactly as in 0009. That
--     is the point: metering only completed streams is what left the window open.
--     record_chat_usage() still runs for token accounting; this counter is requests only.
--
-- Cost/benefit of the counters this returns: the caps live in the function body, not in
-- arguments, because anon can call it — a p_daily_max argument would just be a bypass.
-- Edit this file and re-apply to tune them.

create table if not exists public.chat_session_usage (
  user_id   uuid    not null,
  day       date    not null default ((now() at time zone 'utc')::date),
  requests  integer not null default 0,
  primary key (user_id, day)
);

alter table public.chat_session_usage enable row level security;
-- (intentionally no policies — as with chat_ip_usage, only the SECURITY DEFINER
--  function below, which runs as its owner, may touch this table)

-- No extra index on `day`: every read below filters user_id first, so the primary key's
-- leading column covers it. (Contrast article_view_daily in 0018, whose reads filter on
-- `day` alone and so needed one.)

-- Atomically bill the calling session one chat request and report whether it is still
-- inside the daily/weekly/monthly caps, together with the counters the route turns into
-- X-RateLimit-* headers (lib/chat/rate-limit.ts).
--
-- MUTATES despite the `check_` name — consistent with check_chat_ip_rate_limit (0009),
-- which also increments before testing.
--
-- Returns ZERO ROWS when there is no session to key on. The route's resolveLimits()
-- treats a rowless/unexpected result as "no decision" and fails open while logging
-- chat.rate_limit_fallback, so a mis-wired caller (e.g. one using the service-role
-- client, where auth.uid() is NULL) degrades visibly instead of billing every visitor
-- to a single NULL bucket.
create or replace function public.check_chat_session_rate_limit()
returns table (
  allowed       boolean,
  daily_used    integer,
  daily_max     integer,
  weekly_used   integer,
  weekly_max    integer,
  monthly_used  integer,
  monthly_max   integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid           uuid    := auth.uid();
  v_today         date    := (now() at time zone 'utc')::date;
  v_daily_max     constant integer := 25;
  v_weekly_max    constant integer := 100;
  v_monthly_max   constant integer := 300;
  v_daily         integer;
  v_weekly        integer;
  v_monthly       integer;
begin
  if v_uid is null then
    return; -- no session → no rows; the caller fails open and logs the fallback
  end if;

  -- The atomic bit. `returning requests` reports the post-increment value for THIS
  -- statement, so concurrent callers get 1, 2, 3, … and never a shared stale read.
  insert into public.chat_session_usage (user_id, day, requests)
  values (v_uid, v_today, 1)
  on conflict (user_id, day) do update set requests = public.chat_session_usage.requests + 1
  returning requests into v_daily;

  -- Rolling windows, N calendar days INCLUDING today: `>= today - (N - 1)`. Writing
  -- `> today - N` would be the same thing, but the explicit -(N-1) is what 0016 had to
  -- fix in get_trending_articles, so spell it out. Both sums include the row just
  -- incremented above.
  select coalesce(sum(requests), 0) into v_weekly
    from public.chat_session_usage
   where user_id = v_uid and day >= v_today - 6;

  select coalesce(sum(requests), 0) into v_monthly
    from public.chat_session_usage
   where user_id = v_uid and day >= v_today - 29;

  -- Self-prune, once per session per UTC day (requests = 1 means this statement
  -- inserted the day's row): keeps a session's history bounded to the monthly window
  -- plus slack. Nothing prunes rows for sessions that never return — the per-IP cap in
  -- 0009 bounds how fast those can be created; sweep the table from db-keepalive if it
  -- ever grows enough to matter.
  if v_daily = 1 then
    delete from public.chat_session_usage
     where user_id = v_uid and day < v_today - 60;
  end if;

  -- Post-increment counters, so `<=`: with a cap of 25 the 25th request is allowed and
  -- the 26th is not.
  return query select
    (v_daily <= v_daily_max and v_weekly <= v_weekly_max and v_monthly <= v_monthly_max),
    v_daily, v_daily_max, v_weekly, v_weekly_max, v_monthly, v_monthly_max;
end;
$$;

revoke execute on function public.check_chat_session_rate_limit() from public;
grant execute on function public.check_chat_session_rate_limit() to anon, authenticated;
