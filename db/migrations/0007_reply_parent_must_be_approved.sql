-- Phase 3 follow-up: close a comment-moderation bypass.
--
-- set_comment_status() (0005) hides a thread by walking a recursive CTE over the
-- comments that EXIST at moderation time — it's a one-shot cascade. But
-- post_article_comment() only checked that a reply's parent EXISTS on the same
-- article, not that it is still visible. So after an admin demoted a thread to
-- 'pending'/'spam', a visitor could still reply with p_parent_id = the hidden
-- comment's id; the new row was inserted status='approved' and became publicly
-- readable via the `using (status = 'approved')` RLS policy — re-surfacing content
-- under a thread the admin had explicitly suppressed (visible at least to direct
-- PostgREST reads; the React client happens to drop the orphan).
--
-- Fix: require the parent to be 'approved' before accepting a reply. Body is
-- otherwise identical to the 0005 definition.

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
  -- a reply's parent must be a real, STILL-APPROVED comment on the SAME article, so a
  -- reply can't be attached to a thread the admin has hidden (pending/spam).
  if p_parent_id is not null and not exists (
    select 1 from public.article_comments
    where id = p_parent_id and article_id = p_article_id and status = 'approved'
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
