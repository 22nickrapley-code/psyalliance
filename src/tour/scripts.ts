// Scripted demos: a person's walk through one part of PsyAlliance, played
// on the real screens (the approved workspace on its fictional sample data).
//
// A script is chapters of steps. Each step has a caption and the beats a
// person would do: move the pointer, click, type, choose, tick. The player
// performs them at a human pace with a visible pointer, on one screen that
// stays put, so the video never jumps. Nothing here is a picture of the
// product: a beat names a real control, and a beat that cannot find its
// control fails the demo test, not a visitor's video.
//
// Plain data, no JSX: the player, the pages and the tests all import it.

export type StageView = "home" | "cover" | "referrals" | "consult" | "network" | "messages" | "library";

// "text=Save client" finds a button or link by its words; "#id" and the rest
// are CSS selectors. An optional "@n" (zero-based) picks the nth match.
export type Target = string;

export type Beat =
  | ["click", Target] // move the pointer there and click it
  | ["tick", Target] // a tick box or choice, through its label
  | ["type", Target, string] // click into a field and type
  | ["choose", Target, string] // choose an option in a list
  | ["look", Target] // rest the pointer on something and let it be read
  | ["scroll", Target] // bring something into view
  | ["wait", number] // a pause, in milliseconds
  | ["do", string]; // a control that has no place on screen right now (named data-action)

export type DemoStep = {
  title: string;
  text: string;
  beats: Beat[];
  // Extra seconds to hold the finished screen, for a step that is mostly reading.
  hold?: number;
};

export type DemoChapter = {
  name: string;
  view: StageView;
  // A starting point (see src/workspace/tour/macros.ts) when the chapter
  // should open part-way through, so the video does not repeat itself.
  macro?: string;
  steps: DemoStep[];
};

export type DemoScript = {
  key: string;
  title: string;
  // "Cover", "Referrals": what the in-app note calls the screen.
  what: string;
  blurb: string;
  outcome: string;
  // Where "Try it yourself" goes on a page of its own.
  tryHref: string;
  chapters: DemoChapter[];
};

// ---------------------------------------------------------------- timing
// Shared by the player and by the pages that say how long a demo is.
export const READ_MS = (text: string) => Math.max(2200, Math.min(6500, 1400 + (text.split(/\s+/).length / 3.2) * 1000));

const beatMs = (b: Beat): number => {
  switch (b[0]) {
    case "click":
    case "tick":
    case "choose":
      return 2000;
    case "look":
      return 1600;
    case "type":
      return 1700 + Math.min(2200, b[2].length * 55);
    case "scroll":
      return 900;
    case "wait":
      return b[1];
    default:
      return 400;
  }
};
export const stepMs = (s: DemoStep) => READ_MS(`${s.title} ${s.text}`) + s.beats.reduce((n, b) => n + beatMs(b), 0) + (s.hold || 0) * 1000 + 900;
export const scriptSeconds = (d: DemoScript) => Math.round(d.chapters.reduce((n, c) => n + c.steps.reduce((m, s) => m + stepMs(s), 0), 0) / 1000);
// "75-second", "2-minute": what a note says before someone presses play.
export function lengthLabel(d: DemoScript) {
  const s = scriptSeconds(d);
  if (s < 100) return `${Math.max(30, Math.round(s / 15) * 15)}-second`;
  const m = Math.round(s / 30) / 2;
  return `${String(m).replace(".5", "½")}-minute`;
}
