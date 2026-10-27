"use client";
import { useEffect } from "react";
import { REFERENCE_DATA } from "./fixtures/reference-data";
import { buildLiveEnv, type LiveBoot, type WorkspaceView } from "./adapters/live";
import { workspaceCall } from "./server/actions";

// Mounts the approved workspace engine into the layout's #app element.
// "fixture" runs the approved sample data in the browser (tours, previews,
// visual comparison); "live" runs on the signed-in member's own records.
//
// A "scene" is a demo frame: the fixture workspace with nothing saved
// anywhere (it starts from the same sample data every time), opened at a
// given screen by the same clicks a person would make. It tells the page
// around it when it is ready, so a demo player can start its clock then.
export type SceneProps = { id: string; macro?: string };

export default function Workspace({ mode = "fixture", boot, view = "home", scene }: { mode?: "fixture" | "live"; boot?: LiveBoot; view?: WorkspaceView; scene?: SceneProps }) {
  // A demo frame sits inside the player, which may sit inside a dialog. Escape
  // pressed while focus is in the frame never reaches them, so when the frame
  // has nothing of its own to close, it tells its parent.
  useEffect(() => {
    if (!scene || window.parent === window) return;
    // In the video the screen is a show, not something to operate: the player's own script can leave
    // focus inside it, and Escape there must still end the video's dialog rather than close the
    // screen's wizard. On a step page the screen is the member's to use, so an open window takes it first.
    const inVideo = !!window.frameElement?.classList.contains("sp-frame-el");
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (inVideo) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (document.querySelector(".overlay")) return;
      window.parent.postMessage({ type: "pa-scene-escape" }, window.location.origin);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [scene]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    import("./engine").then(async ({ startWorkspace }) => {
      if (cancelled) return;
      const live = mode === "live" && boot;
      const env = live ? { ...buildLiveEnv(boot, view), call: workspaceCall } : { mode: "fixture", data: REFERENCE_DATA, view, ...(scene ? { ephemeral: true } : {}) };
      stop = startWorkspace(env);
      if (!scene) return;
      const tell = (state: "ready" | "error", message?: string) => {
        document.documentElement.dataset.scene = state;
        if (message) document.documentElement.dataset.sceneError = message;
        window.parent?.postMessage({ type: "pa-scene", id: scene.id, state, message }, window.location.origin);
      };
      try {
        const [{ makeUi }, { MACROS, quiet }] = await Promise.all([import("./tour/ui"), import("./tour/macros")]);
        if (scene.macro) {
          const run = MACROS[scene.macro];
          if (!run) throw new Error(`No scene setup called ${scene.macro}`);
          await run(makeUi(document));
        }
        quiet(document);
        // One more frame, so what the frame shows is what has been set up.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (!cancelled) tell("ready");
      } catch (e) {
        if (!cancelled) tell("error", e instanceof Error ? e.message : String(e));
      }
    });
    return () => {
      cancelled = true;
      stop?.();
      const app = document.getElementById("app");
      if (app) app.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  return null;
}
