import "../../../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { DEMOS, findDemo } from "../../demos";
import { SectionReel } from "../../story-reel";

export const metadata = { title: "Example", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return DEMOS.filter((d) => d.key !== "overview").map((d) => ({ demo: d.key }));
}

// The same short video with nothing around it, for opening over a page
// inside the app ("New to Cover? Watch an example"). "Try it yourself"
// closes it and leaves the member on the real page.
export default async function DemoWatchEmbed({ params }: { params: Promise<{ demo: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo } = await params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/${encodeURIComponent(demo)}/watch`);
  const d = findDemo(demo);
  if (!d || d.key === "overview") redirect("/tour");
  return (
    <div className="pa story-embed">
      <SectionReel demo={d} tryHref={`/tour/${d.key}/${d.steps[0].slug}`} embed />
    </div>
  );
}
