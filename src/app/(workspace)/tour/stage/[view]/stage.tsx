"use client";
import { useEffect, useState } from "react";
import Workspace from "@/workspace/Workspace";
import type { WorkspaceView } from "@/workspace/adapters/live";

// The screen a demo plays on: the approved workspace on its fictional sample
// data, opened on a given section. `?m=` names a starting point (the same
// set-ups the demo scenes use) when a chapter should open part-way through.
export default function Stage({ view, id }: { view: WorkspaceView; id: string }) {
  const [macro, setMacro] = useState<string | undefined | null>(null);
  useEffect(() => {
    setMacro(new URLSearchParams(window.location.search).get("m") || undefined);
  }, []);
  if (macro === null) return null;
  return <Workspace mode="fixture" view={view} scene={{ id, macro }} />;
}
