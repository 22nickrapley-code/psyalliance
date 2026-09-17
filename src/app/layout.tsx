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

export const metadata = {
  title: "PsyAlliance",
  description:
    "A closed professional network and practice toolkit for PhD/PsyD/EdD psychologists and psychiatrists.",
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
