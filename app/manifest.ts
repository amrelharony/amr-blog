import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Amr Elharony — Writing",
    short_name: "Amr's Blog",
    description: "Deep dives on Agile, FinTech, and Digital Transformation",
    start_url: "/",
    display: "standalone",
    background_color: "#06080f",
    theme_color: "#06080f",
    icons: [
      { src: "/icon.png", sizes: "any", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
