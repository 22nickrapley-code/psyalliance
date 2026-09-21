"use client";

import { createContext, useContext, useMemo, useState } from "react";

// Shared highlight state between the Active Clients tables (near the top of
// the page) and the Caseload (Data) section (below Past Clients) - clicking
// a pie slice down in Data highlights the matching clients' rows/cells back
// up in Active Clients. They're too far apart in the page to wire together
// with plain props without threading state through Past Clients as well, so
// this context sits at the top of the page and both sections read from it.
export type NeedArea = "all" | "primary" | "secondary" | "tertiary";

type CaseloadHighlight = {
  area: NeedArea;
  value: string | null;
};

type CaseloadContextValue = {
  highlight: CaseloadHighlight;
  setHighlight: (h: CaseloadHighlight) => void;
  clearHighlight: () => void;
};

const CaseloadContext = createContext<CaseloadContextValue | null>(null);

export function CaseloadProvider({ children }: { children: React.ReactNode }) {
  const [highlight, setHighlightState] = useState<CaseloadHighlight>({ area: "all", value: null });

  const value = useMemo<CaseloadContextValue>(
    () => ({
      highlight,
      setHighlight: (h) => setHighlightState(h),
      clearHighlight: () => setHighlightState({ area: "all", value: null }),
    }),
    [highlight]
  );

  return <CaseloadContext.Provider value={value}>{children}</CaseloadContext.Provider>;
}

export function useCaseloadHighlight() {
  const ctx = useContext(CaseloadContext);
  if (!ctx) throw new Error("useCaseloadHighlight must be used within a CaseloadProvider");
  return ctx;
}

// Does this client's need set match the current highlight selection?
export function matchesHighlight(
  c: { primary_need: string | null; secondary_need: string | null; tertiary_need: string | null },
  highlight: CaseloadHighlight
): boolean {
  if (!highlight.value) return false;
  if (highlight.area === "all" || highlight.area === "primary") {
    if (c.primary_need === highlight.value) return true;
  }
  if (highlight.area === "all" || highlight.area === "secondary") {
    if (c.secondary_need === highlight.value) return true;
  }
  if (highlight.area === "all" || highlight.area === "tertiary") {
    if (c.tertiary_need === highlight.value) return true;
  }
  return false;
}
