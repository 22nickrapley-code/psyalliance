import { Suspense } from "react";
import type { Viewport } from "next";
import { IS_DEMO_SITE, SITE_URL } from "@/lib/env";
import { Live } from "@/app/(site)/_live/live";
import "@/app/(site)/premium.css";
import "./account.css";

// The member's account pages (profile, documents, continuity, credentials,
// notifications, settings, demos and the admin pages), in the workspace's own
// look. Its own root layout, like the workspace: the approved stylesheets load
// verbatim and in their frozen order, then the older pages' design system
// (scoped under .pa, see premium.css), then account.css, which brings those
// pages into the same palette, type and shapes. The pages' own code is not
// changed.

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PsyAlliance",
    template: IS_DEMO_SITE ? "%s | PsyAlliance demo" : "%s | psyalliance.org",
  },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/workspace/assets/favicon.png", type: "image/png" }] },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#203b32",
} as Viewport;

const STYLES = ["styles", "product", "refinements", "home", "pulse", "directions", "polish", "feedback", "hub"];
const V = "13";

export default function AccountRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        {STYLES.map((n) => (
          // eslint-disable-next-line @next/next/no-css-tags
          <link key={n} rel="stylesheet" href={`/workspace/${n}.css?v=${V}`} />
        ))}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        {IS_DEMO_SITE && <link rel="stylesheet" href={`/workspace/sandbox.css?v=${V}`} />}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href={`/workspace/final.css?v=${V}`} />
      </head>
      <body className="account-body">
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
        <Suspense fallback={null}>
          <Live />
        </Suspense>
      </body>
    </html>
  );
}
