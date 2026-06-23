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
  // isomorphic-dompurify (lib/markdown/sanitize.ts) pulls in jsdom, and jsdom's
  // dynamic requires break when it's BUNDLED into the serverless function — the page
  // module calls DOMPurify.addHook() at load, so jsdom is initialized the moment the
  // route module loads. It works at build/dev/next-start (full node_modules) but the
  // on-demand ISR render 500s on Vercel. Externalizing keeps them as runtime requires
  // from the traced node_modules so jsdom initializes correctly in the lambda.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
