import type { MetadataRoute } from "next";
import { IS_DEMO_SITE } from "@/lib/env";

// Dashboard and API routes are behind auth anyway (redirect to sign-in), but
// keeping crawlers off them explicitly avoids indexing sign-in-gated pages
// with no useful content. Everything public (the homepage, sign-up) stays
// open - that's exactly what should be discoverable by search engines and
// by LLM-driven research/answer engines.
export default function robots(): MetadataRoute.Robots {
  // The demo site is never indexed.
  if (IS_DEMO_SITE) return { rules: { userAgent: "*", disallow: "/" } };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://psyalliance.workers.dev";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api", "/auth/callback", "/auth/reset-password"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
