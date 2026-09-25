import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = SITE_URL;
  const now = new Date();
  return [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/auth/sign-up`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/auth/sign-in`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
