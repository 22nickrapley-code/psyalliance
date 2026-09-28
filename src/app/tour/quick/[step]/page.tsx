import "../../../premium.css";
import { notFound } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { QUICK_STEPS } from "../../steps";
import { TourStepScreen } from "../../step-screen";

export const metadata = { title: "Two-minute tour", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return QUICK_STEPS.map((s) => ({ step: s.slug }));
}

// One step of the two-minute tour: the payoff first.
export default async function QuickTourStepPage({ params }: { params: Promise<{ step: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { step } = await params;
  const i = QUICK_STEPS.findIndex((s) => s.slug === step);
  if (i < 0) notFound();
  return <TourStepScreen steps={QUICK_STEPS} index={i} base="/tour/quick" done="/tour/quick/done" quick />;
}
