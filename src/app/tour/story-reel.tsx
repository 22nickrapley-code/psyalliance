import { findDemo, PEOPLE, type Demo, type DemoStep } from "./demos";
import { StoryPlayer, type Scene, type StoryEnd } from "./story-player";

// The 90-second story, told on the real screens: covering time away and
// referring out (an established practice), receiving referrals and using
// the Library (a practice that's still growing), and how everyone is
// checked. It plays on its own; the hands-on demos follow for anyone who
// wants to try it.

type Beat = { demo: string; slug: string; chapter: string; caption: string; sub: string; seconds?: number; focus?: string | null };

const BEATS: Beat[] = [
  {
    demo: "cover",
    slug: "plan",
    chapter: "Time away",
    caption: "Alex needs six weeks away.",
    sub: "Parental leave starts in November, and three clients need cover. She starts with the dates and the state.",
    seconds: 9,
  },
  {
    demo: "cover",
    slug: "clients",
    chapter: "Time away",
    caption: "Each client is described by need, never by name.",
    sub: "Focus, age group and setting: enough to find the right colleague, nothing that identifies anyone.",
  },
  {
    demo: "cover",
    slug: "matches",
    chapter: "Time away",
    caption: "PsyAlliance suggests colleagues who fit, and says why.",
    sub: "A reviewed license in the client's state, the right focus, recent availability. Her trusted colleagues come first.",
  },
  {
    demo: "cover",
    slug: "covered",
    chapter: "Time away",
    caption: "Colleagues reply, and every client is covered.",
    sub: "Alex chose who was asked, and a client only counts as covered once a colleague has said yes.",
  },
  {
    demo: "refer",
    slug: "shortlist",
    chapter: "Referring out",
    caption: "A client she can't take? A shortlist in seconds.",
    sub: "Colleagues who fit, each with the reason, instead of names from memory.",
  },
  {
    demo: "refer",
    slug: "samuel",
    chapter: "Growing a practice",
    caption: "Building a caseload? Referrals that fit you come to you.",
    sub: "Samuel sees what the client needs and replies in one tap: interested, a question, or not available.",
    seconds: 9,
  },
  {
    demo: "library",
    slug: "template",
    chapter: "Growing a practice",
    caption: "Start from a template, not a blank page.",
    sub: "Leave plans, referral letters, consent and more: twenty templates beside the work they support.",
  },
  {
    demo: "consult",
    slug: "replies",
    chapter: "Asking colleagues",
    caption: "A hard question, answered by people you trust.",
    sub: "De-identified, and shared only with the colleagues you choose.",
  },
  {
    demo: "profile",
    slug: "paste",
    chapter: "Joining",
    caption: "Joining takes a minute.",
    sub: "A new member pastes their Psychology Today profile, practice website or CV into Quick start.",
  },
  {
    demo: "profile",
    slug: "filled",
    chapter: "Joining",
    caption: "Everything fills itself in.",
    sub: "Specialties, approaches, insurance and a short bio, each highlighted to check before saving.",
  },
  {
    demo: "verified",
    slug: "credentials",
    chapter: "Verified",
    caption: "Everyone here is checked by a person.",
    sub: "Each license is reviewed against the state board before anyone is listed or matched.",
    seconds: 8,
    focus: null,
  },
];

export function StoryReel({ tryHref = "#try" }: { tryHref?: string }) {
  const steps: { beat: Beat; step: DemoStep }[] = BEATS.map((beat) => ({
    beat,
    step: findDemo(beat.demo)!.steps.find((x) => x.slug === beat.slug)!,
  })).filter((x) => !!x.step);
  const scenes: Scene[] = steps.map(({ beat, step }) => {
    const who = PEOPLE[step.perspective];
    return {
      chapter: beat.chapter,
      caption: beat.caption,
      sub: beat.sub,
      seconds: beat.seconds,
      who: { name: who.name, initials: who.initials, colleague: who.colleague },
      focus: beat.focus === null ? undefined : beat.focus || step.focus,
      focusIndex: step.focusIndex,
    };
  });
  return (
    <StoryPlayer scenes={scenes} tryHref={tryHref}>
      {steps.map(({ beat, step }) => (
        <div key={`${beat.demo}-${beat.slug}`} className="sp-page">
          {step.render()}
        </div>
      ))}
    </StoryPlayer>
  );
}

// One section's demo as a short film: every screen of that demo in
// order, with the step's own title and explanation as the caption. Each
// scene stays up long enough to read its caption.
export function sceneSeconds(step: Pick<DemoStep, "title" | "what">) {
  const words = `${step.title} ${step.what}`.split(/\s+/).length;
  return Math.round(Math.max(8, Math.min(13, 4.5 + words / 3.4)) * 2) / 2;
}

export function watchLength(demo: Demo) {
  const total = demo.steps.reduce((n, s) => n + sceneSeconds(s), 0);
  if (total < 50) return `${Math.round(total / 5) * 5}-second video`;
  const minutes = Math.round(total / 30) / 2;
  return minutes <= 1 ? "1-minute video" : `${minutes.toString().replace(".5", "½")}-minute video`;
}

export function SectionReel({ demo, tryHref, embed = false }: { demo: Demo; tryHref: string; embed?: boolean }) {
  const scenes: Scene[] = demo.steps.map((step) => {
    const who = PEOPLE[step.perspective];
    return {
      chapter: demo.title,
      caption: step.title,
      sub: step.what,
      seconds: sceneSeconds(step),
      who: { name: who.name, initials: who.initials, colleague: who.colleague },
      focus: step.focus,
      focusIndex: step.focusIndex,
    };
  });
  const end: StoryEnd = embed
    ? { title: demo.outcome, text: "Your turn. The page behind this works the same way.", tryLabel: "Try it yourself" }
    : { title: demo.outcome, text: "Now click through it yourself, on the same screens. Nothing is sent.", tryLabel: "Try it yourself" };
  return (
    <StoryPlayer scenes={scenes} tryHref={tryHref} label={`${demo.title}: an example`} end={end} embed={embed}>
      {demo.steps.map((step) => (
        <div key={step.slug} className="sp-page">
          {step.render()}
        </div>
      ))}
    </StoryPlayer>
  );
}
