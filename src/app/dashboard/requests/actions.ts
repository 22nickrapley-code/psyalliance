"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { US_STATES } from "@/lib/us-states";
import {
  createCoveragePlan,
  addCoveragePlanCase,
  sendCoverageRequest,
  respondToCoverageRequest,
} from "@/lib/coverage";
import {
  createReferralRequest,
  respondToReferralRequest,
  establishProfessionalConnection,
  closeReferralRequest,
  addReferralAudienceProfiles,
} from "@/lib/referrals-v2";

// Server-action wrappers around the Phase 4 Coverage/Referrals service
// layer for the new Requests hub (Phase 5 navigation). Thin by design -
// all the actual logic (matching, event logging, status transitions)
// lives in src/lib/coverage.ts and src/lib/referrals-v2.ts, exactly the
// "canonical service layer, callable independent of UI" the Addendum asks
// for; these just pull the signed-in user and translate form data.

function requestsError(message: string, tab: "coverage" | "referrals" = "coverage"): never {
  redirect(`/dashboard/requests?tab=${tab}&error=${encodeURIComponent(message)}`);
}

export async function createCoveragePlanAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const title = String(formData.get("title") || "").trim();
  if (!title) requestsError("Give the coverage plan a title");
  const planType = String(formData.get("plan_type") || "ad_hoc") as "reciprocal" | "extended_leave" | "ad_hoc";
  if (!["reciprocal", "extended_leave", "ad_hoc"].includes(planType)) requestsError("Choose a valid plan type");
  const startsOn = String(formData.get("starts_on") || "") || undefined;
  const endsOn = String(formData.get("ends_on") || "") || undefined;
  if (startsOn && endsOn && endsOn < startsOn) requestsError("The end date must be after the start date");
  const rawTrack = String(formData.get("track") || "");
  const tracks = ["pause_return", "covered_continuity", "temporary_transfer", "refer_out"] as const;
  if (rawTrack && !tracks.some((item) => item === rawTrack)) requestsError("Choose a valid leave approach");
  if (planType === "extended_leave" && (!startsOn || !endsOn || !rawTrack)) {
    requestsError("Extended leave needs both dates and an approach");
  }
  const reciprocalPartnerProfileId = String(formData.get("reciprocal_partner_profile_id") || "");
  if (planType === "reciprocal") {
    if (!reciprocalPartnerProfileId || reciprocalPartnerProfileId === user.id) requestsError("Choose a trusted reciprocal partner");
    const { data: accepted } = await supabase.from("connections")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .eq("tier", "trusted_colleague")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    if (!accepted?.some((connection) =>
      connection.requester_id === reciprocalPartnerProfileId || connection.addressee_id === reciprocalPartnerProfileId
    )) requestsError("Choose an accepted trusted colleague for reciprocal cover");
  }

  const { error } = await createCoveragePlan(supabase, user.id, {
    title, planType, startsOn, endsOn,
    track: planType === "extended_leave" ? rawTrack as typeof tracks[number] : undefined,
    reciprocalPartnerProfileId: planType === "reciprocal" ? reciprocalPartnerProfileId : undefined,
  });
  if (error) requestsError(error);

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=coverage");
}

export async function addCoveragePlanCaseAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const coveragePlanId = Number(formData.get("coverage_plan_id"));
  const caseReference = String(formData.get("case_reference") || "").trim();
  if (!caseReference) requestsError("Give this case a short private reference");
  const serviceState = String(formData.get("service_state") || "").trim().toUpperCase();
  if (!US_STATES.some((state) => state.code === serviceState)) requestsError("Choose the patient's state of service for licence matching");
  const specialismId = Number(formData.get("specialism_lookup_id"));

  const { error } = await addCoveragePlanCase(supabase, coveragePlanId, {
    caseReference,
    serviceState,
    specialismLookupIds: Number.isFinite(specialismId) && specialismId > 0 ? [specialismId] : [],
    ageBand: String(formData.get("age_band") || "") || undefined,
    modality: String(formData.get("modality") || "") || undefined,
    insurance: String(formData.get("insurance") || "") || undefined,
    frequency: String(formData.get("frequency") || "") || undefined,
  });
  if (error) requestsError(error);

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=coverage");
}

export async function sendCoverageRequestAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const coveragePlanCaseId = Number(formData.get("coverage_plan_case_id"));
  const requestedProfileId = String(formData.get("requested_profile_id") || "");
  const sequenceOrder = Number(formData.get("sequence_order") || 0);

  const { error } = await sendCoverageRequest(supabase, user.id, coveragePlanCaseId, requestedProfileId, sequenceOrder);
  if (error) requestsError(error);

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=coverage");
}

