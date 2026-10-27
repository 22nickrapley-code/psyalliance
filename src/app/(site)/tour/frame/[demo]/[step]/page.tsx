import "../../../../premium.css";
import { notFound, redirect } from "next/navigation";
import PremiumShell from "../../../../dashboard/premium-shell";
import { buildNavGroups } from "../../../../dashboard/nav-groups";
import { TOUR_ENABLED, IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { JOURNEYS, findStep } from "@/tour/journeys";
import { LEGACY_PAGES } from "../../../legacy-pages";
import { FrameGuard } from "../../frame-guard";

export const dynamic = "force-static";
export const metadata = { title: "PsyAlliance demo", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return JOURNEYS.flatMap((j) => j.steps.filter((s) => s.scene.kind === "page").map((s) => ({ demo: j.key, step: s.slug })));
}

async function noopSignOut() {
  "use server";
}

// One screen of a demo that is a page of the product the approved workspace
// does not cover (the license check, profile editing): the product's own
// page, with the same fictional person as the other demos. Nothing here is
// saved or sent.
export default async function PageFrame({ params }: { params: Promise<{ demo: string; step: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { demo, step } = await params;
  if (IS_DEMO_SITE && process.env.NODE_ENV === "production") redirect(`${REAL_SITE_URL}/tour/frame/${encodeURIComponent(demo)}/${encodeURIComponent(step)}`);
  const s = findStep(demo, step);
  if (!s || s.scene.kind !== "page") notFound();
  const page = LEGACY_PAGES[s.scene.page];
  if (!page) notFound();
  const groups = buildNavGroups({ isAdmin: false, unreadMessages: 1, pendingCoverRequests: 0, pendingReferrals: 0 });
  return (
    <div className="pa tour-top">
      <FrameGuard id={`${demo}/${step}`}>
        <PremiumShell
          groups={groups}
          displayName="Rachel Davis, PhD"
          initials="RD"
          avatarUrl={null}
          verificationLabel="Verified"
          unreadNotifications={0}
          signOutAction={noopSignOut}
          activeHref={page.active}
          relationships={null}
          homeHref="/tour"
        >
          {page.render()}
        </PremiumShell>
      </FrameGuard>
    </div>
  );
}
