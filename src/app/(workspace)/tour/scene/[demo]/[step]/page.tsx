import { notFound, redirect } from "next/navigation";
import Workspace from "@/workspace/Workspace";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { JOURNEYS, findStep } from "@/tour/journeys";
import { FOCUS_CSS } from "@/tour/focus";

// One screen of a demo: the approved workspace on its fictional sample data,
// opened at the screen the step is about. Nothing here is saved or sent, and
// every visitor starts from the same sample. Demos are framed by the player
// (the video), the step pages (click through it yourself) and the Watch
// dialog inside the product.
export const dynamic = "force-static";
export const metadata = { title: "PsyAlliance demo", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return JOURNEYS.flatMap((j) => j.steps.filter((s) => s.scene.kind === "workspace").map((s) => ({ demo: j.key, step: s.slug })));
}

export default async function SceneFrame({ params }: { params: Promise<{ demo: string; step: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo, step } = await params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/scene/${encodeURIComponent(demo)}/${encodeURIComponent(step)}`);
  const s = findStep(demo, step);
  if (!s || s.scene.kind !== "workspace") notFound();
  return (
    <>
      {/* How the player and the step pages point at a control. */}
      <style>{FOCUS_CSS}</style>
      <Workspace mode="fixture" view={s.scene.view} scene={{ id: `${demo}/${step}`, macro: s.scene.macro }} />
    </>
  );
}
