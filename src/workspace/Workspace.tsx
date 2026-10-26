"use client";
import { useEffect } from "react";
import { REFERENCE_DATA } from "./fixtures/reference-data";

// Mounts the approved workspace engine into the layout's #app element.
export default function Workspace({ mode = "fixture" }: { mode?: "fixture" | "live" }) {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    import("./engine").then(({ startWorkspace }) => {
      if (cancelled) return;
      stop = startWorkspace({ mode, data: REFERENCE_DATA });
    });
    return () => {
      cancelled = true;
      stop?.();
      const app = document.getElementById("app");
      if (app) app.innerHTML = "";
    };
  }, [mode]);
  return null;
}
