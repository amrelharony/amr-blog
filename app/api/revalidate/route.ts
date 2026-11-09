// On-demand ISR: refresh the feed/article/thoughts caches after an admin mutation
// or the scheduled-publish tick. Authorized by an admin session OR a shared secret
// (for the LinkedIn action / cron).
//
// Body: { slug?: string, slugs?: string[], tags?: string[], allTags?: boolean }
//   slugs   - more article pages to refresh, for bulk publish, unpublish and
//             delete. Article pages keep a render for an hour, so without this a
//             bulk-unpublished or deleted article stayed readable that long.
//   tags    - the article's tags (old and new on an edit), so its long-lived tag
//             pages pick the change up now rather than when the cache expires.
//   allTags - mark every tag page stale; for bulk operations only (costs about
//             what a deploy does, since each page regenerates on its next visit).
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/auth/require-admin";
import { secretMatches } from "@/lib/auth/secret";
import { logEvent } from "@/lib/log";
import { revalidateTagPages, revalidateAllTagPages } from "@/lib/tag-pages";
import { revalidateArticlePages } from "@/lib/article-pages";

async function authorized(req: NextRequest): Promise<boolean> {
  // Constant-time compare (fails closed when REVALIDATE_SECRET is unset).
  if (secretMatches(req.headers.get("x-revalidate-secret"), process.env.REVALIDATE_SECRET)) return true;
  return isAdminUser();
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    logEvent("revalidate.denied", {});
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const slug: string | undefined = body?.slug;
  revalidatePath("/");
  revalidatePath("/thoughts");
  revalidatePath("/sitemap.xml");
  revalidatePath("/feed.xml");
  if (slug) revalidatePath(`/p/${slug}`);
  // articlePagePaths (inside revalidateArticlePages) drops non-slugs and caps the count.
  const slugs: unknown[] = Array.isArray(body?.slugs) ? body.slugs : [];
  revalidateArticlePages(slugs);
  // tagPagePaths (inside revalidateTagPages) drops non-strings and caps the count.
  const tags: unknown[] = Array.isArray(body?.tags) ? body.tags : [];
  const allTags = body?.allTags === true;
  if (allTags) revalidateAllTagPages();
  else revalidateTagPages(tags);
  logEvent("revalidate.ok", { slug: slug ?? null, slugs: slugs.length, tags: tags.length, allTags });
  return NextResponse.json({ ok: true });
}
