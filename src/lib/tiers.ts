// Shared connection-tier lookup, used everywhere a person's name needs to
// be colored/ringed by their relationship to the viewer (Overview, Messages,
// Town Hall, Network, Planner, profile pages). Partner=blue, Bench=purple,
// Recommended=orange (shares a specialism, not yet connected), None=no color.
export type Tier = "partner" | "bench" | "recommended" | "none";

export function buildTierMap(
  connections: Array<{ requester_id: string; addressee_id: string; tier: string; status: string }> | null | undefined,
  myself: string
): Map<string, Tier> {
  const map = new Map<string, Tier>();
  for (const c of connections || []) {
    if (c.status !== "accepted") continue;
    const otherId = c.requester_id === myself ? c.addressee_id : c.requester_id;
    map.set(otherId, c.tier as Tier);
  }
  return map;
}

// Ranks a set of candidate {id, sharedSpecialismCount, lastActiveAt} by
// overlap first, then recent activity - "top 5, and they rotate" per Nick's
// spec: not a fixed list, it's recomputed from live data every time, so who
// makes the cut shifts as people update their specialisms or come back
// online, without needing any actual randomization.
export function rankRecommended<T extends { sharedCount: number; lastActiveAt?: string | null }>(
  candidates: T[],
  limit = 5
): T[] {
  return [...candidates]
    .sort((a, b) => {
      if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
      const aT = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
      const bT = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
      return bT - aT;
    })
    .slice(0, limit);
}
