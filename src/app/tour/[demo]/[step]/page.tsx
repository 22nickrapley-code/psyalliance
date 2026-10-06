import "../../../premium.css";
import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { DEMOS, findDemo } from "../../demos";
import { DemoStepScreen } from "../../step-screen";

export const metadata = { title: "Demo", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return DEMOS.flatMap((d) => d.steps.map((s) => ({ demo: d.key, step: s.slug })));
}

export default async function DemoStepPage({ params }: { params: Promise<{ demo: string; step: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo, step } = await params;
  const d = findDemo(demo);
  if (!d) redirect("/tour");
  const i = d.steps.findIndex((s) => s.slug === step);
  if (i < 0) redirect(`/tour/${d.key}/${d.steps[0].slug}`);
  return <DemoStepScreen demo={d} index={i} />;
}
