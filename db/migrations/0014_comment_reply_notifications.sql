-- Phase 10 (comment-reply email notifications). Apply via the Supabase
-- dashboard SQL editor.
--
-- Design constraints:
--  * Emails must NEVER sit on the publicly-readable article_comments row —
--    RLS SELECT policies filter rows, not columns, so `select=*` on an
--    approved comment would leak them. Opt-in emails live in
--    comment_subscriptions: RLS enabled, NO policies (service-role only).
--  * One notification per reply, ever: comment_reply_notification_log's
--    primary key is the claim (insert-first wins), mirroring
--    article_notification_log (0013) and idx_bulletin_in_progress.
--  * post_article_comment gains optional p_notify_email. The 4-arg version
--    is DROPPED first — two overloads would be ambiguous to PostgREST when
--    called with named params. Body is the 0007 version verbatim, plus the
--    email validation + subscription insert.

create table if not exists public.comment_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  comment_id      uuid not null unique references public.article_comments(id) on delete cascade,
  email           text not null,
  token           uuid not null default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  unsubscribed_at timestamptz
);

create index if not exists idx_comment_subscriptions_token on public.comment_subscriptions (token);

alter table public.comment_subscriptions enable row level security;
-- (intentionally no policies — only the service role reads/writes emails)

create table if not exists public.comment_reply_notification_log (
  reply_comment_id uuid primary key references public.article_comments(id) on delete cascade,
  created_at       timestamptz not null default now()
);

alter table public.comment_reply_notification_log enable row level security;
-- (intentionally no policies — service-role only)

drop function if exists public.post_article_comment(uuid, uuid, text, text);

create or replace function public.post_article_comment(
  p_article_id uuid, p_parent_id uuid, p_author text, p_content text,
  p_notify_email text default null
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
  v_email text := lower(btrim(coalesce(p_notify_email, '')));
begin
  if v_uid is null then
    raise exception 'must be signed in to comment';
  end if;
  if length(v_content) < 1 or length(v_content) > 4000 then
    raise exception 'comment must be 1 to 4000 characters';
  end if;
  -- notify email is optional; when present it must look like one address
  if v_email <> '' and (length(v_email) > 254 or v_email !~ '^[^@[:space:]]{1,64}@[^@[:space:]]{1,190}\.[a-z]{2,24}$') then
    raise exception 'invalid notification email';
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
  -- store the opt-in inside this DEFINER body so the email never transits an
  -- anon-writable table
  if v_email <> '' then
    insert into public.comment_subscriptions (comment_id, email)
    values (v_id, v_email)
    on conflict (comment_id) do nothing;
  end if;
  return v_id;
end;
$$;
