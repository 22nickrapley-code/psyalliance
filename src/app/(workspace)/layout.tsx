import Script from "next/script";
import type { Viewport } from "next";
import { IS_DEMO_SITE } from "@/lib/env";

// The member workspace (version 13). Its own root layout so the approved
// stylesheet cascade loads on its own, verbatim and in the frozen order, with
// none of the older site's CSS or web fonts. The font stack is the reference's:
// Inter if installed, else the system UI font. See docs/psyalliance-v13-parity.
export const metadata = {
  title: "PsyAlliance · The Hub",
  description: "The Hub on PsyAlliance. Independent practice, collective strength. Your actions, peer consultation and trusted colleagues.",
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
const V = "16";

export default function WorkspaceRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        {STYLES.map((n) => (
          // eslint-disable-next-line @next/next/no-css-tags
          <link key={n} rel="stylesheet" href={`/workspace/${n}.css?v=${V}`} />
        ))}
        {/* The sandbox's own note, chip and arrival notice: a separate sheet after the approved ones, demo site only. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        {IS_DEMO_SITE && <link rel="stylesheet" href={`/workspace/sandbox.css?v=${V}`} />}
        {/* The final product's own sheet loads last: contrast (D-04), the first-message menu fix, and small pieces for the additions. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href={`/workspace/final.css?v=${V}`} />
        {/* Calm palette: one neutral ground, white cards, thin muted accents. Last, so it wins. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href={`/workspace/calm.css?v=${V}`} />
        {/* Release A: the original restrained palette and the shared type scale. Last, so it wins. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href={`/workspace/restrained.css?v=${V}`} />
      </head>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <div id="app"></div>
        <div id="overlay-root"></div>
        <div id="toast" className="toast" role="status" aria-live="polite"></div>
        <Script src={`/workspace/assets/lucide.min.js?v=${V}`} strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
