"use client";
import { useEffect } from "react";
import { REFERENCE_DATA } from "./fixtures/reference-data";
import { buildLiveEnv, type LiveBoot, type WorkspaceView } from "./adapters/live";
import { workspaceCall } from "./server/actions";

// Mounts the approved workspace engine into the layout's #app element.
// "fixture" runs the approved sample data in the browser (tours, previews,
// visual comparison); "live" runs on the signed-in member's own records.
export default function Workspace({ mode = "fixture", boot, view = "home" }: { mode?: "fixture" | "live"; boot?: LiveBoot; view?: WorkspaceView }) {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    import("./engine").then(({ startWorkspace }) => {
      if (cancelled) return;
      const env = mode === "live" && boot ? { ...buildLiveEnv(boot, view), call: workspaceCall } : { mode: "fixture", data: REFERENCE_DATA, view };
      stop = startWorkspace(env);
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
