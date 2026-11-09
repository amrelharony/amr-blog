import { ImageResponse } from "next/og";
import { getArticleBySlug } from "@/lib/queries/articles";

// Dynamic Open Graph card per article — a branded typographic share image
// (no external image fetch / no custom font: next/og's bundled Geist fallback
// is used, keeping generation reliable and under the 500KB satori budget).
// Uses the same hour-long revalidate as the page. A share card that trails a
// title edit by up to an hour is harmless.
export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "Article preview — Amr Elharony";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#06080f";
const ACCENT = "#00e1ff";
const TEXT = "#f0f2f5";
const SUB = "#8a95a8";

function titleSize(len: number): number {
  if (len > 90) return 48;
  if (len > 60) return 58;
  if (len > 36) return 68;
  return 80;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let title = "Amr Elharony";
  let tags: string[] = [];
  try {
    const a = await getArticleBySlug(slug);
    if (a) {
      title = (a.title || "Amr Elharony").slice(0, 140);
      tags = (a.tags || []).slice(0, 3);
    }
  } catch {
    // fall through to the generic site card below
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: 72,
          borderTop: `10px solid ${ACCENT}`,
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: ACCENT }}>
            AMR ELHARONY
          </div>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: SUB }}>FINTECH BILINGUALS</div>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: titleSize(title.length),
            fontWeight: 800,
            color: TEXT,
            lineHeight: 1.1,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>

        {/* Tags + footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex" }}>
            {tags.map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: ACCENT,
                  border: `1px solid ${ACCENT}`,
                  borderRadius: 999,
                  padding: "8px 22px",
                  marginRight: 14,
                }}
              >
                {t}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: SUB }}>amrelharony.com</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
