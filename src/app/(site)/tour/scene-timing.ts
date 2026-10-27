// How long each moment of a demo video lasts. Shared by the player (which
// runs on the page) and the pages that say how long a video is.
import type { SceneAction } from "@/tour/journeys";
export type { SceneAction } from "@/tour/journeys";

// Typing longer than this lands at once, like a paste.
export const TYPE_LIMIT = 80;
export const typeStep = (text: string) => Math.max(18, Math.min(55, 700 / Math.max(1, text.length)));

// Each action: move there, click, a moment to see it. Typing adds the time
// the letters take beyond the first moment.
export function actionMs(a: SceneAction) {
  if (a.do === "scroll") return 2800;
  if (a.do === "type" && a.text.length <= TYPE_LIMIT) return 1800 + Math.max(0, Math.round(typeStep(a.text) * a.text.length) - 600);
  return 1800;
}
export const actionsMs = (actions?: SceneAction[]) => (actions || []).reduce((n, a) => n + actionMs(a), 0);
export const sceneMs = (sc: { seconds?: number; actions?: SceneAction[] }) => (sc.seconds || 8.5) * 1000 + actionsMs(sc.actions);

// A step's reading time follows its words, so a longer explanation stays up
// longer; the person on screen then acts, then the next step.
export function sceneSeconds(step: { title: string; what: string; seconds?: number }) {
  if (step.seconds) return step.seconds;
  const words = `${step.title} ${step.what}`.split(/\s+/).length;
  return Math.round(Math.max(8, Math.min(13, 4.5 + words / 3.4)) * 2) / 2;
}
