// On-demand ISR: refresh the feed/article/thoughts caches after an admin mutation
// or the scheduled-publish tick. Authorized by an admin session OR a shared secret
// (for the LinkedIn action / cron).
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_UUID } from "@/lib/constants";
import { timingSafeCompare } from "@/lib/security";

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = req.headers.get("x-revalidate-secret");
  if (timingSafeCompare(secret, process.env.REVALIDATE_SECRET)) return true;
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    return user?.id === ADMIN_UUID;
  } catch {
    return false;
  }
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
