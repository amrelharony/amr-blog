-- Inline article PDFs. An article may carry one optional PDF, uploaded by the
-- agent via POST /api/articles (multipart) and hosted in a public Storage bucket.
--   pdf_url  — public Storage URL of the hosted PDF (NULL = no PDF)
--   pdf_name — original filename, used as the viewer's download label
-- Additive + back-compatible: NULL for every existing row. getArticleBySlug uses
-- select("*") so these flow through automatically; ArticleCard's curated column
-- list is untouched, so PDFs never appear on the feed.
alter table public.longform_articles add column if not exists pdf_url  text;
alter table public.longform_articles add column if not exists pdf_name text;

-- Public-read bucket for article PDFs. Public so pdf.js can fetch objects
-- cross-origin with no auth; service-role uploads bypass RLS, so no INSERT policy
-- on storage.objects is needed. 25 MiB + application/pdf are a second line of
-- defense behind the endpoint's own size/magic-byte checks. Idempotent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article-pdfs', 'article-pdfs', true, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
