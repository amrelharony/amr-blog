import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./blog.css";
import SiteControls from "@/components/SiteControls";
import ParticleBackground from "@/components/ParticleBackground";
import HolidayEngine from "@/components/HolidayEngine";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

// Pre-paint theme: set .light-mode on <html> before React hydrates (no flash).
// Default by time-of-day if no saved preference (mirrors the main site).
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(!t){var h=new Date().getHours();t=(h>=6&&h<18)?'light':'dark';}if(t==='light')document.documentElement.classList.add('light-mode');}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Amr Elharony — Writing",
    template: "%s · Amr Elharony",
  },
  description: "Articles and thoughts by Amr Elharony.",
  alternates: { canonical: "/", types: { "application/rss+xml": "/feed.xml" } },
};

export const viewport: Viewport = { themeColor: "#06080f" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ParticleBackground />
        {/* React 19 hoists these <link> tags into <head>. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Noto+Sans+Arabic:wght@400;600&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
        />
        {children}
        <SiteControls />
        <HolidayEngine />
      </body>
    </html>
  );
}
