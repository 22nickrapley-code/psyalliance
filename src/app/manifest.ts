import type { MetadataRoute } from "next";
import { IS_DEMO_SITE } from "@/lib/env";

// v16: lets a phone add PsyAlliance to its home screen as an app. On an iPhone this is what makes alerts possible.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: IS_DEMO_SITE ? "PsyAlliance sandbox" : "PsyAlliance",
    short_name: IS_DEMO_SITE ? "PA sandbox" : "PsyAlliance",
    description: "Cover, referrals and consultation with verified colleagues.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#F7F4EC",
    theme_color: "#203B32",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
