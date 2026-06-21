// On-demand ISR: refresh the feed/article/thoughts caches after an admin mutation
// or the scheduled-publish tick. Authorized by an admin session OR a shared secret
// (for the LinkedIn action / cron).
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/auth/require-admin";

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = req.headers.get("x-revalidate-secret");
  if (secret && process.env.REVALIDATE_SECRET && secret === process.env.REVALIDATE_SECRET) return true;
  return isAdminUser();
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const slug: string | undefined = body?.slug;
  revalidatePath("/");
  revalidatePath("/thoughts");
  revalidatePath("/sitemap.xml");
  revalidatePath("/feed.xml");
  if (slug) revalidatePath(`/p/${slug}`);
  return NextResponse.json({ ok: true });
}
