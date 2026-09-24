import { createClient } from "@/lib/supabase/server";
import { logProfessionalEvent } from "@/lib/professional-events";
import { raiseNotification } from "@/lib/notifications-v2";

// Canonical Coverage service layer (Master Brief #19-22, Addendum A7 Level
// 1 data only). Plain functions, callable from a server action today and a
// future member-agent tool later without change - same rationale as
// professional-events.ts and relationships.ts.

export type CoverageReasonCode =
  | "trusted_colleague"
  | "bench_colleague"
  | "saved_clinician"
  | "worked_with_before"
  | "specialty_match"
  | "licence_on_file"
  | "available_for_coverage";

export type SuggestedClinician = {
  profileId: string;
  fullName: string;
  credentialPrefix: string | null;
  primaryState: string | null;
  reasons: { code: CoverageReasonCode; label: string }[];
};

// Staged matching (Master Brief #34): hard eligibility -> clinical
// relevance -> operational fit -> relationship -> reliability. Reliability
// is deliberately left out of ordering for now - Addendum A4 requires a
// configurable evidence threshold to exist first, and none has been
// defined yet, so no ranking weight is given to it in V1 (all members
// start neutral). No opaque score is ever computed or returned - only the
// underlying facts, as plain reason codes (Addendum A5: state facts, not a
// legal eligibility conclusion).
export async function suggestCliniciansForCase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coveragePlanCaseId: number,
  // Task #132 (Sept 23 audit): a case that's cycled back to needs_cover
  // after a decline (see respondToCoverageRequest below) shouldn't
  // re-suggest someone who already said no - the legacy Planner's
  // sequential offer never re-asked a candidate either. Pass every
  // profile id already asked for this case (any status) to leave them out
  // of the ranked list entirely, same as do_not_work_with exclusions.
  excludeProfileIds: string[] = []
): Promise<SuggestedClinician[]> {
  const { data: coverageCase } = await supabase
    .from("coverage_plan_cases")
    .select("specialism_lookup_ids, service_state, coverage_plan_id, coverage_plans(profile_id)")
    .eq("id", coveragePlanCaseId)
    .maybeSingle();
  if (!coverageCase) return [];

  const ownerProfileId = (coverageCase as any).coverage_plans?.profile_id as string | undefined;
  if (!ownerProfileId) return [];

  // The patient's state of service is an explicit, non-identifying case
  // requirement. The plan owner's licence states are not a safe proxy.
  const serviceState = (coverageCase as any).service_state as string | null;
  if (!serviceState) return [];

  const { data: excluded } = await supabase
    .from("do_not_work_with")
    .select("blocked_profile_id")
    .eq("profile_id", ownerProfileId);
  const excludedIds = new Set([...(excluded || []).map((e) => e.blocked_profile_id), ...excludeProfileIds]);

  // Hard eligibility: verified members with an active licence in a state
  // the plan owner's patients are in. Clinical relevance: shares at least
  // one specialism with the case, when the case names any.
  let candidatesQuery = supabase
    .from("profiles")
    .select(
      "id, full_name, credential_prefix, primary_state, coverage_availability, availability_confirmed_at, licenses!inner(state, status)"
    )
    .eq("verification_status", "verified")
    .eq("licenses.status", "active")
    .neq("id", ownerProfileId);
  candidatesQuery = candidatesQuery.eq("licenses.state", serviceState);
  const { data: candidates, error } = await candidatesQuery;
  if (error) {
    console.error("suggestCliniciansForCase failed:", error.message);
    throw new Error("Coverage matching is temporarily unavailable");
  }

  const uniqueCandidates = [...new Map((candidates || []).map((candidate: any) => [candidate.id, candidate])).values()] as any[];
  const specialismIds: number[] = (coverageCase as any).specialism_lookup_ids || [];
  const candidateIds = uniqueCandidates.map((c) => c.id).filter((id: string) => !excludedIds.has(id));
  if (candidateIds.length === 0) return [];

  const [specialismResult, relationshipResult, savedResult, workedWithResult] = await Promise.all([
    specialismIds.length > 0
      ? supabase.from("profile_lookup_values").select("profile_id, lookup_value_id").in("profile_id", candidateIds).in("lookup_value_id", specialismIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    // Sept 23 audit finding (task #123): the old grid-based matching engine
    // weighted Bench connections between Trusted Colleague and no
    // relationship at all (TIER_ORDER in src/lib/matching.ts). This staged
    // engine originally checked trusted_colleague only, which silently
    // dropped that signal for anyone still on someone's Bench - fetching
    // both tiers here restores it as a real (lower) relationship signal
    // instead of retiring Bench with a quiet ranking regression.
    supabase
      .from("connections")
      .select("requester_id, addressee_id, tier")
      .in("tier", ["trusted_colleague", "bench"])
      .eq("status", "accepted")
      .or(`requester_id.eq.${ownerProfileId},addressee_id.eq.${ownerProfileId}`),
    supabase.from("saved_clinicians").select("clinician_id").eq("profile_id", ownerProfileId),
    supabase.from("worked_with_before").select("colleague_id, interaction_count").eq("profile_id", ownerProfileId),
  ]);
  if (specialismResult.error || relationshipResult.error || savedResult.error || workedWithResult.error) {
    console.error("Coverage matching context failed", specialismResult.error || relationshipResult.error || savedResult.error || workedWithResult.error);
    throw new Error("Coverage matching is temporarily unavailable");
  }
  const specialisms = specialismResult.data;
  const relationshipRows = relationshipResult.data;
  const savedRows = savedResult.data;
  const workedWithRows = workedWithResult.data;

  const specialtyMatchIds = new Set((specialisms || []).map((s: any) => s.profile_id));
  const trustedIds = new Set(
    (relationshipRows || [])
      .filter((c: any) => c.tier === "trusted_colleague")
      .map((c: any) => (c.requester_id === ownerProfileId ? c.addressee_id : c.requester_id))
  );
  const benchIds = new Set(
    (relationshipRows || [])
      .filter((c: any) => c.tier === "bench")
      .map((c: any) => (c.requester_id === ownerProfileId ? c.addressee_id : c.requester_id))
  );
  const savedIds = new Set((savedRows || []).map((s: any) => s.clinician_id));
  const workedWithCount = new Map((workedWithRows || []).map((w: any) => [w.colleague_id, w.interaction_count as number]));

  // Operational fit: excludes anyone who's said no to coverage requests.
  const eligible = uniqueCandidates.filter(
    (c: any) => !excludedIds.has(c.id) && c.coverage_availability !== "no" && (specialismIds.length === 0 || specialtyMatchIds.has(c.id))
  );

  const results: SuggestedClinician[] = eligible.map((c: any) => {
    const reasons: SuggestedClinician["reasons"] = [];
    if (trustedIds.has(c.id)) reasons.push({ code: "trusted_colleague", label: "Trusted colleague" });
    else if (benchIds.has(c.id)) reasons.push({ code: "bench_colleague", label: "Bench colleague" });
    if (workedWithCount.has(c.id)) reasons.push({ code: "worked_with_before", label: "Worked together before" });
    if (savedIds.has(c.id)) reasons.push({ code: "saved_clinician", label: "Saved clinician" });
    if (specialtyMatchIds.has(c.id)) reasons.push({ code: "specialty_match", label: "Relevant specialty" });
    reasons.push({ code: "licence_on_file", label: `${serviceState} licence listed as active` });
    if (c.coverage_availability === "yes") reasons.push({ code: "available_for_coverage", label: "Available for coverage" });
    return {
      profileId: c.id,
      fullName: c.full_name,
      credentialPrefix: c.credential_prefix,
      primaryState: c.primary_state,
      reasons,
    };
  });

  // Relationship ordering only (Master Brief #34) - reliability
  // deliberately excluded, see comment above. Trusted outranks Bench
  // outranks no relationship, same order the old grid engine used.
  results.sort((a, b) => {
    const rank = (r: SuggestedClinician) =>
      (trustedIds.has(r.profileId) ? 0 : benchIds.has(r.profileId) ? 1 : 2) * 100 +
      (workedWithCount.has(r.profileId) ? 0 : 1) * 10 +
      (savedIds.has(r.profileId) ? 0 : 1);
    return rank(a) - rank(b);
  });

  return results;
}

export async function createCoveragePlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  opts: {
    title: string;
    planType: "reciprocal" | "extended_leave" | "ad_hoc";
    track?: "pause_return" | "covered_continuity" | "temporary_transfer" | "refer_out";
    startsOn?: string;
    endsOn?: string;
    reciprocalPartnerProfileId?: string;
    notes?: string;
  }
) {
  const { data, error } = await supabase
    .from("coverage_plans")
    .insert({
      profile_id: profileId,
      title: opts.title,
      plan_type: opts.planType,
      track: opts.track ?? null,
      starts_on: opts.startsOn ?? null,
      ends_on: opts.endsOn ?? null,
      reciprocal_partner_profile_id: opts.reciprocalPartnerProfileId ?? null,
      notes: opts.notes ?? null,
    })
    .select("id")
    .single();
  return { planId: data?.id ?? null, error: error?.message ?? null };
}

