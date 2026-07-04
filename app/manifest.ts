// Web app manifest (served at /manifest.webmanifest) — the sanctioned Next
// approach per node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md.
// theme/background match viewport.themeColor in app/layout.tsx.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fintech Bilinguals — Amr Elharony",
    short_name: "Fintech Bilinguals",
    description:
      "Speaking both business and tech: deep dives on fintech, agile, and digital transformation.",
    start_url: "/",
    display: "standalone",
    background_color: "#06080f",
    theme_color: "#06080f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
