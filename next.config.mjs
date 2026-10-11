// Security headers on every response (release review R16). Pages may be
// framed only by the two PsyAlliance sites: the sandbox shows the real
// site's demo videos in a dialog.
const REAL = (process.env.NEXT_PUBLIC_REAL_SITE_URL || "https://psyalliance.22nickrapley.workers.dev").replace(/\/$/, "");
const DEMO = (process.env.NEXT_PUBLIC_DEMO_URL || "https://psyalliance-demo.22nickrapley.workers.dev").replace(/\/$/, "");

const securityHeaders = [
  { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${REAL} ${DEMO}; base-uri 'self'; object-src 'none'` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
