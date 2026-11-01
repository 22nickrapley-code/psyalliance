import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { JOURNEYS, findJourney } from "@/tour/journeys";

export const metadata = { title: "Demo", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return JOURNEYS.map((d) => ({ demo: d.key }));
}

// The end of the old "try it yourself" path. Public visitors now only watch (Nick, 1 Nov), so this lands on the demo.
export default async function DemoDonePage({ params }: { params: Promise<{ demo: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo } = await params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/${encodeURIComponent(demo)}`);
  const d = findJourney(demo);
  redirect(d ? `/tour/${d.key}` : "/tour");
}
