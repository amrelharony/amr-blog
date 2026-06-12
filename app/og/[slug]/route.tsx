// Branded 1200×630 Open Graph card, generated per article with next/og.
// Used as the social image for articles that have no cover image (the
// article page's generateMetadata picks cover_image first when present).
import { ImageResponse } from "next/og";
import { getArticleBySlug } from "@/lib/queries/articles";
import { fmtDate, readingTime } from "@/lib/format";

export const revalidate = 3600;

const WIDTH = 1200;
const HEIGHT = 630;

// Satori needs ttf/otf — the css2 endpoint only serves them to old UAs.
// The promise is cached (not the result) so concurrent cold requests share
// one fetch; null = fetch failed, render with the built-in font.
let fontPromise: Promise<ArrayBuffer | null> | null = null;

function loadFont(): Promise<ArrayBuffer | null> {
  fontPromise ??= (async () => {
    try {
      const css = await fetch(
        "https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap",
        { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/534" } },
      ).then((r) => r.text());
      const url = css.match(/src:\s*url\((https:[^)]+\.ttf)\)/)?.[1];
      return url ? await fetch(url).then((r) => r.arrayBuffer()) : null;
    } catch {
      return null;
    }
  })();
  return fontPromise;
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const a = await getArticleBySlug(slug);
  if (!a) return new Response("Not found", { status: 404 });

  const font = await loadFont();
  const title = a.title.length > 120 ? a.title.slice(0, 117) + "…" : a.title;
  const tags = (a.tags || []).slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#06080f",
          backgroundImage:
            "radial-gradient(circle at 85% 10%, rgba(0,225,255,0.14), transparent 45%), radial-gradient(circle at 5% 95%, rgba(99,102,241,0.18), transparent 50%)",
          color: "#f0f2f5",
          fontFamily: font ? "Inter" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 24,
              letterSpacing: 6,
              color: "#00e1ff",
            }}
          >
            AMR ELHARONY — WRITING
          </div>
          <div
            style={{
              width: 120,
              height: 5,
              marginTop: 18,
              backgroundImage: "linear-gradient(90deg, #00e1ff, #6366f1)",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 70 ? 52 : 64,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 24,
            color: "#8a95a8",
          }}
        >
          <div style={{ display: "flex", gap: 14 }}>
            {tags.map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  padding: "8px 20px",
                  border: "1px solid rgba(0,225,255,0.35)",
                  borderRadius: 999,
                  color: "#00e1ff",
                  fontSize: 22,
                }}
              >
                {t}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            <span>{fmtDate(a.created_at)}</span>
            <span>·</span>
            <span>{readingTime(a.content)}</span>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      ...(font
        ? { fonts: [{ name: "Inter", data: font, style: "normal" as const, weight: 700 as const }] }
        : {}),
    },
  );
}