export async function addCoveragePlanCase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coveragePlanId: number,
  opts: {
    caseReference: string;
    serviceState: string;
    specialismLookupIds?: number[];
    ageBand?: string;
    serviceNeeded?: string;
    modality?: string;
    insurance?: string;
    frequency?: string;
  }
) {
  const { data, error } = await supabase
    .from("coverage_plan_cases")
    .insert({
      coverage_plan_id: coveragePlanId,
      case_reference: opts.caseReference,
      service_state: opts.serviceState,
      specialism_lookup_ids: opts.specialismLookupIds ?? [],
      age_band: opts.ageBand ?? null,
      service_needed: opts.serviceNeeded ?? null,
      modality: opts.modality ?? null,
      insurance: opts.insurance ?? null,
      frequency: opts.frequency ?? null,
    })
    .select("id")
    .single();
  return { caseId: data?.id ?? null, error: error?.message ?? null };
}

// Sends (or continues) sequential pre-approved outreach on a case (Master
// Brief #20-21). Call once per clinician being asked; call again with the
// next suggested clinician when one declines ("surface the next suitable
// option immediately").
export async function sendCoverageRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorProfileId: string,
  coveragePlanCaseId: number,
  requestedProfileId: string,
  sequenceOrder: number,
  message?: string
) {
  const { data: coverageCase, error: caseError } = await supabase
    .from("coverage_plan_cases")
    .select("status, coverage_plans!inner(profile_id)")
    .eq("id", coveragePlanCaseId)
    .maybeSingle();
  if (caseError || !coverageCase || (coverageCase as any).coverage_plans?.profile_id !== actorProfileId) {
    return { requestId: null, error: "This coverage case is not yours" };
  }
  if (!["needs_cover", "declined_all"].includes(coverageCase.status)) {
    return { requestId: null, error: "This case is already awaiting a response or confirmed" };
  }

  const [{ data: priorRequests, error: requestsError }, { data: rejections, error: rejectionsError }] = await Promise.all([
    supabase.from("coverage_requests").select("requested_profile_id, status").eq("coverage_plan_case_id", coveragePlanCaseId),
    supabase.from("coverage_case_rejections").select("candidate_profile_id").eq("coverage_plan_case_id", coveragePlanCaseId).eq("profile_id", actorProfileId),
  ]);
  if (requestsError || rejectionsError) return { requestId: null, error: "Could not check earlier outreach for this case" };
  if ((priorRequests || []).some((r) => r.status === "sent" || r.status === "discussing")) {
    return { requestId: null, error: "Wait for the current response before asking another clinician" };
  }
  const excluded = [
    ...(priorRequests || []).map((r) => r.requested_profile_id),
    ...(rejections || []).map((r) => r.candidate_profile_id),
  ];
  let eligible: SuggestedClinician[];
  try {
    eligible = await suggestCliniciansForCase(supabase, coveragePlanCaseId, excluded);
  } catch {
    return { requestId: null, error: "Coverage matching is temporarily unavailable. Try again before sending." };
  }
  if (!eligible.some((candidate) => candidate.profileId === requestedProfileId)) {
    return { requestId: null, error: "That clinician is no longer an eligible match. Review the suggestions again." };
  }
  const { data, error } = await supabase
    .from("coverage_requests")
    .insert({
      coverage_plan_case_id: coveragePlanCaseId,
      requested_profile_id: requestedProfileId,
      sequence_order: sequenceOrder,
      message: message ?? null,
    })
    .select("id")
    .single();
  if (error) return { requestId: null, error: error.message };

  const { error: transitionError } = await supabase
    .from("coverage_plan_cases")
    .update({ status: "awaiting_response" })
    .eq("id", coveragePlanCaseId);
  if (transitionError) return { requestId: data.id, error: "Request sent, but the case status could not be updated. Contact support before retrying." };

  await Promise.all([
    logProfessionalEvent(supabase, {
      eventType: "coverage_request_sent",
      actorProfileId,
      relatedProfileId: requestedProfileId,
      summary: "sent a coverage request",
      metadata: { coveragePlanCaseId, coverageRequestId: data.id },
    }),
    raiseNotification(supabase, {
      eventType: "coverage_request",
      recipientProfileIds: [requestedProfileId],
      actorProfileId,
      actorType: "member_web",
      summary: "sent you a coverage request",
      deepLink: "/dashboard/requests?tab=coverage",
      dedupKey: `coverage_request:${data.id}`,
      metadata: { coveragePlanCaseId, coverageRequestId: data.id },
    }),
  ]);
  return { requestId: data.id, error: null };
}

