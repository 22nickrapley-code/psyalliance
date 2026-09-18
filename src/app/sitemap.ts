import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://psyalliance.workers.dev";
  const now = new Date();
  return [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/auth/sign-up`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/auth/sign-in`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
