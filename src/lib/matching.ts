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
export type ConnectionTier = "partner" | "bench" | "recommended" | "none";

const LOCATION_POINTS: Record<LocationTier, number> = { city: 8, state: 6, national: 2 };
const SPECIALISM_RANK_POINTS: Record<number, number> = { 1: 10, 2: 8, 3: 2 };
const TIER_ORDER: Record<ConnectionTier, number> = { partner: 3, bench: 2, recommended: 1, none: 0 };

export interface MatchCandidate {
  profileId: string;
  fullName: string;
  city: string | null;
  state: string | null;
  specialismRank: number | null;
  connectionTier: ConnectionTier;
  endorsementScore: number;
  lastActiveAt: string | null;
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
