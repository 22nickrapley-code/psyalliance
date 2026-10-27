import { findJourney, sceneSrc, type Journey, type Step } from "@/tour/journeys";
import { StoryPlayer, type Scene, type StoryEnd } from "./story-player";
import { actionsMs, sceneSeconds } from "./scene-timing";

// The story of PsyAlliance in about two minutes, told on the real screens:
// covering time away, referring out, asking colleagues, messages, and how
// everyone is checked. It plays on its own. The longer demos and the sandbox
// are inside the product, for members.

// The chapters a link can start from (the homepage's "Watch how" links).
export const STORY_CHAPTERS: Record<string, string> = {
  cover: "Time away",
  referrals: "Referring out",
  refer: "Referring out",
  consult: "Asking colleagues",
  messages: "Messages",
  verified: "Verified",
};

const OVERVIEW_CHAPTER: Record<string, string> = {
  problem: "Time away",
  need: "Time away",
  match: "Time away",
  control: "Time away",
  result: "Time away",
  refer: "Referring out",
  consult: "Asking colleagues",
  messages: "Messages",
  verified: "Verified",
};

const sceneOf = (j: Journey, step: Step, chapter: string): Scene => ({
  id: `${j.key}/${step.slug}`,
  src: sceneSrc(j.key, step.slug, step.scene),
  chapter,
  caption: step.title,
  sub: step.what,
  seconds: sceneSeconds(step),
  focus: step.focus,
  focusIndex: step.focusIndex,
  actions: step.actions,
});

export function StoryReel({ tryHref = "#try", end, chapter }: { tryHref?: string; end?: StoryEnd; chapter?: string | null }) {
  const j = findJourney("overview")!;
  const scenes = j.steps.map((st) => sceneOf(j, st, OVERVIEW_CHAPTER[st.slug] || j.title));
  const chapterName = chapter ? STORY_CHAPTERS[chapter] : null;
  const startAt = chapterName ? Math.max(0, scenes.findIndex((sc) => sc.chapter === chapterName)) : 0;
  return <StoryPlayer scenes={scenes} tryHref={tryHref} end={end} startAt={startAt} label="PsyAlliance in two minutes" />;
}

export function watchLength(j: Journey) {
  const total = j.steps.reduce((n, st) => n + sceneSeconds(st) + actionsMs(st.actions) / 1000, 0);
  if (total < 50) return `${Math.round(total / 5) * 5}-second video`;
  const minutes = Math.round(total / 30) / 2;
  return minutes <= 1 ? "1-minute video" : `${minutes.toString().replace(".5", "½")}-minute video`;
}

// One demo as a short film: every screen of that demo in order, with the
// step's own title and explanation as the caption.
export function SectionReel({ demo, tryHref, embed = false, end: customEnd }: { demo: Journey; tryHref: string; embed?: boolean; end?: StoryEnd }) {
  const scenes = demo.steps.map((st) => sceneOf(demo, st, demo.title));
  const end: StoryEnd = customEnd
    ? customEnd
    : embed
    ? { title: demo.outcome, text: "Your turn. The page behind this works the same way.", tryLabel: "Try it yourself" }
    : { title: demo.outcome, text: "Now click through it yourself, on the same screens. Nothing is sent.", tryLabel: "Try it yourself" };
  return <StoryPlayer scenes={scenes} tryHref={tryHref} label={`${demo.title}: a demo`} end={end} embed={embed} />;
}
