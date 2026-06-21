-- Security hardening: the pre-existing admin RPCs are SECURITY DEFINER with
-- EXECUTE granted to anon/authenticated and NO internal authorization check.
-- Because every visitor holds an anonymous auth session, this let ANY visitor:
--   * delete_article_comment(<id>)  → delete any comment (comment-section wipe)
--   * create_review_link(<id>,<tok>) → mint a public 7-day link to a DRAFT
--   * save_article_version(<id>)     → spam version snapshots
-- These functions are only ever called by the admin pages, so we add the same
-- internal auth.uid() = ADMIN_UUID guard the new Phase 2 RPCs use. Bodies are
-- otherwise unchanged from their current definitions.

create or replace function public.delete_article_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- IS DISTINCT FROM (not <>) so a NULL auth.uid() — a raw anon-key call with no
  -- user session — is rejected too (NULL <> x is NULL, which is falsy).
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  delete from public.article_comments where id = p_comment_id;
end;
$$;

create or replace function public.create_review_link(p_article_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- IS DISTINCT FROM (not <>) so a NULL auth.uid() — a raw anon-key call with no
  -- user session — is rejected too (NULL <> x is NULL, which is falsy).
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  insert into public.article_reviews (article_id, review_token, expires_at)
  values (p_article_id, p_token, now() + interval '7 days');
end;
$$;

create or replace function public.save_article_version(p_article_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_version integer;
begin
  -- IS DISTINCT FROM (not <>) so a NULL auth.uid() — a raw anon-key call with no
  -- user session — is rejected too (NULL <> x is NULL, which is falsy).
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.article_versions where article_id = p_article_id;

  insert into public.article_versions (article_id, version_number, title, content, excerpt, tags)
  select p_article_id, next_version, title, content, excerpt, tags
  from public.longform_articles where id = p_article_id;
end;
$$;
