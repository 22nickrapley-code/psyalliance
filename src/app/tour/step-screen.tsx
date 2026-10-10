import PremiumShell from "../dashboard/premium-shell";
import { JOIN_HREF } from "@/lib/env";
import { buildNavGroups } from "../dashboard/nav-groups";
import { PEOPLE, type Demo } from "./demos";
import { TourFrame } from "./sandbox-frame";

async function noopSignOut() {
  "use server";
}

const ACTIVE: Record<string, string> = {
  cover: "/dashboard/cover",
  refer: "/dashboard/refer",
  consult: "/dashboard/consult",
  home: "/dashboard",
  network: "/dashboard/clinicians",
  colleague: "/dashboard/clinicians",
  messages: "/dashboard/messages",
  credentials: "/dashboard/credentials",
  availability: "/dashboard/availability",
  profile: "/dashboard/profile",
};

// One screen of a demo: the real PsyAlliance screen with fictional data.
// Each step opens with a short card saying whose view this is and what to
// look for; the screen is revealed when the visitor is ready. A colleague's
// view (Maya, Samuel) is drawn in a different colour throughout.
export function DemoStepScreen({ demo, index: i }: { demo: Demo; index: number }) {
  const s = demo.steps[i];
  const who = PEOPLE[s.perspective];
  const base = `/tour/${demo.key}`;
  // Step one goes back to the video of this demo.
  const prev = i === 0 ? (demo.key === "overview" ? "/tour" : base) : `${base}/${demo.steps[i - 1].slug}`;
  const next = i === demo.steps.length - 1 ? `${base}/done` : `${base}/${demo.steps[i + 1].slug}`;
  const last = i === demo.steps.length - 1;
  const colleague = who.colleague;
  const groups = buildNavGroups({ isAdmin: false, unreadMessages: 1, pendingCoverRequests: colleague ? 2 : 0, pendingReferrals: colleague ? 1 : 0 });
  const active = ACTIVE[s.slug] || ACTIVE[demo.key] || "/dashboard";

  return (
    <TourFrame
      next={next}
      focus={s.focus}
      focusIndex={s.focusIndex}
      focusNote={s.focusNote}
      intro={{
        demo: demo.title,
        step: `Step ${i + 1} of ${demo.steps.length}`,
        title: s.title,
        what: s.what,
        who: who.name,
        whoRole: who.role,
        initials: who.initials,
        colleague,
        lookFor: s.focusNote,
        last,
        // Every step opens on the card, so the story is read before the screen.
        show: true,
      }}
    >
      <div className={`pa tour-top${colleague ? " as-colleague" : ""}`}>
        <div className="story-bar" data-tour-nav>
          <div className="story-bar-inner">
            <div className="story-who">
              <span className={`story-initials${colleague ? " colleague" : ""}`} aria-hidden="true">{who.initials}</span>
              <div>
                <span className="story-mode">
                  {demo.title} &middot; Step {i + 1} of {demo.steps.length}
                </span>
                <b>{s.title}</b>
              </div>
            </div>
            <p className="story-what">
              {colleague && <span className="story-switch">You&rsquo;re now viewing {who.name.split(",")[0]}&rsquo;s account</span>}
              {s.what}
            </p>
            <nav className="story-nav" aria-label="Demo">
              <a className="btn ghost-on-dark small-btn" href={prev}>&larr; Back</a>
              <a className="btn ghost-on-dark small-btn" href={next}>{last ? "Finish" : "Skip"} &rarr;</a>
            </nav>
          </div>
          <div className="story-progress" aria-label={`Step ${i + 1} of ${demo.steps.length}`}>
            {demo.steps.map((x, n) => (
              <a key={x.slug} href={`${base}/${x.slug}`} title={x.title} className={`${n < i ? "done" : n === i ? "on" : ""}${PEOPLE[x.perspective].colleague ? " colleague" : ""}`} />
            ))}
          </div>
          <div className="story-fiction">
            <a href="/tour">&larr; All demos</a>
            <span>A read-only preview with fictional people. Nothing is sent.</span>
            <a href={JOIN_HREF}>Create your account &rarr;</a>
          </div>
        </div>
      </div>
      <div className={colleague ? "as-colleague-shell" : undefined}>
        {colleague && (
          <div className="colleague-ribbon" data-tour-nav>
            <span className="ribbon-initials" aria-hidden="true">{who.initials}</span>
            <span>
              <b>{who.name}&rsquo;s account.</b> {who.role}. This is what the request looks like on the other side.
            </span>
          </div>
        )}
        <PremiumShell
          groups={groups}
          displayName={who.name}
          initials={who.initials}
          avatarUrl={who.avatar}
          verificationLabel="Verified"
          unreadNotifications={1}
          signOutAction={noopSignOut}
          activeHref={active}
          homeHref="/tour"
        >
          <div data-tour-screen data-step={`${demo.key}-${s.slug}`}>{s.render()}</div>
        </PremiumShell>
      </div>
      <nav className={`pa story-mobile-nav${colleague ? " colleague" : ""}`} aria-label="Demo steps" data-tour-nav>
        <a className="btn secondary" href={prev}>&larr; Back</a>
        <span>
          <b>Step {i + 1} of {demo.steps.length}</b>
          <small>{colleague ? `${who.name.split(",")[0]}'s view` : demo.title}</small>
        </span>
        <a className="btn" href={next}>{last ? "Finish" : "Next"} &rarr;</a>
      </nav>
    </TourFrame>
  );
}
