-- Per-IP backstop for the chat endpoint. The existing check_chat_rate_limit() is
-- keyed on auth.uid(), but anonymous sessions are mintable for free, so an attacker
-- can rotate sessions to bypass it and run up paid OpenClaw spend. This caps requests
-- per client IP per UTC day as an aggregate ceiling that survives session rotation.
--
-- The table is RLS-locked with NO policies, so only the SECURITY DEFINER RPC (which
-- runs as its owner) can touch it; anon/authenticated only get EXECUTE on the RPC.
-- NOTE: a global daily ceiling on the OpenClaw key itself (set on the OpenClaw VPS)
-- is the complementary control for a distributed (many-IP) attacker.

create table if not exists public.chat_ip_usage (
  ip        text    not null,
  day       date    not null default ((now() at time zone 'utc')::date),
  requests  integer not null default 0,
  primary key (ip, day)
);

alter table public.chat_ip_usage enable row level security;
-- (intentionally no policies — direct anon/authenticated access is denied)

-- Atomically increment the caller-IP's daily counter and report whether it is still
-- within p_max. Fails open at the caller (an empty IP returns true here) so a missing
-- proxy header never hard-blocks chat.
create or replace function public.check_chat_ip_rate_limit(p_ip text, p_max integer default 200)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_ip is null or btrim(p_ip) = '' then
    return true; -- no IP to key on → don't block
  end if;
  insert into public.chat_ip_usage (ip, day, requests)
  values (btrim(p_ip), (now() at time zone 'utc')::date, 1)
  on conflict (ip, day) do update set requests = public.chat_ip_usage.requests + 1
  returning requests into v_count;
  return v_count <= greatest(p_max, 1);
end;
$$;

grant execute on function public.check_chat_ip_rate_limit(text, integer) to anon, authenticated;
