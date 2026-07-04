// Supabase Edge Function: text → 384-dim gte-small embedding.
// Deploy from the dashboard (Edge Functions → new function "embed") or CLI:
//   supabase functions deploy embed --no-verify-jwt
// then set the shared secret:
//   supabase secrets set EMBED_FN_SECRET=<random>
// The Next app calls it via lib/embeddings.ts with the same secret in the
// x-embed-secret header (env: EMBED_FN_URL, EMBED_FN_SECRET).
//
// gte-small is built into the Edge runtime (Supabase.ai) — no external
// provider, no per-call cost. ~512-token input window; callers pre-truncate
// (buildEmbeddingInput caps at 2,000 chars).

// @ts-expect-error Supabase Edge runtime global (Deno), not in the Next tsconfig
const session = new Supabase.ai.Session("gte-small");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }
  const secret = Deno.env.get("EMBED_FN_SECRET") || "";
  if (!secret || req.headers.get("x-embed-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text : "";
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400 });
  }
  text = text.trim().slice(0, 4000);
  if (!text) return new Response(JSON.stringify({ error: "text required" }), { status: 400 });

  const embedding = (await session.run(text, {
    mean_pool: true,
    normalize: true,
  })) as number[];

  return new Response(JSON.stringify({ embedding }), {
    headers: { "Content-Type": "application/json" },
  });
});
