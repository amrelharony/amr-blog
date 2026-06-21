-- Phase 3: lightweight admin activity log (accountability + post-incident
-- recovery alongside version history). Single-admin, so no actor column needed.
-- Writes happen from the admin client under the admin session, so a plain
-- admin-gated RLS policy (no SECURITY DEFINER) is enough.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text,
  entity_id uuid,
  summary text,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;

drop policy if exists "Admin manages activity log" on public.activity_log;
create policy "Admin manages activity log" on public.activity_log
  for all
  using ((auth.uid())::text = '82dd079f-de7b-477b-84eb-6d34d9eded05')
  with check ((auth.uid())::text = '82dd079f-de7b-477b-84eb-6d34d9eded05');

create index if not exists idx_activity_log_created on public.activity_log (created_at desc);
