import { US_STATES } from "@/lib/us-states";

// Plain helpers shared by the Cover pages and views (no database access).

// The conversation about one client between the plan's owner and a
// colleague: the same title on both sides, so it is one thread.
export function coverThreadTitle(planTitle: string, reference: string | null, focus: string) {
  const label = (reference || "").trim().replace(/^case\s*(\d+)$/i, "Client $1") || "Client";
  return `Cover · ${planTitle} · ${label} · ${focus}`;
}

export const stateName = (code: string | null | undefined) => (code ? US_STATES.find((s) => s.code === code)?.name || code : null);
