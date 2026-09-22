import { createClient } from "@/lib/supabase/server";
import { getWorkedWithBefore } from "@/lib/professional-events";

// Canonical service layer for the new relationship model (Master Brief
// #28-30, Addendum A8), replacing Partner/Bench/Recommended. Plain
// functions, no form/page dependency, so Phase 5 (Network UI rebuild) and
// anything else that needs "how does A relate to B" - Coverage suggestions,
// Referral audience pickers, Consult audience pickers - all call the same
// logic instead of each re-deriving it.
//
// Trusted Colleague deliberately isn't reimplemented here: it's still the
// existing `connections` table (tier = 'trusted_colleague' as of the Phase
// 4 migration) and its existing mutual request/accept/decline actions -
// only the label changed, not the mechanic, so those actions are untouched
// for now and get renamed/relabelled in the Phase 5 Network UI pass.

export type RelationshipContext = {
  trustedColleagueStatus: "none" | "pending_sent" | "pending_received" | "accepted";
  saved: boolean;
  excluded: boolean;
  blocked: boolean;
  workedWithBeforeCount: number;
};

export async function getRelationshipContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerProfileId: string,
  otherProfileId: string
): Promise<RelationshipContext> {
  const [{ data: connection }, { data: saved }, { data: exclusion }, workedWith] = await Promise.all([
    supabase
      .from("connections")
      .select("requester_id, status")
      .or(
        `and(requester_id.eq.${viewerProfileId},addressee_id.eq.${otherProfileId}),and(requester_id.eq.${otherProfileId},addressee_id.eq.${viewerProfileId})`
      )
      .eq("tier", "trusted_colleague")
      .maybeSingle(),
    supabase
      .from("saved_clinicians")
      .select("id")
      .eq("profile_id", viewerProfileId)
      .eq("clinician_id", otherProfileId)
      .maybeSingle(),
    supabase
      .from("do_not_work_with")
      .select("block_type")
      .eq("profile_id", viewerProfileId)
      .eq("blocked_profile_id", otherProfileId)
      .maybeSingle(),
    getWorkedWithBefore(supabase, viewerProfileId),
  ]);

  let trustedColleagueStatus: RelationshipContext["trustedColleagueStatus"] = "none";
  if (connection?.status === "accepted") trustedColleagueStatus = "accepted";
  else if (connection?.status === "pending") {
    trustedColleagueStatus = connection.requester_id === viewerProfileId ? "pending_sent" : "pending_received";
  }

  return {
    trustedColleagueStatus,
    saved: Boolean(saved),
    excluded: exclusion?.block_type === "exclude",
    blocked: exclusion?.block_type === "block",
    workedWithBeforeCount: workedWith.find((w) => w.colleagueId === otherProfileId)?.interactionCount ?? 0,
  };
}

// Saved Clinicians: private, unilateral, no notification to the other
// person (Master Brief #28).
export async function saveClinicianRelationship(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  clinicianId: string,
  note?: string
) {
  if (profileId === clinicianId) return { error: "Can't save yourself" };
  const { error } = await supabase
    .from("saved_clinicians")
    .upsert({ profile_id: profileId, clinician_id: clinicianId, note: note ?? null }, { onConflict: "profile_id,clinician_id" });
  return { error: error?.message ?? null };
}

export async function removeSavedClinicianRelationship(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  clinicianId: string
) {
  const { error } = await supabase
    .from("saved_clinicians")
    .delete()
    .eq("profile_id", profileId)
    .eq("clinician_id", clinicianId);
  return { error: error?.message ?? null };
}

// Private Exclude vs. the stronger Block (Master Brief #30, Addendum A8).
// Both remain private, suppress recommendations, never notify the other
// person, and require no explanation - identical mechanic, different
// severity. (Block additionally suppresses incoming contact - that's
// Messages/Network application logic layered on top in a later phase, not
// part of this table.)
export async function setExclusion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  targetProfileId: string,
  blockType: "exclude" | "block"
) {
  if (profileId === targetProfileId) return { error: "Can't exclude yourself" };
  const { error } = await supabase
    .from("do_not_work_with")
    .upsert(
      { profile_id: profileId, blocked_profile_id: targetProfileId, block_type: blockType },
      { onConflict: "profile_id,blocked_profile_id" }
    );
  return { error: error?.message ?? null };
}

export async function clearExclusion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  targetProfileId: string
) {
  const { error } = await supabase
    .from("do_not_work_with")
    .delete()
    .eq("profile_id", profileId)
    .eq("blocked_profile_id", targetProfileId);
  return { error: error?.message ?? null };
}
