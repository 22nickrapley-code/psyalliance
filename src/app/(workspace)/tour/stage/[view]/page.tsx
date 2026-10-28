import { notFound, redirect } from "next/navigation";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { FOCUS_CSS } from "@/tour/focus";
import type { WorkspaceView } from "@/workspace/adapters/live";
import Stage from "./stage";

// The one screen a scripted demo plays on. The player opens it once per
// chapter and does everything else by clicking and typing on it, so nothing
// here is saved or sent and every viewer starts from the same sample.
export const dynamic = "force-static";
export const metadata = { title: "PsyAlliance demo", robots: { index: false, follow: false } };

const VIEWS: WorkspaceView[] = ["home", "cover", "referrals", "consult", "network", "messages", "library"];
export function generateStaticParams() {
  return VIEWS.map((view) => ({ view }));
}

export default async function StagePage({ params }: { params: Promise<{ view: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { view } = await params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/stage/${encodeURIComponent(view)}`);
  if (!VIEWS.includes(view as WorkspaceView)) notFound();
  return (
    <>
      <style>{FOCUS_CSS}</style>
      <Stage view={view as WorkspaceView} id={`stage/${view}`} />
    </>
  );
}
