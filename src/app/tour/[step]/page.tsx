import "../../premium.css";
import { notFound } from "next/navigation";
import PremiumShell from "../../dashboard/premium-shell";
import { buildNavGroups } from "../../dashboard/nav-groups";
import { TOUR_ENABLED } from "@/lib/env";
import { STEPS, PEOPLE, stepIndex } from "../steps";
import { TourFrame } from "../sandbox-frame";
import { CHAPTERS } from "../story";

export const metadata = { title: "Guided tour", robots: { index: false, follow: false } };

async function noopSignOut() {
  "use server";
}

const ACTIVE: Record<string, string> = {
  profile: "/dashboard/people/alex",
  home: "/dashboard",
  network: "/dashboard/network",
  messages: "/dashboard/messages",
  library: "/dashboard/documents",
  refer: "/dashboard/refer",
  "referral-replies": "/dashboard/refer",
  consult: "/dashboard/consult",
  plan: "/dashboard/cover",
  matches: "/dashboard/cover",
  invite: "/dashboard/cover",
  respond: "/dashboard/cover",
  covered: "/dashboard/cover",
};

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

  const chapterIndex = CHAPTERS.findIndex((c) => c.key === s.chapter);
  const chapter = CHAPTERS[chapterIndex];

  return (
    <TourFrame next={next}>
      <div className="pa tour-top">
        <div className="story-bar" data-tour-nav>
          <div className="story-bar-inner">
            <div className="story-who">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={who.avatar} alt="" />
              <div>
                <span className="story-mode">
                  Story mode &middot; Chapter {chapterIndex + 1} of {CHAPTERS.length}: {chapter.title}
                </span>
                <b>{s.title}</b>
              </div>
            </div>
            <p className="story-what">
              {s.perspective === "maya" && <span className="story-switch">Now in Maya&rsquo;s view</span>}
              {s.what}
            </p>
            <nav className="story-nav" aria-label="Tour">
              <a className="btn ghost-on-dark" href={prev}>&larr; Back</a>
              <a className="btn on-dark lg" href={next}>{i === STEPS.length - 1 ? "Finish the story" : "Next"} &rarr;</a>
            </nav>
          </div>
          <div className="story-progress" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
            {STEPS.map((x, n) => (
              <a
                key={x.slug}
                href={`/tour/${x.slug}`}
                title={x.title}
                className={`${n < i ? "done" : n === i ? "on" : ""}${n > 0 && STEPS[n - 1].chapter !== x.chapter ? " gap" : ""}`}
              />
            ))}
          </div>
          <div className="story-fiction">Step {i + 1} of {STEPS.length} &middot; fictional people and cases &middot; nothing here is sent anywhere</div>
        </div>
      </div>
      <PremiumShell
        groups={groups}
        displayName={who.name}
        initials={who.initials}
        avatarUrl={who.avatar}
        verificationLabel="Verified"
        unreadNotifications={1}
        signOutAction={noopSignOut}
        activeHref={ACTIVE[s.slug] || "/dashboard"}
      >
        {s.render()}
      </PremiumShell>
    </TourFrame>
  );
}
