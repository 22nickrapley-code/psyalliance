import "../../premium.css";
import { notFound } from "next/navigation";
import PremiumShell from "../../dashboard/premium-shell";
import { buildNavGroups } from "../../dashboard/nav-groups";
import { TOUR_ENABLED } from "@/lib/env";
import { STEPS, PEOPLE, stepIndex } from "../steps";
import { TourFrame } from "../sandbox-frame";

export const metadata = { title: "Guided tour", robots: { index: false, follow: false } };

async function noopSignOut() {
  "use server";
}

export function generateStaticParams() {
  return STEPS.map((s) => ({ step: s.slug }));
}

// One step of the guided tour: the real screen, fictional data, and a bar
// that says whose view this is and what just happened.
export default async function TourStepPage({ params }: { params: Promise<{ step: string }> }) {
  if (!TOUR_ENABLED) notFound();
  const { step } = await params;
  const i = stepIndex(step);
  if (i < 0) notFound();
  const s = STEPS[i];
  const who = PEOPLE[s.perspective];
  const prev = i === 0 ? "/tour" : `/tour/${STEPS[i - 1].slug}`;
  const next = i === STEPS.length - 1 ? "/tour/done" : `/tour/${STEPS[i + 1].slug}`;
  const groups = buildNavGroups({ isAdmin: false, unreadMessages: 1, pendingCoverRequests: s.perspective === "maya" ? 2 : 0, pendingReferrals: 0 });

  return (
    <TourFrame next={next}>
      <div className="pa tour-top">
      <div className="tour-bar" data-tour-nav>
        <div className="tour-bar-inner">
          <span className="tour-count">Step {i + 1} of {STEPS.length}</span>
          <div className="tour-text">
            <b>{s.title}</b>
            <span>{s.what}</span>
          </div>
          <span className={`tour-who ${s.perspective}`} title={who.role}>
            {s.perspective === "maya" ? "Maya's view" : "Alex's view"}
          </span>
          <nav className="tour-nav" aria-label="Tour">
            <a className="btn ghost small-btn" href={prev}>&larr; Back</a>
            <a className="btn small-btn" href={next}>{i === STEPS.length - 1 ? "Finish" : "Next"} &rarr;</a>
          </nav>
        </div>
        <div className="tour-fiction">Fictional people and cases. Nothing on this tour is sent anywhere.</div>
      </div>
      </div>
      <PremiumShell
        groups={groups}
        displayName={who.name}
        initials={who.initials}
        avatarUrl={null}
        verificationLabel="Verified"
        unreadNotifications={1}
        signOutAction={noopSignOut}
      >
        {s.render()}
      </PremiumShell>
    </TourFrame>
  );
}
