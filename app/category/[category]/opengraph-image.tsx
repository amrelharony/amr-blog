import { ImageResponse } from "next/og";
import { categoryBySlug } from "@/lib/categories";
import { getCategoryCount } from "@/lib/queries/articles";

// Branded OG card per category hub — inherits the segment's generateStaticParams
// (the three category slugs) and the same bundled-font / no-external-fetch
// approach as the per-article card.
export const runtime = "nodejs";
export const revalidate = 300;
export const alt = "Category — Amr Elharony";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#06080f";
const ACCENT = "#00e1ff";
const TEXT = "#f0f2f5";
const SUB = "#8a95a8";

export default async function Image({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = categoryBySlug(category);
  const label = cat?.label || "Articles";
  const blurb = cat?.blurb || "";
  let count = 0;
  try {
    if (cat) count = await getCategoryCount(cat.label);
  } catch {
    /* fall through to a 0 count */
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: ACCENT }}>
            AMR ELHARONY
          </div>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: SUB }}>FINTECH BILINGUALS</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, color: SUB, letterSpacing: 2 }}>CATEGORY</div>
          <div style={{ display: "flex", fontSize: 104, fontWeight: 800, color: TEXT, letterSpacing: -2 }}>
            {label}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: SUB, marginTop: 16, maxWidth: 900, lineHeight: 1.3 }}>
            {blurb}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: ACCENT,
              border: `1px solid ${ACCENT}`,
              borderRadius: 999,
              padding: "10px 26px",
            }}
          >
            {count.toLocaleString()} articles
          </div>
          <div style={{ display: "flex", fontSize: 24, color: SUB }}>amrelharony.com</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
