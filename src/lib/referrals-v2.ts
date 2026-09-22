import { createClient } from "@/lib/supabase/server";
import { logProfessionalEvent } from "@/lib/professional-events";
import { raiseNotification } from "@/lib/notifications-v2";

// Canonical service layer for the rebuilt Referrals lifecycle (Master
// Brief #23-24): Need identified -> Referral sent -> Interested /
// unavailable / question -> Professional connection -> Warm handoff ->
// Closed. Named referrals-v2 rather than replacing referrals/actions.ts
// outright - the existing bulletin-board actions (offerToHelp,
// acceptResponse, etc.) still work on the same tables and are left alone
// until the Phase 5 Referrals/Messages UI pass migrates callers over.

export type ReferralAudience = "trusted" | "selected" | "suggested" | "wider_network";

export type ReferralReasonCode =
  | "trusted_colleague"
  | "saved_clinician"
  | "worked_with_before"
  | "specialty_match"
  | "licence_on_file"
  | "available_for_referrals";

export type SuggestedReferralClinician = {
  profileId: string;
  fullName: string;
  credentialPrefix: string | null;
  primaryState: string | null;
  reasons: { code: ReferralReasonCode; label: string }[];
};

// Master Brief #24's workflow has "Matches found" as its own step between
// "Need identified" and "Referral sent" - this was the one state in that
// chain with no code behind it at all. Deliberately read-only for this
// pass (no schema/RLS change): it surfaces who's a good fit for a request
// the member already posted, using the same staged-matching shape as
// Coverage's suggestCliniciansForCase (hard eligibility -> clinical
// relevance -> relationship ordering; reliability unweighted, same
// Addendum A4 reasoning as Coverage). Sending the request itself still
// goes through the request's own audience_type, same as before - this
// only helps a requester see (and message) the right people faster.
export async function suggestCliniciansForReferral(
  supabase: Awaited<ReturnType<typeof createClient>>,
  referralRequestId: number
): Promise<SuggestedReferralClinician[]> {
  const { data: request } = await supabase
    .from("referral_requests")
    .select("requesting_profile_id, specialism_lookup_id, state")
    .eq("id", referralRequestId)
    .maybeSingle();
  if (!request) return [];

  const { data: excluded } = await supabase
    .from("do_not_work_with")
    .select("blocked_profile_id")
    .eq("profile_id", request.requesting_profile_id);
  const excludedIds = new Set((excluded || []).map((e) => e.blocked_profile_id));

  let candidatesQuery = supabase
    .from("profiles")
    .select("id, full_name, credential_prefix, primary_state, referral_availability, licenses!inner(state, status)")
    .eq("verification_status", "verified")
    .eq("licenses.status", "active")
    .neq("id", request.requesting_profile_id);
  if (request.state) {
    candidatesQuery = candidatesQuery.eq("licenses.state", request.state);
  }
  const { data: candidates, error } = await candidatesQuery;
  if (error) {
    console.error("suggestCliniciansForReferral failed:", error.message);
    return [];
  }

  const candidateIds = (candidates || []).map((c: any) => c.id).filter((id: string) => !excludedIds.has(id));
  if (candidateIds.length === 0) return [];

  const [{ data: specialisms }, { data: trustedRows }, { data: savedRows }, { data: workedWithRows }] = await Promise.all([
    request.specialism_lookup_id
      ? supabase
          .from("profile_lookup_values")
          .select("profile_id, lookup_value_id")
          .in("profile_id", candidateIds)
          .eq("lookup_value_id", request.specialism_lookup_id)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("connections")
      .select("requester_id, addressee_id")
      .eq("tier", "trusted_colleague")
      .eq("status", "accepted")
      .or(`requester_id.eq.${request.requesting_profile_id},addressee_id.eq.${request.requesting_profile_id}`),
    supabase.from("saved_clinicians").select("clinician_id").eq("profile_id", request.requesting_profile_id),
    supabase.from("worked_with_before").select("colleague_id, interaction_count").eq("profile_id", request.requesting_profile_id),
  ]);

  const specialtyMatchIds = new Set((specialisms || []).map((s: any) => s.profile_id));
  const trustedIds = new Set(
    (trustedRows || []).map((c: any) => (c.requester_id === request.requesting_profile_id ? c.addressee_id : c.requester_id))
  );
  const savedIds = new Set((savedRows || []).map((s: any) => s.clinician_id));
  const workedWithCount = new Map((workedWithRows || []).map((w: any) => [w.colleague_id, w.interaction_count as number]));

  const eligible = (candidates || []).filter(
    (c: any) =>
      !excludedIds.has(c.id) &&
      c.referral_availability !== "no" &&
      (!request.specialism_lookup_id || specialtyMatchIds.has(c.id))
  );

  const results: SuggestedReferralClinician[] = eligible.map((c: any) => {
    const reasons: SuggestedReferralClinician["reasons"] = [];
    if (trustedIds.has(c.id)) reasons.push({ code: "trusted_colleague", label: "Trusted colleague" });
    if (workedWithCount.has(c.id)) reasons.push({ code: "worked_with_before", label: "Worked together before" });
    if (savedIds.has(c.id)) reasons.push({ code: "saved_clinician", label: "Saved clinician" });
    if (specialtyMatchIds.has(c.id)) reasons.push({ code: "specialty_match", label: "Relevant specialty" });
    const licenceState = c.primary_state || request.state;
    if (licenceState) reasons.push({ code: "licence_on_file", label: `Verified ${licenceState} licence on file` });
    if (c.referral_availability === "yes") reasons.push({ code: "available_for_referrals", label: "Accepting referrals" });
    return {
      profileId: c.id,
      fullName: c.full_name,
      credentialPrefix: c.credential_prefix,
      primaryState: c.primary_state,
      reasons,
    };
  });

  results.sort((a, b) => {
    const rank = (r: SuggestedReferralClinician) =>
      (trustedIds.has(r.profileId) ? 0 : 1) * 100 + (workedWithCount.has(r.profileId) ? 0 : 1) * 10 + (savedIds.has(r.profileId) ? 0 : 1);
    return rank(a) - rank(b);
  });

  return results.slice(0, 5);
}

