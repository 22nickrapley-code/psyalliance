"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCoveragePlan, sendCoverageRequest, respondToCoverageRequest } from "@/lib/coverage";
import { logProfessionalEvent } from "@/lib/professional-events";
import { identifierError } from "@/lib/deidentify";
import { startConversation } from "../messages/actions";

// Cover wizard server actions (Product Spec v1, "Cover"):
// Plan -> Needs -> Candidates -> Invite -> Track. Nothing is sent until
// the member confirms on Invite; a case is never "covered" until a
// colleague accepts.

const ABSENCE_TYPES = ["short_planned", "extended_leave", "unexpected", "closing_practice", "reciprocal"] as const;
type AbsenceType = (typeof ABSENCE_TYPES)[number];

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

async function ownPlan(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, planId: number) {
  const { data } = await supabase.from("coverage_plans").select("*").eq("id", planId).eq("profile_id", userId).maybeSingle();
  return data;
}

export async function createPlanAction(formData: FormData) {
  const { supabase, userId } = await me();
  const absence = String(formData.get("absence_type") || "") as AbsenceType;
  const title = String(formData.get("title") || "").trim();
  const startsOn = String(formData.get("starts_on") || "") || undefined;
  const endsOn = String(formData.get("ends_on") || "") || undefined;
  const state = String(formData.get("state") || "") || null;
  if (!ABSENCE_TYPES.includes(absence)) back("/dashboard/cover/new", "Choose the kind of cover you need.");
  if (!title) back("/dashboard/cover/new", "Give the plan a short name, like \"October leave\".");
  const idErr = identifierError(title);
  if (idErr) back("/dashboard/cover/new", idErr);
  if (!state) back("/dashboard/cover/new", "Choose the state your patients are in.");
  if (startsOn && endsOn && endsOn < startsOn) back("/dashboard/cover/new", "The return date is before the first day.");

  const { planId, error } = await createCoveragePlan(supabase, userId, {
    title,
    planType: absence === "extended_leave" ? "extended_leave" : absence === "reciprocal" ? "reciprocal" : "ad_hoc",
    track: absence === "closing_practice" ? "refer_out" : undefined,
    startsOn,
    endsOn,
  });
  if (error || !planId) back("/dashboard/cover/new", error || "Couldn't create the plan.");
  await supabase.from("coverage_plans").update({ absence_type: absence, jurisdiction_state: state }).eq("id", planId);
  redirect(`/dashboard/cover/${planId}?step=needs`);
}

export async function addCaseAction(formData: FormData) {
  const { supabase, userId } = await me();
  const planId = Number(formData.get("plan_id"));
  const plan = await ownPlan(supabase, userId, planId);
  if (!plan) back("/dashboard/cover", "Plan not found.");
  const path = `/dashboard/cover/${planId}?step=needs`;
  const focus = formData.getAll("focus").map(Number).filter((n) => n > 0);
  if (focus.length === 0) back(path, "Choose a treatment focus for this case.");
  const { count } = await supabase.from("coverage_plan_cases").select("id", { count: "exact", head: true }).eq("coverage_plan_id", planId);
  const setting = String(formData.get("setting") || "either");
  const { error } = await supabase.from("coverage_plan_cases").insert({
    coverage_plan_id: planId,
    case_reference: `Case ${(count || 0) + 1}`,
    specialism_lookup_ids: Array.from(new Set(focus)).slice(0, 3),
    age_band: String(formData.get("age") || "") || null,
    modality: ["virtual", "in_person", "either"].includes(setting) ? setting : "either",
    insurance: String(formData.get("insurance") || "") || null,
    frequency: String(formData.get("frequency") || "") || null,
    prescribing_needed: formData.get("prescribing") === "1",
  });
  if (error) back(path, error.message);
  revalidatePath(`/dashboard/cover/${planId}`);
  redirect(path);
}

export async function removeCaseAction(formData: FormData) {
  const { supabase, userId } = await me();
  const planId = Number(formData.get("plan_id"));
  const caseId = Number(formData.get("case_id"));
  if (!(await ownPlan(supabase, userId, planId))) back("/dashboard/cover", "Plan not found.");
  await supabase.from("coverage_plan_cases").delete().eq("id", caseId).eq("coverage_plan_id", planId).eq("status", "needs_cover");
  redirect(`/dashboard/cover/${planId}?step=needs`);
}

export async function notAFitAction(formData: FormData) {
  const { supabase, userId } = await me();
  const planId = Number(formData.get("plan_id"));
  // Sent either as case_id + candidate_id, or as one "caseId:profileId"
  // value from the Candidates step's per-colleague button.
  const packed = String(formData.get("not_fit") || "");
  const caseId = packed ? Number(packed.split(":")[0]) : Number(formData.get("case_id"));
  const candidateId = packed ? packed.split(":")[1] || "" : String(formData.get("candidate_id") || "");
  const returnTo = String(formData.get("return_to") || `/dashboard/cover/${planId}?step=candidates`);
  const { error } = await supabase.from("coverage_case_rejections").insert({
    profile_id: userId,
    coverage_plan_case_id: caseId,
    candidate_profile_id: candidateId,
  });
  if (error && error.code !== "23505") back(returnTo, error.message);
  redirect(returnTo);
}

