-- Inline article PDFs. An article may carry one optional PDF, hosted by the agent
-- on its own VPS (HTTPS + CORS) and referenced by URL via POST /api/articles.
--   pdf_url  — public HTTPS URL of the PDF (NULL = no PDF)
--   pdf_name — filename, used as the viewer's download label
-- Additive + back-compatible: NULL for every existing row. getArticleBySlug uses
-- select("*") so these flow through automatically; ArticleCard's curated column
-- list is untouched, so PDFs never appear on the feed.
alter table public.longform_articles add column if not exists pdf_url  text;
alter table public.longform_articles add column if not exists pdf_name text;