// The case transition and the response must commit together. The database
// function also checks the actual recipient and rejects stale responses.
export async function respondToCoverageRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestedProfileId: string,
  coverageRequestId: number,
  response: "accepted" | "declined" | "discussing"
) {
  const { data, error } = await supabase.rpc("respond_to_coverage_request", {
    p_request_id: coverageRequestId,
    p_response: response,
  });
  if (error) return { error: error.message };
  const transition = data?.[0];
  if (!transition) return { error: "Could not confirm the coverage response" };
  const responseTimeSeconds = Math.max(0, Math.round((Date.now() - new Date(transition.initial_sent_at).getTime()) / 1000));

  await logProfessionalEvent(supabase, {
    eventType: "coverage_response",
    actorProfileId: requestedProfileId,
    responseTimeSeconds,
    summary: `responded "${response}" to a coverage request`,
    metadata: { coverageRequestId, response },
  });

  if (response === "accepted") {
    await logProfessionalEvent(supabase, {
      eventType: "coverage_confirmed",
      actorProfileId: requestedProfileId,
      metadata: { coverageRequestId, coveragePlanCaseId: transition.coverage_case_id },
    });
  }

  if (transition.owner_profile_id) {
    await raiseNotification(supabase, {
      eventType: response === "accepted" ? "coverage_confirmed" : "coverage_response",
      recipientProfileIds: [transition.owner_profile_id],
      actorProfileId: requestedProfileId,
      actorType: "member_web",
      summary: response === "accepted" ? "confirmed they can cover your case" : `responded "${response}" to your coverage request`,
      deepLink: "/dashboard/requests?tab=coverage",
      dedupKey: `coverage_response:${coverageRequestId}`,
      metadata: { coverageRequestId, response },
    });
  }

  return { error: null };
}
