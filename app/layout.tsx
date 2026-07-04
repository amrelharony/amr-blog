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
import PwaRegister from "@/components/PwaRegister";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

// Pre-paint theme: set .light-mode on <html> before React hydrates (no flash).
// Default by time-of-day if no saved preference (mirrors the main site).
// Tri-state theme ('auto' | 'light' | 'dark'); 'auto'/unset → time-of-day. Pre-paint, no flash.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var light;if(t==='light')light=true;else if(t==='dark')light=false;else{var h=new Date().getHours();light=(h>=6&&h<18);}if(light)document.documentElement.classList.add('light-mode');}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Fintech Bilinguals — Amr Elharony",
    template: "%s · Fintech Bilinguals",
  },
  description:
    "Speaking both business and tech: deep dives on fintech, agile, and digital transformation by Amr Elharony.",
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
        {/* First focusable element on every page; each page provides the
            #main-content landing point (visually hidden until focused). */}
        <a href="#main-content" className="lb-skip-link">
          Skip to content
        </a>
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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Noto+Sans+Arabic:wght@400;600&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
        />
        {children}
        <PwaRegister />
        <SiteControls />
        <CustomCursor />
        <HolidayEngine />
        <Mascot />
        <MascotChat />
      </body>
    </html>
  );
}
