// Image proxy for Supabase storage — ported from api/cover-proxy.js (SSRF-guarded).
import { NextRequest } from "next/server";
import { logEvent } from "@/lib/log";

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
  } catch (e) {
    clearTimeout(timer);
    logEvent("coverproxy.fetch_failed", { stage: "fetch", message: e instanceof Error ? e.message : String(e) });
    return new Response("Failed to fetch image", { status: 502 });
  }
  // NB: the timer stays armed until the body has been fully read (cleared in the
  // finally below). Clearing it here — as soon as the response HEADERS arrived —
  // left the streaming loop with no deadline at all, so a trickling upstream could
  // hold this edge invocation open indefinitely under the 5 MB cap. ctrl.signal is
  // wired to the body stream too, so a fire aborts the read and lands in the catch.
  if (imgRes.type === "opaqueredirect" || (imgRes.status >= 300 && imgRes.status < 400)) {
    clearTimeout(timer);
    return new Response("Redirect not allowed", { status: 403 });
  }
  if (!imgRes.ok) {
    clearTimeout(timer);
    // Report the upstream class rather than flattening 5xx/403 into "not found".
    const status = imgRes.status >= 500 ? 502 : 404;
    return new Response(status === 502 ? "Upstream error" : "Image not found", { status });
  }

  const ct = imgRes.headers.get("content-type") || "";
  if (!ALLOWED_CT.test(ct)) {
    clearTimeout(timer);
    return new Response("Unsupported content type", { status: 415 });
  }
  if (parseInt(imgRes.headers.get("content-length") || "0", 10) > MAX_BYTES) {
    clearTimeout(timer);
    return new Response("Image too large (max 5MB)", { status: 413 });
  }

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
  } catch (e) {
    logEvent("coverproxy.fetch_failed", { stage: "stream", message: e instanceof Error ? e.message : String(e) });
    return new Response("Failed to fetch image", { status: 502 });
  } finally {
    clearTimeout(timer);
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
      // ACAO varies by request Origin, so the shared CDN entry must key on it — without
      // Vary, the first origin to populate the cache pins its ACAO for the others and
      // cross-origin image loads fail intermittently.
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
