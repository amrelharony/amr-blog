-- Phase 3 (bulk ops): categorize-by-filter RPC. Selection-based bulk actions
-- (.in('id', ids)) cover the current page, but re-categorizing the ~1900
-- uncategorized LinkedIn imports can't enumerate that many ids in the browser
-- (PostgREST 1000-row cap). This updates by predicate, server-side, in one call.
-- Admin-guarded (see db/migrations/0002 for the IS DISTINCT FROM rationale).

create or replace function public.bulk_set_category(p_from text, p_to text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  -- nullif so an empty p_to canonicalizes to NULL (uncategorized) rather than ''
  -- — '' would be a third invisible state matching neither IS NULL nor any label.
  if p_from is null or p_from = '' then
    update public.longform_articles set category = nullif(p_to, '') where category is null;
  else
    update public.longform_articles set category = nullif(p_to, '') where category = p_from;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
