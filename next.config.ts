import type { NextConfig } from "next";

// Baseline security headers. Kept intentionally conservative so nothing breaks:
//   - nosniff: forbid MIME-sniffing (the pdf.js worker is served as JS, feeds as XML).
//   - Referrer-Policy: don't leak full URLs cross-origin.
//   - Permissions-Policy: disable features the blog never uses.
// NOT set here (would need confirmation / a CSP strategy — see review notes):
//   a full Content-Security-Policy, HSTS (Vercel sets it on custom domains), and a
//   site-wide X-Frame-Options (public pages may be embedded by the portfolio site).
// X-Frame-Options is applied to /admin only, where clickjacking actually matters.
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      {
        // Per the Next PWA guide: the SW itself must never be cached, so a new
        // deploy's worker (with a bumped cache version) takes over immediately.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
