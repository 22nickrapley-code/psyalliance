// How long each moment of a demo video lasts. Shared by the player (which
// runs on the page) and the pages that say how long a video is.

// What the person in the video does before the scene's last click: tick
// or choose something, type a short entry, or pick from a dropdown. The
// screen starts without it, so the viewer watches it happen.
export type SceneAction =
  | { do: "pick"; target: string }
  | { do: "type"; target: string; text: string }
  | { do: "select"; target: string; value: string };

// Typing longer than this lands at once, like a paste.
export const TYPE_LIMIT = 80;
export const typeStep = (text: string) => Math.max(18, Math.min(55, 700 / Math.max(1, text.length)));

// Each action: move there, click, a moment to see it. Typing adds the time
// the letters take beyond the first moment.
export function actionMs(a: SceneAction) {
  if (a.do === "type" && a.text.length <= TYPE_LIMIT) return 1800 + Math.max(0, Math.round(typeStep(a.text) * a.text.length) - 600);
  return 1800;
}
export const actionsMs = (actions?: SceneAction[]) => (actions || []).reduce((n, a) => n + actionMs(a), 0);
export const sceneMs = (sc: { seconds?: number; actions?: SceneAction[] }) => (sc.seconds || 8.5) * 1000 + actionsMs(sc.actions);
