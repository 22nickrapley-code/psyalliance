"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

function requestsError(message: string): never {
  redirect(`/dashboard/requests?error=${encodeURIComponent(message)}`);
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
  const startsOn = String(formData.get("starts_on") || "") || undefined;
  const endsOn = String(formData.get("ends_on") || "") || undefined;

  const { error } = await createCoveragePlan(supabase, user.id, { title, planType, startsOn, endsOn });
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
  const specialismId = Number(formData.get("specialism_lookup_id"));

  const { error } = await addCoveragePlanCase(supabase, coveragePlanId, {
    caseReference,
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

export async function respondToCoverageRequestAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const coverageRequestId = Number(formData.get("coverage_request_id"));
  const response = String(formData.get("response") || "") as "accepted" | "declined" | "discussing";

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
  const audienceType = String(formData.get("audience_type") || "wider_network") as "trusted" | "selected" | "wider_network";

  const { error } = await createReferralRequest(supabase, user.id, {
    specialismLookupId: Number.isFinite(specialismId) && specialismId > 0 ? specialismId : undefined,
    state: String(formData.get("state") || "") || undefined,
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
  if (error) requestsError(error);

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
  if (profileIds.length === 0) requestsError("Choose at least one person to send this to");

  const { error } = await addReferralAudienceProfiles(supabase, user.id, referralRequestId, profileIds);
  if (error) requestsError(error);

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
  const message = String(formData.get("message") || "") || undefined;

  const { error } = await respondToReferralRequest(supabase, user.id, referralRequestId, response, message);
  if (error) requestsError(error);

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
  if (error) requestsError(error);

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
  if (error) requestsError(error);

  revalidatePath("/dashboard/requests");
  redirect("/dashboard/requests?tab=referrals");
}
