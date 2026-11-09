// Reuse the Open Graph card for the Twitter/X summary_large_image. Segment
// config must be declared literally here (Next can't read re-exported config),
// so only the render function is shared from opengraph-image.
import Image from "./opengraph-image";

export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "Article preview — Amr Elharony";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default Image;
