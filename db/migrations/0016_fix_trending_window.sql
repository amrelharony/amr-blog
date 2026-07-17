-- Fix the trending window off-by-one.
--
-- 0012 filtered `v.day >= today::date - least(greatest(p_days,1),60)`. Subtracting an
-- integer from a date and then comparing with `>=` spans p_days + 1 calendar days: for
-- the default p_days=7 ("Trending this week") that is 8 UTC days, and at the ceiling it
-- lets rows exactly 60 days old back in. The admin view-series chart (fetchViewSeries)
-- uses `end - (days - 1)` and returns exactly `days` days, so the two "recent views"
-- surfaces disagreed for the same nominal window. Subtract (N-1) so the range is exactly
-- N days (today plus the N-1 prior days), matching the chart.
--
-- Body is otherwise identical to 0012's get_trending_articles; only the WHERE arithmetic
-- changes. `create or replace` preserves the existing EXECUTE grants.
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
  where v.day >= (now() at time zone 'utc')::date - (least(greatest(p_days, 1), 60) - 1)
  group by a.id
  order by recent_views desc, a.views desc
  limit least(greatest(p_count, 1), 12);
$$;
