import { findDemo, PEOPLE, type DemoStep } from "./demos";
import { StoryPlayer, type Scene } from "./story-player";

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
    slug: "invite",
    chapter: "Time away",
    caption: "Alex chooses who is asked.",
    sub: "Nothing is sent until she has seen exactly who receives each request.",
  },
  {
    demo: "cover",
    slug: "covered",
    chapter: "Time away",
    caption: "Colleagues reply, and every client is covered.",
    sub: "A client only counts as covered once a colleague has said yes.",
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
