import { findDemo, PEOPLE, type Demo, type DemoStep } from "./demos";
import { StoryPlayer, type Scene, type StoryEnd } from "./story-player";
import { actionsMs } from "./scene-timing";

// The story of PsyAlliance in about two minutes, told on the real screens:
// covering time away, referring out, referrals coming in, a question to
// colleagues, a template, joining, and how everyone is checked. It plays on
// its own. The step-by-step demos and the sandbox are inside the product,
// for members (Nick, 11 Oct: one story here, the detail once you've joined).

// "act": the scene also shows the person choosing, ticking or typing on
// that screen before the last click.
type Beat = { demo: string; slug: string; chapter: string; caption: string; sub: string; seconds?: number; focus?: string | null; act?: boolean };

// The chapters a link can start from (the homepage's "Watch how" links).
export const STORY_CHAPTERS: Record<string, string> = {
  cover: "Time away",
  refer: "Referring out",
  consult: "Asking colleagues",
  library: "Templates",
  profile: "Joining",
  verified: "Verified",
};

const BEATS: Beat[] = [
  {
    demo: "cover",
    slug: "plan",
    chapter: "Time away",
    caption: "Alex needs six weeks away.",
    sub: "Parental leave starts in November, and three clients need cover. She chooses the kind of absence and the dates.",
    seconds: 9,
    act: true,
  },
  {
    demo: "cover",
    slug: "clients",
    chapter: "Time away",
    caption: "Each client is described by need, never by name.",
    sub: "Focus, age group, setting and the state they're in: enough to find the right colleague, nothing that identifies anyone.",
  },
  {
    demo: "cover",
    slug: "matches",
    chapter: "Time away",
    act: true,
    caption: "PsyAlliance suggests colleagues who fit, and says why.",
    sub: "A reviewed license in the client's state, the right focus, recent availability. Her trusted colleagues come first; she ticks who to ask.",
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
    slug: "need",
    chapter: "Referring out",
    act: true,
    seconds: 7.5,
    caption: "A client she can't take? She starts with what they need.",
    sub: "On Refer, she picks the main need and where the client is. Everything else is optional.",
  },
  {
    demo: "refer",
    slug: "shortlist",
    chapter: "Referring out",
    act: true,
    caption: "A shortlist in seconds, each with a reason.",
    sub: "Colleagues who fit, instead of names from memory. She picks who receives it.",
  },
  {
    demo: "refer",
    slug: "choose",
    chapter: "Referring out",
    caption: "Replies come in, and Alex decides.",
    sub: "Interest isn't acceptance. She chooses Samuel, whom she has worked with before, and they arrange the handoff between them.",
  },
  {
    demo: "refer",
    slug: "samuel",
    chapter: "Growing a practice",
    act: true,
    caption: "Building a caseload? Referrals that fit you come to you.",
    sub: "Samuel sees what the client needs and replies in one step: interested, a question, or not available.",
    seconds: 9,
  },
  {
    demo: "consult",
    slug: "ask",
    chapter: "Asking colleagues",
    act: true,
    caption: "A hard question? Ask the people you trust.",
    sub: "De-identified, and shared only with the colleagues you choose.",
  },
  {
    demo: "consult",
    slug: "replies",
    chapter: "Asking colleagues",
    caption: "Answered by the next day.",
    sub: "Replies come from named, verified colleagues. Alex marks the useful one, privately, and resolves the question.",
  },
  {
    demo: "library",
    slug: "search",
    chapter: "Templates",
    act: true,
    caption: "Start from a template, not a blank page.",
    sub: "Twenty templates for independent practice: leave plans, referral letters, consent and more, beside the work they support.",
  },
  {
    demo: "library",
    slug: "template",
    chapter: "Templates",
    caption: "See what's inside before you save it.",
    sub: "Who it's for, the plan it supports, and whether it has been independently reviewed. A private copy is one click.",
  },
  {
    demo: "profile",
    slug: "paste",
    chapter: "Joining",
    act: true,
    caption: "Joining takes a minute.",
    sub: "A new member pastes their Psychology Today profile, practice website or CV into Quick start.",
  },
  {
    demo: "profile",
    slug: "filled",
    chapter: "Joining",
    caption: "Everything fills itself in.",
    sub: "Specialties, approaches, insurance and a short bio, each marked to check before saving.",
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
  {
    demo: "verified",
    slug: "availability",
    chapter: "Verified",
    act: true,
    caption: "Availability you control.",
    sub: "Green, amber or red for referrals, cover and consults. Colleagues see when you last confirmed it, so nothing stale looks current.",
  },
];

export function StoryReel({ tryHref = "#try", end, chapter }: { tryHref?: string; end?: StoryEnd; chapter?: string | null }) {
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
      actions: beat.act ? step.actions?.slice(0, 1) : undefined,
    };
  });
  const chapterName = chapter ? STORY_CHAPTERS[chapter] : null;
  const startAt = chapterName ? Math.max(0, scenes.findIndex((sc) => sc.chapter === chapterName)) : 0;
  return (
    <StoryPlayer scenes={scenes} tryHref={tryHref} end={end} startAt={startAt}>
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
  const total = demo.steps.reduce((n, s) => n + sceneSeconds(s) + actionsMs(s.actions) / 1000, 0);
  if (total < 50) return `${Math.round(total / 5) * 5}-second video`;
  const minutes = Math.round(total / 30) / 2;
  return minutes <= 1 ? "1-minute video" : `${minutes.toString().replace(".5", "½")}-minute video`;
}

export function SectionReel({ demo, tryHref, embed = false, end: customEnd }: { demo: Demo; tryHref: string; embed?: boolean; end?: StoryEnd }) {
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
      actions: step.actions,
    };
  });
  const end: StoryEnd = customEnd
    ? customEnd
    : embed
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
