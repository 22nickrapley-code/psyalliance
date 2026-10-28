import "../../../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { DEMO_SCRIPTS, findScript } from "@/tour/demo-scripts";
import { Director } from "../../director";

export const metadata = { title: "Example", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return Object.keys(DEMO_SCRIPTS).map((script) => ({ script }));
}

// The demo with nothing around it, for opening over a page inside the app
// ("New to Cover? Watch an example"). "Try it yourself" closes the dialog and
// leaves the member on the real page.
export default async function ExampleEmbed({ params }: { params: Promise<{ script: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { script } = await params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/example/${encodeURIComponent(script)}`);
  const d = findScript(script);
  if (!d) notFound();
  return (
    <div className="pa story-embed director-embed">
      <Director script={d} tryHref={d.tryHref} embed />
    </div>
  );
}
