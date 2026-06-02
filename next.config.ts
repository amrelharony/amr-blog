import type { NextConfig } from "next";

// Baseline security response headers applied to every route. Deliberately conservative:
// no X-Frame-Options / framing restriction, because the blog's assets are used
// cross-origin by amrelharony.com (see the cover-proxy CORS allowlist), and no strict CSP
// (the app relies on inline bootstrap scripts + external font/CDN/Supabase/OpenClaw origins
// — a CSP would need nonces and is tracked as a follow-up).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Powerful features the blog never uses — disable them to shrink the attack surface.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
