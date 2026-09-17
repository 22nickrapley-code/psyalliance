import type { SupabaseClient } from "@supabase/supabase-js";
import { rankCandidates, type ConnectionTier, type MatchCandidate } from "@/lib/matching";

// Server-only helper: given a practitioner's own id and a coverage need
// (specialism + location + session type), return the ranked list of
// verified colleague candidates using the same weighted matching engine
// used on the Referrals page - shared here so Planner can reuse it when
// auto-drafting offers and cascading to the next candidate on a decline.
export async function computeRankedCandidates(
  supabase: SupabaseClient,
  requesterId: string,
  need: { specialismValue: string | null; city: string | null; state: string | null; sessionType: string | null },
  excludeProfileIds: string[] = []
): Promise<Array<ReturnType<typeof rankCandidates>[number] & { acceptingReferrals: boolean }>> {
  const [{ data: directoryRows }, { data: connections }, { data: scores }, { data: blocklist }] = await Promise.all([
    supabase.from("public_directory").select("*"),
    supabase
      .from("connections")
      .select("requester_id, addressee_id, tier, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${requesterId},addressee_id.eq.${requesterId}`),
    supabase.from("community_endorsement_scores").select("profile_id, score"),
    supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", requesterId),
  ]);

  const excludeSet = new Set([requesterId, ...excludeProfileIds]);
  const blockedIds = new Set((blocklist || []).map((b: any) => b.blocked_profile_id));
  const scoreById = new Map((scores || []).map((s: any) => [s.profile_id, s.score as number]));
  const tierByOtherId = new Map<string, ConnectionTier>();
  for (const c of connections || []) {
    const otherId = c.requester_id === requesterId ? c.addressee_id : c.requester_id;
    tierByOtherId.set(otherId, c.tier as ConnectionTier);
  }

  type Person = {
    id: string;
    full_name: string;
    credential_prefix: string | null;
    primary_practice_city: string | null;
    primary_state: string | null;
    accepting_referrals: boolean;
    last_active_at: string | null;
    psypact_participating: boolean;
    specialismRankByValue: Map<string, number>;
    sessionTypes: Set<string>;
  };
  const people = new Map<string, Person>();
  for (const row of directoryRows || []) {
    if (excludeSet.has(row.id) || blockedIds.has(row.id)) continue;
    if (!people.has(row.id)) {
      people.set(row.id, {
        id: row.id,
        full_name: row.full_name,
        credential_prefix: row.credential_prefix,
        primary_practice_city: row.primary_practice_city,
        primary_state: row.primary_state,
        accepting_referrals: row.accepting_referrals,
        last_active_at: row.last_active_at,
        psypact_participating: row.psypact_participating,
        specialismRankByValue: new Map(),
        sessionTypes: new Set(),
      });
    }
    const person = people.get(row.id)!;
    if (row.category === "treatment_specialism" && row.rank != null) {
      person.specialismRankByValue.set(row.value, row.rank);
    }
    if (row.category === "session_type") {
      person.sessionTypes.add(row.value);
    }
  }

  const candidates: MatchCandidate[] = Array.from(people.values())
    .filter((p) => p.accepting_referrals)
    .filter((p) => !need.sessionType || p.sessionTypes.size === 0 || p.sessionTypes.has(need.sessionType))
    .map((p) => ({
      profileId: p.id,
      fullName: `${p.credential_prefix || ""} ${p.full_name}`.trim(),
      city: p.primary_practice_city,
      state: p.primary_state,
      specialismRank: need.specialismValue ? p.specialismRankByValue.get(need.specialismValue) ?? null : null,
      connectionTier: tierByOtherId.get(p.id) ?? "none",
      endorsementScore: scoreById.get(p.id) || 0,
      lastActiveAt: p.last_active_at,
      psypactParticipating: p.psypact_participating,
    }));

  const ranked = rankCandidates(candidates, { city: need.city, state: need.state });
  const acceptingById = new Map(Array.from(people.values()).map((p) => [p.id, p.accepting_referrals]));
  return ranked.map((c) => ({ ...c, acceptingReferrals: acceptingById.get(c.profileId) ?? true }));
}

export function draftCoverageMessage(params: {
  requesterName: string;
  hasPriorRelationship: boolean;
  specialismSummary: string;
  startDate: string;
  endDate: string;
}): string {
  const greetingRelationship = params.hasPriorRelationship
    ? "we've worked together before"
    : "we've not partnered together previously, but I have a client I'd like to speak with you about";
  return (
    `Hi, ${greetingRelationship}. I'm looking for coverage on ${params.specialismSummary} ` +
    `between ${params.startDate} and ${params.endDate}. Please reply if you'd like to discuss further. ` +
    `Regards, ${params.requesterName}`
  );
}
