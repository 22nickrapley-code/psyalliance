import { IS_DEMO_SITE, SITE_URL } from "@/lib/env";
import { Suspense } from "react";
import { Live } from "./_live/live";
import "./globals.css";
// Self-hosted via @fontsource rather than next/font/google: this bundles the
// font files at build time with no network fetch required, so the build
// can't fail (or silently fall back) because a Google Fonts request was
// blocked, in this dev sandbox or in whatever host ends up building this
// for production.
import "./fonts/newsreader.css";
import "./fonts/inter.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

// metadataBase must be a static value (Next.js can't await headers() here),
// so it falls back to the current *.workers.dev URL until a custom domain is
// live - set NEXT_PUBLIC_SITE_URL (see wrangler.jsonc) once it is, so OG
// images/canonical links resolve to the real domain instead.
const siteUrl = SITE_URL;

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "PsyAlliance: a professional network for psychologists and psychiatrists",
    template: IS_DEMO_SITE ? "%s | PsyAlliance demo" : "%s | psyalliance.org",
  },
  description:
    "A closed, credential-reviewed professional network for doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO) in independent practice: cover for time away, considered referrals and peer consultation with verified colleagues. Not a public therapist directory.",
  keywords: [
    "psychologist network",
    "psychiatrist network",
    "PhD psychologist directory",
    "PsyD referral network",
    "doctoral-level clinician network",
    "practice coverage for psychologists",
    "clinician referral network",
  ],
  openGraph: {
    title: "PsyAlliance: independent practice, stronger together",
    description:
      "A closed, credential-reviewed network for doctoral-level psychologists and psychiatrists: cover for time away, considered referrals and peer consultation.",
    url: siteUrl,
    siteName: "psyalliance.org",
    type: "website",
  },
  // The demo site is never indexed.
  robots: {
    index: !IS_DEMO_SITE,
    follow: !IS_DEMO_SITE,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Suspense fallback={null}>
          <Live />
        </Suspense>
      </body>
    </html>
  );
}