export async function createReferralRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestingProfileId: string,
  opts: {
    specialismLookupId?: number;
    state?: string;
    city?: string;
    insurance?: string;
    ageBand?: string;
    modality?: string;
    notes?: string;
    audienceType: ReferralAudience;
    audienceProfileIds?: string[];
  }
) {
  const { data, error } = await supabase
    .from("referral_requests")
    .insert({
      requesting_profile_id: requestingProfileId,
      specialism_lookup_id: opts.specialismLookupId ?? null,
      state: opts.state ?? null,
      city: opts.city ?? null,
      insurance: opts.insurance ?? null,
      age_band: opts.ageBand ?? null,
      modality: opts.modality ?? null,
      notes: opts.notes ?? null,
      audience_type: opts.audienceType,
      audience_profile_ids: opts.audienceType === "selected" ? opts.audienceProfileIds ?? [] : [],
      status: "sent",
    })
    .select("id")
    .single();
  if (error) return { requestId: null, error: error.message };

  await logProfessionalEvent(supabase, {
    eventType: "referral_sent",
    actorProfileId: requestingProfileId,
    specialismLookupIds: opts.specialismLookupId ? [opts.specialismLookupId] : [],
    state: opts.state ?? null,
    summary: "sent a referral request",
    metadata: { referralRequestId: data.id, audienceType: opts.audienceType },
  });

  return { requestId: data.id, error: null };
}

// The three initial response types the Master Brief calls out (#24):
// interested / unavailable / question. A later, separate step moves an
// "interested" response into 'accepted' (Professional connection).
export async function respondToReferralRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  respondingProfileId: string,
  referralRequestId: number,
  response: "interested" | "unavailable" | "question",
  message?: string
) {
  const { error } = await supabase.from("referral_responses").insert({
    referral_request_id: referralRequestId,
    responding_profile_id: respondingProfileId,
    status: response,
    message: message ?? null,
  });
  if (error) return { error: error.message };

  await logProfessionalEvent(supabase, {
    eventType: "referral_response",
    actorProfileId: respondingProfileId,
    summary: `responded "${response}" to a referral request`,
    metadata: { referralRequestId, response },
  });

  const { data: originalRequest } = await supabase
    .from("referral_requests")
    .select("requesting_profile_id")
    .eq("id", referralRequestId)
    .maybeSingle();
  if (originalRequest?.requesting_profile_id) {
    await raiseNotification(supabase, {
      eventType: "referral_response",
      recipientProfileIds: [originalRequest.requesting_profile_id],
      actorProfileId: respondingProfileId,
      actorType: "member_web",
      summary: `responded "${response}" to your referral request`,
      deepLink: "/dashboard/requests?tab=referrals",
      metadata: { referralRequestId, response },
    });
  }

  return { error: null };
}

// Moves a request from "Interested" into "Professional connection" -
// requester picks one interested responder. The other open responses on
// the same request are left as-is (they weren't declined, just not
// chosen); Phase 5+ UI decides how to surface that.
export async function establishProfessionalConnection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestingProfileId: string,
  referralRequestId: number,
  respondingProfileId: string
) {
  const { error } = await supabase
    .from("referral_requests")
    .update({ status: "connected" })
    .eq("id", referralRequestId)
    .eq("requesting_profile_id", requestingProfileId);
  if (error) return { error: error.message };

  await logProfessionalEvent(supabase, {
    eventType: "professional_relationship_created",
    actorProfileId: requestingProfileId,
    relatedProfileId: respondingProfileId,
    summary: "established a professional connection via referral",
    metadata: { referralRequestId },
  });

  await raiseNotification(supabase, {
    eventType: "referral_connected",
    recipientProfileIds: [respondingProfileId],
    actorProfileId: requestingProfileId,
    actorType: "member_web",
    summary: "connected with you on a referral request",
    deepLink: "/dashboard/requests?tab=referrals",
    metadata: { referralRequestId },
  });

  return { error: null };
}

// Warm handoff / transition (Master Brief #24) - deliberately just a
// status flag for V1: the actual handoff content stays outside PsyAlliance
// per the Level 3 data-boundary rule (Addendum A7). This only marks that a
// handoff is under way, never carries patient information.
export async function markReferralHandoff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestingProfileId: string,
  referralRequestId: number
) {
  const { error } = await supabase
    .from("referral_requests")
    .update({ status: "handoff" })
    .eq("id", referralRequestId)
    .eq("requesting_profile_id", requestingProfileId);
  return { error: error?.message ?? null };
}

export async function closeReferralRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestingProfileId: string,
  referralRequestId: number,
  outcome?: string
) {
  const { error } = await supabase
    .from("referral_requests")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", referralRequestId)
    .eq("requesting_profile_id", requestingProfileId);
  if (error) return { error: error.message };

  await logProfessionalEvent(supabase, {
    eventType: "referral_outcome",
    actorProfileId: requestingProfileId,
    summary: outcome ?? "closed a referral request",
    metadata: { referralRequestId },
  });

  return { error: null };
}
