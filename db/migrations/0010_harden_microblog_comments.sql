-- Bring microblog (thoughts) comments up to the same hardening article_comments got
-- in 0005: a rate-limited + validated SECURITY DEFINER insert RPC, an author_id bound
-- to auth.uid() (spoof-proof owner badge), and removal of the direct anon INSERT path
-- so the per-author limit / length cap / reserved-name block can't be bypassed.
--
-- The microblog feature currently has no published posts, so there are no rows to
-- migrate. SELECT/read policy is left untouched; only the WRITE path changes.

alter table public.microblog_comments add column if not exists author_id uuid;
create index if not exists idx_microblog_comments_author on public.microblog_comments (author_id, created_at);
create index if not exists idx_microblog_comments_post   on public.microblog_comments (post_id, created_at);

-- Rate-limited + validated insert (SECURITY DEFINER; bypasses RLS deliberately).
create or replace function public.post_microblog_comment(
  p_post_id uuid, p_author text, p_content text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin   constant text := '82dd079f-de7b-477b-84eb-6d34d9eded05';
  v_uid     uuid := auth.uid();
  v_recent  int;
  v_id      uuid;
  v_content text := btrim(p_content);
  v_author  text := left(coalesce(nullif(btrim(p_author), ''), 'Visitor'), 80);
begin
  if v_uid is null then
    raise exception 'must be signed in to comment';
  end if;
  if length(v_content) < 1 or length(v_content) > 4000 then
    raise exception 'comment must be 1 to 4000 characters';
  end if;
  -- only published, already-due posts accept comments
  if not exists (
    select 1 from public.microblog
    where id = p_post_id and published and (scheduled_at is null or scheduled_at <= now())
  ) then
    raise exception 'post not available for comments';
  end if;
  -- the owner's display name is reserved (badge is author_id-driven, but block the
  -- name too so plain-text impersonation of the owner is impossible)
  if (v_uid)::text is distinct from v_admin
     and lower(coalesce(btrim(p_author), '')) = 'amr elharony' then
    raise exception 'that name is reserved';
  end if;
  -- max 5 comments per author per 10 minutes
  select count(*) into v_recent
  from public.microblog_comments
  where author_id = v_uid and created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'rate limit: too many comments, please slow down';
  end if;
  insert into public.microblog_comments (post_id, author, content, author_id)
  values (p_post_id, v_author, v_content, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.post_microblog_comment(uuid, text, text) to anon, authenticated;

-- Make the RPC the ONLY write path. Revoking the table INSERT privilege blocks direct
-- PostgREST inserts regardless of any RLS policy; the SECURITY DEFINER RPC inserts as
-- its owner, so it is unaffected. (Also drop a known direct-insert policy name if it
-- exists, mirroring 0005; harmless if the name differs.)
revoke insert on public.microblog_comments from anon, authenticated;
drop policy if exists "Authenticated users can post microblog comments" on public.microblog_comments;
