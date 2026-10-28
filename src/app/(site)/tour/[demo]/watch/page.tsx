import "../../../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { JOURNEYS, findJourney } from "@/tour/journeys";
import { SectionReel } from "../../story-reel";
import { Director } from "../../director";
import { DEMO_SCRIPTS, findScript } from "@/tour/demo-scripts";

export const metadata = { title: "Example", robots: { index: false, follow: false } };

export function generateStaticParams() {
  const keys = new Set([...JOURNEYS.map((d) => d.key), ...Object.keys(DEMO_SCRIPTS)]);
  keys.delete("overview");
  return [...keys].map((demo) => ({ demo }));
}

// The same short video with nothing around it, for opening over a page
// inside the app ("New to Cover? Watch an example"). "Try it yourself"
// closes it and leaves the member on the real page.
export default async function DemoWatchEmbed({ params }: { params: Promise<{ demo: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo } = await params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/${encodeURIComponent(demo)}/watch`);
  const sc = findScript(demo);
  if (sc && demo !== "overview")
    return (
      <div className="pa story-embed director-embed">
        <Director script={sc} tryHref={sc.tryHref} embed />
      </div>
    );
  const d = findJourney(demo);
  if (!d || d.key === "overview") redirect("/tour");
  return (
    <div className="pa story-embed">
      <SectionReel demo={d} tryHref={`/tour/${d.key}/${d.steps[0].slug}`} embed />
    </div>
  );
}
