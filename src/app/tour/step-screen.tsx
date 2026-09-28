import PremiumShell from "../dashboard/premium-shell";
import { buildNavGroups } from "../dashboard/nav-groups";
import { PEOPLE, type TourStep } from "./steps";
import { TourFrame } from "./sandbox-frame";
import { CHAPTERS } from "./story";

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
  needs: "/dashboard/cover",
  matches: "/dashboard/cover",
  invite: "/dashboard/cover",
  respond: "/dashboard/cover",
  covered: "/dashboard/cover",
};

// One step of a tour: the real screen with fictional data, a bar that says
// whose view this is and what just happened, and the one action the step
// is about highlighted on the screen. Used by the full tour and the
// two-minute tour.
export function TourStepScreen({
  steps,
  index: i,
  base,
  done,
  quick,
}: {
  steps: TourStep[];
  index: number;
  base: string;
  done: string;
  quick?: boolean;
}) {
  const s = steps[i];
  const who = PEOPLE[s.perspective];
  const prev = i === 0 ? "/tour" : `${base}/${steps[i - 1].slug}`;
  const next = i === steps.length - 1 ? done : `${base}/${steps[i + 1].slug}`;
  const groups = buildNavGroups({ isAdmin: false, unreadMessages: 1, pendingCoverRequests: s.perspective === "maya" ? 2 : 0, pendingReferrals: 0 });
  const chapterIndex = CHAPTERS.findIndex((c) => c.key === s.chapter);
  const chapter = CHAPTERS[chapterIndex];
  const where = quick ? "Two-minute tour" : `Chapter ${chapterIndex + 1} of ${CHAPTERS.length}: ${chapter.title}`;
  const last = i === steps.length - 1;

  return (
    <TourFrame next={next} focus={s.focus} focusIndex={s.focusIndex} focusNote={s.focusNote}>
      <div className="pa tour-top">
        <div className="story-bar" data-tour-nav>
          <div className="story-bar-inner">
            <div className="story-who">
              <span className={`story-initials ${s.perspective}`} aria-hidden="true">{who.initials}</span>
              <div>
                <span className="story-mode">Story mode &middot; {where}</span>
                <b>{s.title}</b>
              </div>
            </div>
            <p className="story-what">
              {s.perspective === "maya" && <span className="story-switch">Now in Maya&rsquo;s view</span>}
              {s.what}
            </p>
            <nav className="story-nav" aria-label="Tour">
              <a className="btn ghost-on-dark" href={prev}>&larr; Back</a>
              <a className="btn on-dark lg" href={next}>{last ? "Finish the story" : "Next"} &rarr;</a>
            </nav>
          </div>
          <div className="story-progress" aria-label={`Step ${i + 1} of ${steps.length}`}>
            {steps.map((x, n) => (
              <a
                key={x.slug}
                href={`${base}/${x.slug}`}
                title={x.title}
                className={`${n < i ? "done" : n === i ? "on" : ""}${!quick && n > 0 && steps[n - 1].chapter !== x.chapter ? " gap" : ""}`}
              />
            ))}
          </div>
          <div className="story-fiction">
            <span>Step {i + 1} of {steps.length} &middot; a read-only preview with fictional people &middot; nothing is sent</span>
            <a href="/sandbox/request">Explore freely in your own sandbox &rarr;</a>
          </div>
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
        <div data-tour-screen>{s.render()}</div>
      </PremiumShell>
      <nav className="pa story-mobile-nav" aria-label="Tour steps" data-tour-nav>
        <a className="btn secondary" href={prev}>&larr; Back</a>
        <span>
          <b>Step {i + 1} of {steps.length}</b>
          <small>{quick ? "Two-minute tour" : chapter.title}</small>
        </span>
        <a className="btn" href={next}>{last ? "Finish" : "Next"} &rarr;</a>
      </nav>
    </TourFrame>
  );
}
