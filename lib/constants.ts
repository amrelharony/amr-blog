// The admin's Supabase Auth user id — matches the hardcoded UUID in the Connect
// DB's RLS policies (longform_articles/microblog "Admin full access", etc.).
export const ADMIN_UUID = "82dd079f-de7b-477b-84eb-6d34d9eded05";

// Articles per feed page (hero + cards) — shared by app/page.tsx and /api/feed.
export const FEED_PAGE_SIZE = 12;

// Articles per page on a /category/<slug> archive (server-paginated, ?page=N).
export const CATEGORY_PAGE_SIZE = 24;