// Task #132 (Sept 23 audit), approved cut: the ported version of the
// legacy Planner's inline "-" reject action (rejectCandidate in
// planner/actions.ts), scoped to a coverage case instead of a caseload
// client. Writes to coverage_case_rejections; suggestCliniciansForCase
// already excludes anything in there via its excludeProfileIds param
// (requests/page.tsx merges this with coverage_requests history before
// calling it), so the rejected candidate simply drops off the ranked list
// and the next-ranked one rotates into view - no separate "cascade" logic
// needed, unlike the legacy grid engine.
export async function rejectCoverageCandidateAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const coveragePlanCaseId = Number(formData.get("coverage_plan_case_id"));
  const candidateProfileId = String(formData.get("candidate_profile_id") || "");
  if (!coveragePlanCaseId || !candidateProfileId) requestsError("Missing case or candidate");

  const { data: coverageCase } = await supabase.from("coverage_plan_cases")
    .select("coverage_plans!inner(profile_id)").eq("id", coveragePlanCaseId).maybeSingle();
  if ((coverageCase as any)?.coverage_plans?.profile_id !== user.id) requestsError("This coverage case is not yours");

  const { error } = await supabase.from("coverage_case_rejections").insert({
    profile_id: user.id,
    coverage_plan_case_id: coveragePlanCaseId,
    candidate_profile_id: candidateProfileId,
  });
  // A repeat click hits the unique constraint - same no-op treatment as
  // the legacy rejectCandidate action.
  if (error && error.code !== "23505") requestsError(error.message);

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=coverage");
}

export async function respondToCoverageRequestAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const coverageRequestId = Number(formData.get("coverage_request_id"));
  const response = String(formData.get("response") || "") as "accepted" | "declined" | "discussing";
  if (!["accepted", "declined", "discussing"].includes(response)) requestsError("Choose a valid response");

  const { error } = await respondToCoverageRequest(supabase, user.id, coverageRequestId, response);
  if (error) requestsError(error);

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=coverage");
}

export async function createReferralRequestAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const specialismId = Number(formData.get("specialism_lookup_id"));
  const languageId = Number(formData.get("language_lookup_id"));
  const sessionTypeId = Number(formData.get("session_type_lookup_id"));
  const requestedState = String(formData.get("state") || "").trim().toUpperCase();
  if (requestedState && !US_STATES.some((state) => state.code === requestedState)) requestsError("Choose a valid state", "referrals");
  const audienceType = String(formData.get("audience_type") || "selected") as "trusted" | "selected" | "wider_network";
  if (!["trusted", "selected", "wider_network"].includes(audienceType)) requestsError("Choose a valid audience", "referrals");
  if (audienceType === "wider_network") {
    const { data: reach, error: reachError } = await supabase.rpc("verified_network_audience_count");
    if (reachError || Number(reach) < 1) requestsError("No active verified clinicians can receive a network-wide request yet", "referrals");
    if (formData.get("confirm_network_audience") !== "on") requestsError("Confirm the network-wide audience before posting", "referrals");
  }

  const { error } = await createReferralRequest(supabase, user.id, {
    specialismLookupId: Number.isFinite(specialismId) && specialismId > 0 ? specialismId : undefined,
    state: requestedState || undefined,
    city: String(formData.get("city") || "") || undefined,
    insurance: String(formData.get("insurance") || "") || undefined,
    ageBand: String(formData.get("age_band") || "") || undefined,
    modality: String(formData.get("modality") || "") || undefined,
    languageLookupId: Number.isFinite(languageId) && languageId > 0 ? languageId : undefined,
    sessionTypeLookupId: Number.isFinite(sessionTypeId) && sessionTypeId > 0 ? sessionTypeId : undefined,
    timeframe: String(formData.get("timeframe") || "") || undefined,
    notes: String(formData.get("notes") || "") || undefined,
    audienceType,
  });
  if (error) requestsError(error, "referrals");

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=referrals");
}

// Master Brief #26's "Selected clinicians" audience - checkboxes on the
// "Matches found" list (requests/page.tsx) submit here under a shared
// "profile_ids" name; FormData.getAll collects every checked value in one
// go. See addReferralAudienceProfiles in referrals-v2.ts for why this is
// additive rather than a replace.
export async function addReferralAudienceProfilesAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const referralRequestId = Number(formData.get("referral_request_id"));
  const profileIds = formData.getAll("profile_ids").map((v) => String(v)).filter(Boolean);
  if (profileIds.length === 0) requestsError("Choose at least one person to send this to", "referrals");

  const { error } = await addReferralAudienceProfiles(supabase, user.id, referralRequestId, profileIds);
  if (error) requestsError(error, "referrals");

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=referrals");
}

export async function respondToReferralRequestAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const referralRequestId = Number(formData.get("referral_request_id"));
  const response = String(formData.get("response") || "") as "interested" | "unavailable" | "question";
  if (!["interested", "unavailable", "question"].includes(response)) requestsError("Choose a valid response", "referrals");
  const message = String(formData.get("message") || "") || undefined;

  const { error } = await respondToReferralRequest(supabase, user.id, referralRequestId, response, message);
  if (error) requestsError(error, "referrals");

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=referrals");
}

export async function establishProfessionalConnectionAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const referralRequestId = Number(formData.get("referral_request_id"));
  const respondingProfileId = String(formData.get("responding_profile_id") || "");

  const { error } = await establishProfessionalConnection(supabase, user.id, referralRequestId, respondingProfileId);
  if (error) requestsError(error, "referrals");

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=referrals");
}

export async function closeReferralRequestAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const referralRequestId = Number(formData.get("referral_request_id"));
  const { error } = await closeReferralRequest(supabase, user.id, referralRequestId);
  if (error) requestsError(error, "referrals");

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=referrals");
}
