import "../../../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { JOURNEYS, findJourney, LEGACY_SLUGS, LEGACY_STEPS } from "@/tour/journeys";
import { DemoStepScreen } from "../../step-screen";

export const metadata = { title: "Demo", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return JOURNEYS.flatMap((d) => d.steps.map((s) => ({ demo: d.key, step: s.slug })));
}

export default async function DemoStepPage({ params }: { params: Promise<{ demo: string; step: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo, step } = await params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/${encodeURIComponent(demo)}/${encodeURIComponent(step)}`);
  const d = findJourney(demo);
  if (!d) redirect(LEGACY_SLUGS[demo] ? `/tour/${LEGACY_SLUGS[demo]}` : "/tour");
  const i = d.steps.findIndex((s) => s.slug === step);
  if (i < 0) {
    // An old step lands on the step that now shows that moment; anything else on the first step.
    const moved = LEGACY_STEPS[`${d.key}/${step}`];
    redirect(`/tour/${d.key}/${moved || d.steps[0].slug}`);
  }
  return <DemoStepScreen demo={d} index={i} />;
}
