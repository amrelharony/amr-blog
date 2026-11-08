-- Index the tag filter behind /tag/<tag>, /feed/tag/<tag> and /api/feed?tag=.
--
-- Every tag surface filters with `tags @> '{"<tag>"}'` (postgrest-js .contains(),
-- see getArticlesByTag / getTagCount in lib/queries/articles.ts), and no index
-- covered the array column. Each tag-page render was therefore a sequential scan
-- of longform_articles, twice before the app change that ships with this file
-- (rows plus a separate count: "exact"). The heap rows are wide (the 384-float
-- `embedding` stays inline). With ~9,300 distinct tags crawled at random and
-- nothing cached for long, crawler bursts stacked those scans. That is the likely
-- reason production logged Cloudflare "522: Connection timed out" from
-- supabase.co, and the uncached 500s that followed made crawlers retry.
--
-- GIN with the default array_ops supports @> directly, so a tag lookup becomes an
-- index probe plus a handful of heap fetches. The index is not partial: queries
-- also filter `published = true`, but that is a cheap recheck on the few rows the
-- index returns.
--
-- Plain (not CONCURRENTLY) so it can run in the dashboard SQL editor, which wraps
-- the script in a transaction. At ~3,100 rows the build takes well under a
-- second; it briefly blocks writes to the table, not reads.
create index if not exists idx_longform_articles_tags
  on public.longform_articles
  using gin (tags);

-- Refresh column statistics (incl. most_common_elems) so the planner costs the
-- new index from current data, not whatever autovacuum last sampled.
analyze public.longform_articles;
