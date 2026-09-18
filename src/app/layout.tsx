import "./globals.css";
// Self-hosted via @fontsource rather than next/font/google: this bundles the
// font files at build time with no network fetch required, so the build
// can't fail (or silently fall back) because a Google Fonts request was
// blocked — in this dev sandbox or in whatever host ends up building this
// for production.
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

// metadataBase must be a static value (Next.js can't await headers() here),
// so it falls back to the current *.workers.dev URL until a custom domain is
// live - set NEXT_PUBLIC_SITE_URL (see wrangler.jsonc) once it is, so OG
// images/canonical links resolve to the real domain instead.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://psyalliance.workers.dev";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "PsyAlliance — for doctoral-level psychologists & psychiatrists",
    template: "%s — PsyAlliance",
  },
  description:
    "A closed, credential-verified professional network and virtual-practice toolkit exclusively for doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO) — not a public therapist directory. Caseload and practice administration, coverage matching, peer consultation, a shared document library, and a referral network fed by verified colleagues and physicians. Free, forever.",
  keywords: [
    "psychologist network",
    "psychiatrist network",
    "PhD psychologist directory",
    "PsyD referral network",
    "doctoral-level clinician network",
    "practice coverage for psychologists",
    "psychologist caseload management",
    "clinician referral network",
  ],
  openGraph: {
    title: "PsyAlliance — for doctoral-level psychologists & psychiatrists",
    description:
      "A closed, credential-verified network and practice toolkit exclusively for doctoral-level psychologists and psychiatrists — coverage, community, consultation, and referrals. Free, forever.",
    url: siteUrl,
    siteName: "PsyAlliance",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
