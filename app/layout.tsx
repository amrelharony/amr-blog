import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./blog.css";
import SiteControls from "@/components/SiteControls";
import ParticleBackground from "@/components/ParticleBackground";
import HolidayEngine from "@/components/HolidayEngine";
import Mascot from "@/components/Mascot";
import MascotChat from "@/components/MascotChat";
import ThemeManager from "@/components/ThemeManager";
import AmbientColor from "@/components/AmbientColor";
import CustomCursor from "@/components/CustomCursor";
import Intro from "@/components/Intro";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

// Pre-paint theme: set .light-mode on <html> before React hydrates (no flash).
// Default by time-of-day if no saved preference (mirrors the main site).
// Tri-state theme ('auto' | 'light' | 'dark'); 'auto'/unset → time-of-day. Pre-paint, no flash.
// Also pre-paint hides the intro overlay on repeat views this session (Intro.tsx
// sets the introSeen flag) so returning visitors aren't covered until hydration.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var light;if(t==='light')light=true;else if(t==='dark')light=false;else{var h=new Date().getHours();light=(h>=6&&h<18);}if(light)document.documentElement.classList.add('light-mode');}catch(e){}try{if(sessionStorage.getItem('introSeen'))document.documentElement.classList.add('intro-seen');}catch(e){}})();`;

// External stylesheets (fonts + icons) load async — preload starts the fetch
// early, the injected <link> applies without blocking first paint, <noscript>
// keeps them working without JS. Variable-font weight ranges replace the 13
// static weights previously requested.
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300..900&family=JetBrains+Mono:wght@400..700&family=Source+Serif+4:opsz,wght@8..60,400..700&family=Noto+Sans+Arabic:wght@400..600&display=swap";
const FA_URL = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
const CSS_LOADER_SCRIPT = `(function(){[${JSON.stringify(FONTS_URL)},${JSON.stringify(FA_URL)}].forEach(function(h){var l=document.createElement('link');l.rel='stylesheet';l.href=h;document.head.appendChild(l);});})();`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Amr Elharony — Writing",
    template: "%s · Amr Elharony",
  },
  description: "Articles and thoughts by Amr Elharony.",
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": "/feed.xml",
      "application/feed+json": "/feed.json",
    },
  },
};

export const viewport: Viewport = { themeColor: "#06080f" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <noscript>
          <style dangerouslySetInnerHTML={{ __html: "#blog-intro{display:none!important}" }} />
        </noscript>
        <Intro />
        <ThemeManager />
        <AmbientColor />
        <ParticleBackground />
        {/* React 19 hoists these <link> tags into <head>. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" />
        <link rel="preload" as="style" href={FONTS_URL} />
        <link rel="preload" as="style" href={FA_URL} />
        <script dangerouslySetInnerHTML={{ __html: CSS_LOADER_SCRIPT }} />
        <noscript>
          <link rel="stylesheet" href={FONTS_URL} />
          <link rel="stylesheet" href={FA_URL} />
        </noscript>
        <a className="lb-skip-link" href="#main-content">
          Skip to content
        </a>
        <div id="main-content">{children}</div>
        <SiteControls />
        <CustomCursor />
        <HolidayEngine />
        <Mascot />
        <MascotChat />
      </body>
    </html>
  );
}
