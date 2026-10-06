import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { findDemo, LEGACY } from "../demos";

// /tour/cover opens the first screen of that demo. Links to the old
// single tour (/tour/plan, /tour/quick, /tour/done) land somewhere useful.
export default async function DemoStart({ params }: { params: Promise<{ demo: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo } = await params;
  const d = findDemo(demo);
  if (d) redirect(`/tour/${d.key}/${d.steps[0].slug}`);
  const legacy = LEGACY[demo];
  if (legacy) redirect(`/tour/${legacy}/${findDemo(legacy)!.steps[0].slug}`);
  redirect("/tour");
}
