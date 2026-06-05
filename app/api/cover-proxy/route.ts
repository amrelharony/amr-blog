// Image proxy for Supabase storage — ported from api/cover-proxy.js (SSRF-guarded).
import { NextRequest } from "next/server";

export const runtime = "edge";

const ALLOWED_HOST = "ninughddcomniliqimlu.supabase.co";
const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT = 8000;
const ALLOWED_CT = /^image\/(png|jpe?g|webp|gif|avif)(;|$)/i;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

export async function GET(req: NextRequest) {
  const imageUrl = new URL(req.url).searchParams.get("url");
  if (!imageUrl) return new Response("Missing url parameter", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if ((parsed.hostname || "").toLowerCase() !== ALLOWED_HOST) return new Response("Forbidden host", { status: 403 });
  if (parsed.protocol !== "https:") return new Response("HTTPS required", { status: 403 });
  if (parsed.port && parsed.port !== "443") return new Response("Invalid port", { status: 403 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  let imgRes: Response;
  try {
    // redirect:"manual" so a 3xx off the allow-listed host can't be followed to
    // an arbitrary target — the host check above only validates the initial URL.
    imgRes = await fetch(imageUrl, { signal: ctrl.signal, redirect: "manual" });
  } catch {
    clearTimeout(timer);
    return new Response("Failed to fetch image", { status: 502 });
  }
  clearTimeout(timer);
  if (imgRes.type === "opaqueredirect" || (imgRes.status >= 300 && imgRes.status < 400))
    return new Response("Redirect not allowed", { status: 403 });
  if (!imgRes.ok) return new Response("Image not found", { status: 404 });

  const ct = imgRes.headers.get("content-type") || "";
  if (!ALLOWED_CT.test(ct)) return new Response("Unsupported content type", { status: 415 });
  if (parseInt(imgRes.headers.get("content-length") || "0", 10) > MAX_BYTES)
    return new Response("Image too large (max 5MB)", { status: 413 });

  const reader = imgRes.body!.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {}
        return new Response("Image too large (max 5MB)", { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return new Response("Failed to fetch image", { status: 502 });
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.byteLength;
  }

  const origin = req.headers.get("origin") || "";
  const allowed = [SITE, "https://amrelharony.com", "https://www.amrelharony.com"];
  const allowOrigin = allowed.includes(origin) ? origin : SITE;

  return new Response(body, {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": allowOrigin,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
