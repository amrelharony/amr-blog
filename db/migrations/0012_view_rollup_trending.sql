-- Phase 6 (trending / time-windowed popularity). Apply via the Supabase
-- dashboard SQL editor.
--
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
