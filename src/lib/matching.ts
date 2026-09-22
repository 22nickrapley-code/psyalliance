// Weighted matching engine, per the spec:
//   score = location_tier_points + specialism_rank_points
//   location points: city = 8, state = 6, national = 2
//   specialism rank points: rank 1 = 10, rank 2 = 8, rank 3 = 2 (ranks 4-5, or
//     no rank at all, earn 0 specialism points but the candidate can still
//     surface on location alone)
// Tie-break cascade, applied in order until one side wins:
//   1. relationship tier (Partner > Bench > Recommended > none)
//   2. highest speciality rating (lowest rank number = highest rating)
//   3. most community endorsements
//   4. most recent last-active timestamp
//   5. alphabetical by name

export type LocationTier = "city" | "state" | "national";
// "partner" stays a legal value only for any stray pre-rebuild row the
// relabel migration didn't touch (declined/pending at the time) - every
// write path now uses trusted_colleague. Both rank identically.
export type ConnectionTier = "partner" | "trusted_colleague" | "bench" | "recommended" | "none";

const LOCATION_POINTS: Record<LocationTier, number> = { city: 8, state: 6, national: 2 };
const SPECIALISM_RANK_POINTS: Record<number, number> = { 1: 10, 2: 8, 3: 2 };
const TIER_ORDER: Record<ConnectionTier, number> = { partner: 3, trusted_colleague: 3, bench: 2, recommended: 1, none: 0 };

export interface MatchCandidate {
  profileId: string;
  fullName: string;
  city: string | null;
  state: string | null;
  specialismRank: number | null;
  connectionTier: ConnectionTier;
  endorsementScore: number;
  lastActiveAt: string | null;
  psypactParticipating?: boolean;
}

export interface ScoredCandidate extends MatchCandidate {
  score: number;
  locationTier: LocationTier;
  locationPoints: number;
  specialismPoints: number;
}

export function scoreCandidate(
  candidate: MatchCandidate,
  need: { city?: string | null; state?: string | null }
): ScoredCandidate {
  let locationTier: LocationTier;
  if (need.city && candidate.city && need.city.trim().toLowerCase() === candidate.city.trim().toLowerCase()) {
    locationTier = "city";
  } else if (need.state && candidate.state && need.state.trim().toLowerCase() === candidate.state.trim().toLowerCase()) {
    locationTier = "state";
  } else {
    locationTier = "national";
  }
  const locationPoints = LOCATION_POINTS[locationTier];
  const specialismPoints =
    candidate.specialismRank != null ? SPECIALISM_RANK_POINTS[candidate.specialismRank] ?? 0 : 0;

  return {
    ...candidate,
    locationTier,
    locationPoints,
    specialismPoints,
    score: locationPoints + specialismPoints,
  };
}

export function rankCandidates(
  candidates: MatchCandidate[],
  need: { city?: string | null; state?: string | null }
): ScoredCandidate[] {
  return candidates
    .map((c) => scoreCandidate(c, need))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const tierDiff = TIER_ORDER[b.connectionTier] - TIER_ORDER[a.connectionTier];
      if (tierDiff !== 0) return tierDiff;

      const rankA = a.specialismRank ?? 99;
      const rankB = b.specialismRank ?? 99;
      if (rankA !== rankB) return rankA - rankB;

      if (b.endorsementScore !== a.endorsementScore) return b.endorsementScore - a.endorsementScore;

      const lastA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
      const lastB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
      if (lastB !== lastA) return lastB - lastA;

      return a.fullName.localeCompare(b.fullName);
    });
}

// --- Match Grid scoring, per Nick's supplied "Matching sequence" rules ---
// Used by Caseload Quick Match, the Planner recommendation table, and the
// Single Patient Referral tool. Kept separate from rankCandidates() above,
// which continues to power the existing coverage-plan flow unchanged.
//
// Sequence:
//   1. Rule out candidates not qualified for the client's state (in-state,
//      or PSYPACT-participating for cross-state telehealth authority) and
//      candidates who don't offer the client's session type.
//   2. Score the remainder on the Match Grid: relationship tier (Partner=3
//      / Bench=2 / Recommended=1 / none=0) + (6 - specialty rating), where
//      specialty rating is the candidate's own 1 (best) - 5 (worst) rank
//      for that treatment need. Range: 2 (Recommended, rank 5) - 8
//      (Partner, rank 1), matching Nick's supplied grid.
//   3. Tie-break, in order: relationship tier, then specialty rating, then
//      most community endorsements, then most recent last-active, then
//      alphabetical by name.
const GRID_TIER_VALUE: Record<ConnectionTier, number> = { partner: 3, trusted_colleague: 3, bench: 2, recommended: 1, none: 0 };

export interface GridCandidate {
  profileId: string;
  fullName: string;
  connectionTier: ConnectionTier;
  specialtyRank: number | null; // 1 (best) - 5 (worst); null = unranked for this need
  endorsementScore: number;
  lastActiveAt: string | null;
  qualifiedForState: boolean;
  sessionTypeMatch: boolean;
  meta?: Record<string, unknown>;
}

export interface GridScoredCandidate extends GridCandidate {
  gridScore: number;
}

export function computeGridScore(tier: ConnectionTier, specialtyRank: number | null): number {
  const rank = specialtyRank != null ? Math.min(5, Math.max(1, specialtyRank)) : 5;
  return GRID_TIER_VALUE[tier] + (6 - rank);
}

export function rankCandidatesByGrid(candidates: GridCandidate[]): GridScoredCandidate[] {
  return candidates
    .filter((c) => c.qualifiedForState && c.sessionTypeMatch)
    .map((c) => ({ ...c, gridScore: computeGridScore(c.connectionTier, c.specialtyRank) }))
    .sort((a, b) => {
      if (b.gridScore !== a.gridScore) return b.gridScore - a.gridScore;

      const tierDiff = GRID_TIER_VALUE[b.connectionTier] - GRID_TIER_VALUE[a.connectionTier];
      if (tierDiff !== 0) return tierDiff;

      const rankA = a.specialtyRank ?? 99;
      const rankB = b.specialtyRank ?? 99;
      if (rankA !== rankB) return rankA - rankB;

      if (b.endorsementScore !== a.endorsementScore) return b.endorsementScore - a.endorsementScore;

      const lastA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
      const lastB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
      if (lastB !== lastA) return lastB - lastA;

      return a.fullName.localeCompare(b.fullName);
    });
}
