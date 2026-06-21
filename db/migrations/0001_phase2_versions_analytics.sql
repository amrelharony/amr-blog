-- Phase 2 (admin upgrade): version-history read RPCs + correct analytics aggregates.
--
-- The Supabase schema is managed in the dashboard (no in-repo migration history
-- existed before this). This file records the SQL applied for Phase 2 so the
-- changes are reviewable and reproducible.
--
-- SECURITY: every site visitor holds an anonymous Supabase auth session
-- (lib/supabase/anon.ts), so the `authenticated` role cannot distinguish the
-- admin. These RPCs are therefore SECURITY DEFINER *with an internal
-- auth.uid() = ADMIN_UUID guard* — safe even if EXECUTE is granted to PUBLIC.
-- (The pre-existing admin RPCs save_article_version/delete_article_comment are
-- SECURITY DEFINER with NO internal guard; consider hardening them similarly.)

-- ---------------------------------------------------------------------------
-- Version history (reads over the already-populated article_versions table)
-- ---------------------------------------------------------------------------

create or replace function public.list_article_versions(p_article_id uuid)
returns table (id uuid, version_number int, created_at timestamptz, title text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- IS DISTINCT FROM (not <>) so a NULL auth.uid() — i.e. a raw anon-key call
  -- with no user session — is also rejected (NULL <> x is NULL, which is falsy).
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  return query
    select v.id, v.version_number, v.created_at, v.title
    from public.article_versions v
    where v.article_id = p_article_id
    order by v.version_number desc;
end;
$$;

create or replace function public.get_article_version(p_version_id uuid)
returns table (id uuid, article_id uuid, version_number int, title text,
               content text, excerpt text, tags text[], created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- IS DISTINCT FROM (not <>) so a NULL auth.uid() — i.e. a raw anon-key call
  -- with no user session — is also rejected (NULL <> x is NULL, which is falsy).
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  return query
    select v.id, v.article_id, v.version_number, v.title, v.content, v.excerpt,
           v.tags, v.created_at
    from public.article_versions v
    where v.id = p_version_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics — true site-wide totals (the page previously summed only top-20)
-- ---------------------------------------------------------------------------

create or replace function public.get_content_totals()
returns table (total_views bigint, total_reactions bigint,
               published_count bigint, draft_count bigint,
               scheduled_count bigint, total_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- IS DISTINCT FROM (not <>) so a NULL auth.uid() — i.e. a raw anon-key call
  -- with no user session — is also rejected (NULL <> x is NULL, which is falsy).
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  return query
    select
      coalesce(sum(a.views), 0)::bigint,
      coalesce(sum(rx.s), 0)::bigint,
      count(*) filter (where a.published)::bigint,
      count(*) filter (where not a.published and a.scheduled_at is null)::bigint,
      count(*) filter (where not a.published and a.scheduled_at is not null)::bigint,
      count(*)::bigint
    from public.longform_articles a
    left join lateral (
      -- sum the numeric values of the reactions jsonb object for this row
      select coalesce(sum((e.value)::bigint), 0) as s
      from jsonb_each_text(coalesce(a.reactions, '{}'::jsonb)) as e(key, value)
      where e.value ~ '^[0-9]+$'
    ) rx on true;
end;
$$;

-- Reading-completion engagement over the populated-but-unused reading_history.
create or replace function public.get_reading_engagement()
returns table (reads bigint, readers bigint, avg_progress real,
               avg_time_spent real, completed_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- IS DISTINCT FROM (not <>) so a NULL auth.uid() — i.e. a raw anon-key call
  -- with no user session — is also rejected (NULL <> x is NULL, which is falsy).
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  return query
    select count(*)::bigint,
           count(distinct r.user_id)::bigint,
           avg(r.progress)::real,
           avg(r.time_spent)::real,
           count(*) filter (where r.completed)::bigint
    from public.reading_history r;
end;
$$;

-- Weekly subscriber growth + churn for the last p_weeks weeks.
create or replace function public.get_subscriber_growth(p_weeks int default 12)
returns table (week_start timestamptz, new_count bigint, unsub_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- IS DISTINCT FROM (not <>) so a NULL auth.uid() — i.e. a raw anon-key call
  -- with no user session — is also rejected (NULL <> x is NULL, which is falsy).
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  return query
    with weeks as (
      select generate_series(
        date_trunc('week', now()) - ((greatest(p_weeks, 1) - 1) || ' weeks')::interval,
        date_trunc('week', now()),
        interval '1 week'
      ) as wk
    )
    select w.wk,
           (select count(*) from public.newsletter_subscribers s
              where date_trunc('week', s.created_at) = w.wk)::bigint,
           (select count(*) from public.newsletter_subscribers s
              where s.unsubscribed_at is not null
                and date_trunc('week', s.unsubscribed_at) = w.wk)::bigint
    from weeks w
    order by w.wk;
end;
$$;
