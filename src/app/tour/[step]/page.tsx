import "../../premium.css";
import { notFound } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { STEPS, stepIndex } from "../steps";
import { TourStepScreen } from "../step-screen";

export const metadata = { title: "Guided tour", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return STEPS.map((s) => ({ step: s.slug }));
}

// One step of the full guided tour.
export default async function TourStepPage({ params }: { params: Promise<{ step: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { step } = await params;
  const i = stepIndex(step);
  if (i < 0) notFound();
  return <TourStepScreen steps={STEPS} index={i} base="/tour" done="/tour/done" />;
}