export async function sendInvitesAction(formData: FormData) {
  const { supabase, userId } = await me();
  const planId = Number(formData.get("plan_id"));
  const plan = await ownPlan(supabase, userId, planId);
  if (!plan) back("/dashboard/cover", "Plan not found.");
  const mode = formData.get("outreach_mode") === "parallel" ? "parallel" : "sequential";
  const message = String(formData.get("message") || "").trim() || undefined;
  const invitePath = `/dashboard/cover/${planId}?step=invite`;
  const idErr = identifierError(message);
  if (idErr) back(invitePath, idErr);
  if (formData.get("reviewed") !== "on") back(invitePath, "Confirm you've reviewed who receives each request.");

  const { data: cases } = await supabase
    .from("coverage_plan_cases")
    .select("id, status")
    .eq("coverage_plan_id", planId)
    .in("status", ["needs_cover", "declined_all"]);
  let sent = 0;
  for (const c of cases || []) {
    const picks = formData.getAll(`pick_${c.id}`).map(String).filter(Boolean);
    if (picks.length === 0) continue;
    const first = mode === "parallel" ? picks : picks.slice(0, 1);
    let order = 1;
    for (const pid of first) {
      const { error } = await sendCoverageRequest(supabase, userId, c.id, pid, order++, message);
      if (!error) sent++;
    }
    await supabase
      .from("coverage_plan_cases")
      .update({ outreach_queue: mode === "sequential" ? picks.slice(1) : [] })
      .eq("id", c.id);
  }
  if (sent === 0) back(invitePath, "Choose at least one colleague for a case before sending.");
  await supabase.from("coverage_plans").update({ status: "active", outreach_mode: mode }).eq("id", planId);
  revalidatePath("/dashboard/cover");
  redirect(`/dashboard/cover/${planId}?step=track&sent=${sent}`);
}

export async function askColleagueAction(formData: FormData) {
  const { supabase, userId } = await me();
  const planId = Number(formData.get("plan_id"));
  const caseId = Number(formData.get("case_id"));
  const candidateId = String(formData.get("candidate_id") || "");
  if (!(await ownPlan(supabase, userId, planId))) back("/dashboard/cover", "Plan not found.");
  const { data: asked } = await supabase.from("coverage_requests").select("id").eq("coverage_plan_case_id", caseId);
  const { error } = await sendCoverageRequest(supabase, userId, caseId, candidateId, (asked || []).length + 1);
  if (error) back(`/dashboard/cover/${planId}?step=track`, error);
  redirect(`/dashboard/cover/${planId}?step=track&sent=1`);
}

export async function respondCoverAction(formData: FormData) {
  const { supabase, userId } = await me();
  const requestId = Number(formData.get("coverage_request_id"));
  const response = String(formData.get("response") || "") as "accepted" | "declined" | "discussing";
  if (!["accepted", "declined", "discussing"].includes(response)) back("/dashboard/cover", "Choose a response.");
  const { error } = await respondToCoverageRequest(supabase, userId, requestId, response);
  if (error) back("/dashboard/cover", error);
  revalidatePath("/dashboard/cover");
  if (response === "discussing") {
    const ownerId = String(formData.get("owner_id") || "");
    const title = String(formData.get("thread_title") || "Cover request");
    if (ownerId) {
      const fd = new FormData();
      fd.append("participant_ids", ownerId);
      fd.append("title", title);
      fd.append("body", "");
      await startConversation(fd);
    }
  }
  redirect(`/dashboard/cover?ok=${encodeURIComponent(response === "accepted" ? "You've accepted. The colleague will be in touch about the handoff." : response === "declined" ? "Declined. Thanks for letting them know." : "Opened a conversation.")}`);
}

export async function completePlanAction(formData: FormData) {
  const { supabase, userId } = await me();
  const planId = Number(formData.get("plan_id"));
  const plan = await ownPlan(supabase, userId, planId);
  if (!plan) back("/dashboard/cover", "Plan not found.");
  const { data: confirmed } = await supabase
    .from("coverage_plan_cases")
    .select("id, assigned_clinician_id")
    .eq("coverage_plan_id", planId)
    .eq("status", "confirmed");
  // Each colleague who covered counts towards Worked with before, for both.
  const colleagues = Array.from(new Set((confirmed || []).map((c: any) => c.assigned_clinician_id).filter(Boolean)));
  for (const colleagueId of colleagues) {
    await logProfessionalEvent(supabase, {
      eventType: "coverage_completed",
      actorProfileId: userId,
      relatedProfileId: colleagueId,
      summary: "completed a cover arrangement",
      metadata: { coveragePlanId: planId },
    });
  }
  await supabase.from("coverage_plans").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", planId);
  revalidatePath("/dashboard/cover");
  redirect(`/dashboard/cover/${planId}?step=track&completed=1`);
}

export async function cancelPlanAction(formData: FormData) {
  const { supabase, userId } = await me();
  const planId = Number(formData.get("plan_id"));
  if (!(await ownPlan(supabase, userId, planId))) back("/dashboard/cover", "Plan not found.");
  await supabase.from("coverage_requests").update({ status: "expired" }).in(
    "coverage_plan_case_id",
    ((await supabase.from("coverage_plan_cases").select("id").eq("coverage_plan_id", planId)).data || []).map((c: any) => c.id)
  ).eq("status", "sent");
  await supabase.from("coverage_plans").update({ status: "cancelled" }).eq("id", planId);
  revalidatePath("/dashboard/cover");
  redirect("/dashboard/cover?ok=Plan%20cancelled.");
}
