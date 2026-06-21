-- Phase 2 (newsletter console): admin-guarded read of recent bulletin sends.
-- The send pipeline already writes public.bulletin_log on every run; this exposes
-- the history to the new /admin/newsletter page (the send itself is triggered by
-- a session-authed POST to /api/admin/newsletter that reuses the extracted
-- runBulletinSend() in lib/newsletter/send.ts).

create or replace function public.get_recent_bulletins(p_limit int default 50)
returns table (id uuid, sent_at timestamptz, article_count int, recipient_count int,
               batch_remaining int, articles_since timestamptz, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  return query
    select bl.id, bl.sent_at, bl.article_count, bl.recipient_count,
           bl.batch_remaining, bl.articles_since, bl.status
    from public.bulletin_log bl
    order by bl.sent_at desc
    limit greatest(p_limit, 1);
end;
$$;
