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
  // Messages accept files up to 20 MB. Next keeps only the first 10 MB of a request body that passes through the
  // middleware, so a file between 10 and 20 MB failed with "That file couldn't be read" (Release B, M03).
  experimental: { middlewareClientMaxBodySize: "25mb" },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Voice notes in Messages need the microphone, on the workspace's own pages only.
      { source: "/dashboard/:path*", headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" }] },
    ];
  },
};

export default nextConfig;
