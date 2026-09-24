import { createClient } from "@/lib/supabase/server";
import { logProfessionalEvent } from "@/lib/professional-events";
import { raiseNotification } from "@/lib/notifications-v2";

// Canonical Coverage service layer (Master Brief #19-22, Addendum A7 Level
// 1 data only). Plain functions, callable from a server action today and a
// future member-agent tool later without change - same rationale as
// professional-events.ts and relationships.ts.

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
      deepLink: "/dashboard/cover",
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

  // The case's own status (covered / still needs cover) follows its
  // requests in the database (sync_cover_case_status trigger, 0077): the
  // colleague answering can't write the owner's case directly.

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
      deepLink: "/dashboard/cover",
      dedupKey: `coverage_response:${coverageRequestId}`,
      metadata: { coverageRequestId, response },
    });
  }

  return { error: null };
}
