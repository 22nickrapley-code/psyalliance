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
  coveragePlanCaseId: number
): Promise<SuggestedClinician[]> {
  const { data: coverageCase } = await supabase
    .from("coverage_plan_cases")
    .select("specialism_lookup_ids, coverage_plan_id, coverage_plans(profile_id)")
    .eq("id", coveragePlanCaseId)
    .maybeSingle();
  if (!coverageCase) return [];

  const ownerProfileId = (coverageCase as any).coverage_plans?.profile_id as string | undefined;
  if (!ownerProfileId) return [];

  const { data: owner } = await supabase
    .from("profiles")
    .select("primary_state, states_qualified")
    .eq("id", ownerProfileId)
    .maybeSingle();
  const relevantStates = owner?.states_qualified?.length ? owner.states_qualified : owner?.primary_state ? [owner.primary_state] : [];

  const { data: excluded } = await supabase
    .from("do_not_work_with")
    .select("blocked_profile_id")
    .eq("profile_id", ownerProfileId);
  const excludedIds = new Set((excluded || []).map((e) => e.blocked_profile_id));

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
  if (relevantStates.length > 0) {
    candidatesQuery = candidatesQuery.in("licenses.state", relevantStates);
  }
  const { data: candidates, error } = await candidatesQuery;
  if (error) {
    console.error("suggestCliniciansForCase failed:", error.message);
    return [];
  }

  const specialismIds: number[] = (coverageCase as any).specialism_lookup_ids || [];
  const candidateIds = (candidates || []).map((c: any) => c.id).filter((id: string) => !excludedIds.has(id));
  if (candidateIds.length === 0) return [];

  const [{ data: specialisms }, { data: relationshipRows }, { data: savedRows }, { data: workedWithRows }] = await Promise.all([
    specialismIds.length > 0
      ? supabase.from("profile_lookup_values").select("profile_id, lookup_value_id").in("profile_id", candidateIds).in("lookup_value_id", specialismIds)
      : Promise.resolve({ data: [] as any[] }),
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
  const eligible = (candidates || []).filter(
    (c: any) => !excludedIds.has(c.id) && c.coverage_availability !== "no" && (specialismIds.length === 0 || specialtyMatchIds.has(c.id))
  );

  const results: SuggestedClinician[] = eligible.map((c: any) => {
    const reasons: SuggestedClinician["reasons"] = [];
    if (trustedIds.has(c.id)) reasons.push({ code: "trusted_colleague", label: "Trusted colleague" });
    else if (benchIds.has(c.id)) reasons.push({ code: "bench_colleague", label: "Bench colleague" });
    if (workedWithCount.has(c.id)) reasons.push({ code: "worked_with_before", label: "Worked together before" });
    if (savedIds.has(c.id)) reasons.push({ code: "saved_clinician", label: "Saved clinician" });
    if (specialtyMatchIds.has(c.id)) reasons.push({ code: "specialty_match", label: "Relevant specialty" });
    const licenceState = c.primary_state || relevantStates[0];
    if (licenceState) reasons.push({ code: "licence_on_file", label: `Verified ${licenceState} licence on file` });
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

  await Promise.all([
    supabase.from("coverage_plan_cases").update({ status: "awaiting_response" }).eq("id", coveragePlanCaseId),
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

// The three simple responses Master Brief #22 asks for: "I can help",
// "Can't help", "Message / Discuss first". Updates the case status
// automatically; the caller (Phase 5+ UI) is responsible for surfacing the
// next suggested clinician immediately when the response is "declined".
export async function respondToCoverageRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestedProfileId: string,
  coverageRequestId: number,
  response: "accepted" | "declined" | "discussing"
) {
  const { data: request, error: fetchError } = await supabase
    .from("coverage_requests")
    .select("coverage_plan_case_id, sent_at, requested_profile_id, coverage_plan_cases(coverage_plan_id, coverage_plans(profile_id))")
    .eq("id", coverageRequestId)
    .maybeSingle();
  if (fetchError || !request) return { error: fetchError?.message ?? "Request not found" };
  if (request.requested_profile_id !== requestedProfileId) return { error: "Not your request" };
  const planOwnerId = (request as any).coverage_plan_cases?.coverage_plans?.profile_id as string | undefined;

  const respondedAt = new Date();
  const responseTimeSeconds = Math.round((respondedAt.getTime() - new Date(request.sent_at).getTime()) / 1000);

  const { error } = await supabase
    .from("coverage_requests")
    .update({ status: response, responded_at: respondedAt.toISOString() })
    .eq("id", coverageRequestId);
  if (error) return { error: error.message };

  const caseUpdates: Record<string, unknown> = {};
  if (response === "accepted") {
    caseUpdates.status = "confirmed";
    caseUpdates.assigned_clinician_id = requestedProfileId;
  } else if (response === "declined") {
    // Left as 'awaiting_response' if other outreach is still pending -
    // Phase 5+ UI logic decides whether to flip back to 'needs_cover'.
  }
  if (Object.keys(caseUpdates).length > 0) {
    await supabase.from("coverage_plan_cases").update(caseUpdates).eq("id", request.coverage_plan_case_id);
  }

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
      metadata: { coverageRequestId, coveragePlanCaseId: request.coverage_plan_case_id },
    });
  }

  if (planOwnerId) {
    await raiseNotification(supabase, {
      eventType: response === "accepted" ? "coverage_confirmed" : "coverage_response",
      recipientProfileIds: [planOwnerId],
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
