import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { LIBRARY_NAMES } from "@/lib/library";


export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = SITE_URL;
  const now = new Date();
  return [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/library`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    // The twenty Practice Library templates each have a public page.
    ...Object.values(LIBRARY_NAMES).map((n) => ({ url: `${siteUrl}/library/${n.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${siteUrl}/join`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/verification`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/auth/sign-up`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/auth/sign-in`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
