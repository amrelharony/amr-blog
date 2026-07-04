-- Phase 4 (semantic discovery). Apply via the Supabase dashboard SQL editor,
-- like every migration in this directory. Also deploy the companion Edge
-- Function (supabase/functions/embed) and set its EMBED_FN_SECRET — the Next
-- app reads EMBED_FN_URL / EMBED_FN_SECRET from env.
--
--  * embedding — 384-dim gte-small vector of title+tldr+excerpt+body-head
--    (built by lib/embeddings.ts buildEmbeddingInput; dimension is locked to
--    EMBEDDING_DIMS there — change both together or not at all).
--  * embedded_at — audit stamp; the backfill filters on `embedding is null`,
--    so a re-run resumes for free.
--  * HNSW index — cosine ops; builds incrementally, no maintenance_work_mem
--    ceremony needed at ~3k rows.
--
-- The match functions are SECURITY INVOKER (anon-callable reads of published
-- rows only — the admin-guard rule applies to DEFINER mutations, not these) and
-- never accept or return raw vectors from/to the client:
--  * match_related_articles looks the source vector up server-side by id.
--  * match_articles takes a vector, but it is only called server-side by
--    /api/search (query-time embedding); RLS still bounds what rows it can see.

create extension if not exists vector;

alter table public.longform_articles
  add column if not exists embedding vector(384),
  add column if not exists embedded_at timestamptz;

create index if not exists idx_longform_articles_embedding
  on public.longform_articles
  using hnsw (embedding vector_cosine_ops);

-- Articles most similar to a given article (excluding it), published only.
-- Returns the CARD_COLUMNS shape used by lib/queries/articles.ts.
create or replace function public.match_related_articles(p_article_id uuid, p_count int default 5)
returns table (
  id uuid, title text, slug text, excerpt text, created_at timestamptz,
  tags text[], views integer, reactions jsonb, cover_image text,
  series_name text, category text
)
language sql
stable
set search_path = public, pg_temp
as $$
  select a.id, a.title, a.slug, a.excerpt, a.created_at,
         a.tags, a.views, a.reactions, a.cover_image, a.series_name, a.category
  from public.longform_articles a
  join public.longform_articles src on src.id = p_article_id
  where src.embedding is not null
    and a.published = true
    and a.embedding is not null
    and a.id <> p_article_id
  order by a.embedding <=> src.embedding
  limit least(greatest(p_count, 1), 20);
$$;

-- Articles most similar to an arbitrary query embedding (hybrid search arm).
create or replace function public.match_articles(p_embedding vector(384), p_count int default 12)
returns table (
  id uuid, title text, slug text, excerpt text, created_at timestamptz,
  tags text[], views integer, reactions jsonb, cover_image text,
  series_name text, category text
)
language sql
stable
set search_path = public, pg_temp
as $$
  select a.id, a.title, a.slug, a.excerpt, a.created_at,
         a.tags, a.views, a.reactions, a.cover_image, a.series_name, a.category
  from public.longform_articles a
  where a.published = true
    and a.embedding is not null
  order by a.embedding <=> p_embedding
  limit least(greatest(p_count, 1), 50);
$$;
