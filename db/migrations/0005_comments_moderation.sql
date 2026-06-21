-- Phase 3 (comment moderation + rate-limit). Statements are ordered so the
-- column + backfill exist BEFORE the public-read policy is narrowed, so no
-- existing comment ever disappears (default 'approved' preserves live posting).
--
--  * status  — 'approved' (default) | 'pending' | 'spam'. Public reads only
--               'approved'; admin reads all. New comments default 'approved',
--               so posting stays live; the admin can demote to hide.
--  * author_id — the commenter's (anonymous) auth.uid(), enabling per-session
--               rate-limiting, per-author moderation, and a SPOOF-PROOF author
--               badge (the badge is keyed on author_id, not the typed name).
--  * inserts now go ONLY through post_article_comment() (rate-limited + validated);
--    the direct-insert RLS policy is dropped so spammers can't bypass the limit.

alter table public.article_comments add column if not exists status text not null default 'approved';
alter table public.article_comments add column if not exists author_id uuid;
update public.article_comments set status = 'approved' where status is null;

create index if not exists idx_article_comments_status on public.article_comments (article_id, status);
create index if not exists idx_article_comments_author on public.article_comments (author_id, created_at);

-- Public reads only approved; admins read everything (separate permissive policy).
alter policy "Article comments are publicly readable" on public.article_comments
  using (status = 'approved');

drop policy if exists "Admin can read all comments" on public.article_comments;
create policy "Admin can read all comments" on public.article_comments
  for select using ((auth.uid())::text = '82dd079f-de7b-477b-84eb-6d34d9eded05');

-- Remove the direct INSERT path; the rate-limited RPC below is now the only way in.
drop policy if exists "Authenticated users can post article comments" on public.article_comments;

-- Rate-limited + validated insert (SECURITY DEFINER; bypasses RLS deliberately).
create or replace function public.post_article_comment(
  p_article_id uuid, p_parent_id uuid, p_author text, p_content text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin constant text := '82dd079f-de7b-477b-84eb-6d34d9eded05';
  v_uid uuid := auth.uid();
  v_recent int;
  v_id uuid;
  v_content text := btrim(p_content);
begin
  if v_uid is null then
    raise exception 'must be signed in to comment';
  end if;
  if length(v_content) < 1 or length(v_content) > 4000 then
    raise exception 'comment must be 1 to 4000 characters';
  end if;
  -- only published articles accept comments (drafts never render publicly)
  if not exists (select 1 from public.longform_articles where id = p_article_id and published) then
    raise exception 'article not available for comments';
  end if;
  -- a reply's parent must be a real comment on the SAME article
  if p_parent_id is not null and not exists (
    select 1 from public.article_comments where id = p_parent_id and article_id = p_article_id
  ) then
    raise exception 'invalid parent comment';
  end if;
  -- the owner's display name is reserved (badge is author_id-driven, but block the
  -- name too so plain-text impersonation of the owner is impossible)
  if (v_uid)::text is distinct from v_admin
     and lower(coalesce(btrim(p_author), '')) = 'amr elharony' then
    raise exception 'that name is reserved';
  end if;
  -- max 5 comments per author per 10 minutes
  select count(*) into v_recent
  from public.article_comments
  where author_id = v_uid and created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'rate limit: too many comments, please slow down';
  end if;
  insert into public.article_comments (article_id, parent_id, author_name, content, author_id, status)
  values (p_article_id, p_parent_id,
          coalesce(nullif(btrim(p_author), ''), 'Anonymous'), v_content, v_uid, 'approved')
  returning id into v_id;
  return v_id;
end;
$$;

-- Admin moderation RPCs (bulk). Hiding (pending/spam) CASCADES to the whole
-- reply subtree so a hidden parent can't leave orphaned, still-public replies
-- (which the client would otherwise promote to top-level). Approving does NOT
-- cascade — re-approving a parent must not silently un-hide replies that were
-- individually demoted.
create or replace function public.set_comment_status(p_ids uuid[], p_status text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  if p_status not in ('approved', 'pending', 'spam') then
    raise exception 'invalid status';
  end if;
  if p_status in ('pending', 'spam') then
    with recursive thread as (
      select id from public.article_comments where id = any(p_ids)
      union all
      select c.id from public.article_comments c join thread t on c.parent_id = t.id
    )
    update public.article_comments set status = p_status where id in (select id from thread);
  else
    update public.article_comments set status = p_status where id = any(p_ids);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.delete_article_comments(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  if (auth.uid())::text is distinct from '82dd079f-de7b-477b-84eb-6d34d9eded05' then
    raise exception 'not authorized';
  end if;
  delete from public.article_comments where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;
