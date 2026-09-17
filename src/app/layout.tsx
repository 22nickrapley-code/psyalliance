import "./globals.css";

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
