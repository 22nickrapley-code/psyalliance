// Security headers on every response (release review R16). Pages may be
// framed only by the PsyAlliance sites: the sandbox shows the real site's
// demo videos in a dialog. The old workers.dev addresses stay allowed while
// anyone still has them open.
const FRAMERS = [
  "https://psyalliance.org",
  "https://sandbox.psyalliance.org",
  "https://psyalliance.22nickrapley.workers.dev",
  "https://psyalliance-demo.22nickrapley.workers.dev",
].join(" ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${FRAMERS}; base-uri 'self'; object-src 'none'` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't announce the framework (release testing R16-A).
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
