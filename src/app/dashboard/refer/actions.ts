"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseNeed, needToQuery } from "@/lib/need-options";
import { findMatches } from "@/lib/match-engine";
import { identifierError } from "@/lib/deidentify";
import { raiseNotification } from "@/lib/notifications-v2";
import {
  createReferralRequest,
  respondToReferralRequest,
  addReferralAudienceProfiles,
  establishProfessionalConnection,
  closeReferralRequest,
} from "@/lib/referrals-v2";
import { startConversation } from "../messages/actions";

// Refer flow server actions (Product Spec v1, "Refer"):
// Need -> Shortlist -> Review -> Track. Nothing sends until the member
// confirms on the Review step, and every count shown is the real number of
// people who receive it.

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  return { supabase, userId: user.id };
}

function back(path: string, error: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`);
}

export async function sendReferralAction(formData: FormData) {
  const { supabase, userId } = await me();
  const need = parseNeed(
    (k) => (formData.get(k) as string) || null,
    (k) => formData.getAll(k).map(String)
  );
  const picks = formData.getAll("pick").map(String).filter(Boolean);
  const audience = String(formData.get("audience") || "selected") as "selected" | "trusted" | "wider_network";
  const timeframe = String(formData.get("timeframe") || "flexible");
  const notes = String(formData.get("notes") || "").trim() || undefined;
  const reviewPath = `/dashboard/refer/new?${needToQuery(need, { step: "review" })}${picks.map((p) => `&pick=${p}`).join("")}`;

  if (need.focusIds.length === 0 || !need.state) back(reviewPath, "Choose a treatment focus and a state.");
  if (formData.get("deidentified") !== "on") back(reviewPath, "Confirm the referral contains no patient-identifying details.");
  const idErr = identifierError(notes);
  if (idErr) back(reviewPath, idErr);
  if (audience === "selected" && picks.length === 0) back(reviewPath, "Choose at least one colleague, or pick a wider audience.");

  const { requestId, error } = await createReferralRequest(supabase, userId, {
    specialismLookupIds: need.focusIds,
    state: need.state ?? undefined,
    city: need.city ?? undefined,
    insurance: need.insurance ?? undefined,
    ageBand: need.ageBand ?? undefined,
    modality: need.setting ?? undefined,
    languageLookupId: need.languageId ?? undefined,
    timeframe: ["urgent", "within_month", "flexible"].includes(timeframe) ? timeframe : "flexible",
    notes,
    audienceType: audience === "selected" ? "selected" : audience,
  });
  if (error || !requestId) back(reviewPath, error || "Couldn't send the referral.");

  if (audience === "selected") {
    const { error: addErr } = await addReferralAudienceProfiles(supabase, userId, requestId, picks);
    if (addErr) back(`/dashboard/refer/${requestId}`, addErr);
  } else {
    // Trusted: every trusted colleague who fits. Wider: the best matches
    // across the verified network are notified; everyone eligible can see it.
    const { matches } = await findMatches(supabase, userId, { kind: "referral", ...need }, { limit: 25 });
    const recipients = matches.filter((m) => audience === "wider_network" || m.tier === "trusted").map((m) => m.profileId);
    if (recipients.length > 0) {
      await raiseNotification(supabase, {
        eventType: "referral_sent",
        recipientProfileIds: recipients,
        actorProfileId: userId,
        actorType: "member_web",
        summary: "has a referral that matches your practice",
        deepLink: `/dashboard/refer/${requestId}`,
        metadata: { referralRequestId: requestId },
      });
    }
  }

  revalidatePath("/dashboard/refer");
  redirect(`/dashboard/refer/${requestId}?sent=1`);
}

export async function respondReferralAction(formData: FormData) {
  const { supabase, userId } = await me();
  const id = Number(formData.get("referral_request_id"));
  const response = String(formData.get("response") || "") as "interested" | "unavailable" | "question";
  const message = String(formData.get("message") || "").trim() || undefined;
  if (!["interested", "unavailable", "question"].includes(response)) back(`/dashboard/refer/${id}`, "Choose a response.");
  if (response === "question" && !message) back(`/dashboard/refer/${id}`, "Add your question.");
  const idErr = identifierError(message);
  if (idErr) back(`/dashboard/refer/${id}`, idErr);
  const { error } = await respondToReferralRequest(supabase, userId, id, response, message);
  if (error) back(`/dashboard/refer/${id}`, error);
  revalidatePath(`/dashboard/refer/${id}`);
  redirect(`/dashboard/refer/${id}?responded=1`);
}

export async function chooseReferralColleagueAction(formData: FormData) {
  const { supabase, userId } = await me();
  const id = Number(formData.get("referral_request_id"));
  const colleagueId = String(formData.get("responding_profile_id") || "");
  const title = String(formData.get("thread_title") || "Referral handoff");
  const { error } = await establishProfessionalConnection(supabase, userId, id, colleagueId);
  if (error) back(`/dashboard/refer/${id}`, error);
  revalidatePath(`/dashboard/refer/${id}`);
  // Opens (or reuses) the handoff conversation with the chosen colleague.
  const fd = new FormData();
  fd.append("participant_ids", colleagueId);
  fd.append("title", title);
  fd.append("body", "");
  await startConversation(fd);
}

export async function closeReferralAction(formData: FormData) {
  const { supabase, userId } = await me();
  const id = Number(formData.get("referral_request_id"));
  const outcome = String(formData.get("outcome") || "closed");
  const { error } = await closeReferralRequest(
    supabase,
    userId,
    id,
    outcome === "placed" ? "referral placed with a colleague" : "closed a referral without placing it"
  );
  if (error) back(`/dashboard/refer/${id}`, error);
  revalidatePath("/dashboard/refer");
  redirect(`/dashboard/refer/${id}?closed=1`);
}

export async function rateCollaborationAction(formData: FormData) {
  const { supabase, userId } = await me();
  const contextType = String(formData.get("context_type") || "referral");
  const contextId = Number(formData.get("context_id"));
  const colleagueId = String(formData.get("colleague_id") || "");
  const again = formData.get("would_work_again") === "yes";
  const returnTo = String(formData.get("return_to") || "/dashboard");
  await supabase.from("collaboration_ratings").upsert(
    {
      rater_profile_id: userId,
      colleague_profile_id: colleagueId,
      context_type: contextType,
      context_id: contextId,
      would_work_again: again,
    },
    { onConflict: "rater_profile_id,colleague_profile_id,context_type,context_id" }
  );
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}rated=1`);
}
