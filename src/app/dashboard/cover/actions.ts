"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCoveragePlan, sendCoverageRequest, respondToCoverageRequest } from "@/lib/coverage";
import { logProfessionalEvent } from "@/lib/professional-events";
import { identifierError } from "@/lib/deidentify";
import { postToThread } from "@/lib/threads";

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
  // "Ask for cover" from a colleague's profile: that colleague is asked first.
  const withId = /^[0-9a-f-]{36}$/i.test(String(formData.get("with") || "")) ? String(formData.get("with")) : null;
  // On a problem, come back with everything already chosen (the name is
  // left out only when it is the problem).
  const keep = (withTitle = true) => {
    const q = new URLSearchParams();
    if (withId) q.set("with", withId);
    if (ABSENCE_TYPES.includes(absence)) q.set("absence", absence);
    if (withTitle && title) q.set("title", title.slice(0, 80));
    if (startsOn) q.set("starts", startsOn);
    if (endsOn) q.set("ends", endsOn);
    if (state) q.set("state", state);
    return `/dashboard/cover/new?${q.toString()}`;
  };
  if (!ABSENCE_TYPES.includes(absence)) back(keep(), "Choose the kind of cover you need.");
  if (!title) back(keep(), "Give the plan a short name, like \"October leave\".");
  const idErr = identifierError(title);
  if (idErr) back(`${keep(false)}&fix=title`, idErr);
  if (!state) back(`${keep()}&fix=state`, "Choose the state your clients are in.");
  if (absence !== "closing_practice" && startsOn && endsOn && endsOn < startsOn) back(`${keep()}&fix=ends`, "The return date is before the first day. Change either date.");

  // A second press (or a retry after a lost connection) opens the plan
  // already made rather than making another.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: recent } = await supabase
    .from("coverage_plans")
    .select("id")
    .eq("profile_id", userId)
    .eq("title", title)
    .gte("created_at", since)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.id) redirect(`/dashboard/cover/${recent.id}?step=needs`);

  const { planId, error } = await createCoveragePlan(supabase, userId, {
    title,
    planType: absence === "extended_leave" ? "extended_leave" : absence === "reciprocal" ? "reciprocal" : "ad_hoc",
    track: absence === "closing_practice" ? "refer_out" : undefined,
    startsOn,
    // Closing a practice has no return date.
    endsOn: absence === "closing_practice" ? undefined : endsOn,
  });
  if (error || !planId) back(keep(), error || "Couldn't create the plan. Your choices are kept; try again.");
  await supabase.from("coverage_plans").update({ absence_type: absence, jurisdiction_state: state }).eq("id", planId);
  if (withId && withId !== userId) await supabase.from("coverage_plans").update({ preferred_profile_id: withId }).eq("id", planId);
  redirect(`/dashboard/cover/${planId}?step=needs`);
}

export async function addCaseAction(formData: FormData) {
  const { supabase, userId } = await me();
  const planId = Number(formData.get("plan_id"));
  const plan = await ownPlan(supabase, userId, planId);
  if (!plan) back("/dashboard/cover", "Plan not found.");
  const path = `/dashboard/cover/${planId}?step=needs`;
  const focus = formData.getAll("focus").map(Number).filter((n) => n > 0);
  if (focus.length === 0) back(path, "Choose a treatment focus for this client.");
  const { count } = await supabase.from("coverage_plan_cases").select("id", { count: "exact", head: true }).eq("coverage_plan_id", planId);
  const setting = String(formData.get("setting") || "either");
  // Each client can be in a different state; blank means the plan's state.
  const caseState = String(formData.get("client_state") || "").toUpperCase();
  const row: Record<string, unknown> = {
    coverage_plan_id: planId,
    case_reference: `Client ${(count || 0) + 1}`,
    specialism_lookup_ids: Array.from(new Set(focus)).slice(0, 3),
    age_band: String(formData.get("age") || "") || null,
    modality: ["virtual", "in_person", "either"].includes(setting) ? setting : "either",
    insurance: String(formData.get("insurance") || "") || null,
    frequency: String(formData.get("frequency") || "") || null,
    prescribing_needed: formData.get("prescribing") === "1",
  };
  if (/^[A-Z]{2}$/.test(caseState)) row.jurisdiction_state = caseState;
  let { data: added, error } = await supabase.from("coverage_plan_cases").insert(row).select("id").single();
  // Before the database has the per-client state, save the client without it.
  if (error && "jurisdiction_state" in row && /jurisdiction_state/.test(error.message)) {
    delete row.jurisdiction_state;
    ({ data: added, error } = await supabase.from("coverage_plan_cases").insert(row).select("id").single());
  }
  if (error) back(path, error.message);
  revalidatePath(`/dashboard/cover/${planId}`);
  redirect(`${path}&added=${added?.id ?? ""}`);
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
  // If something needs fixing, come back to the same recipients, order and
  // choices. The message itself is never carried back, because it may hold
  // a client identifier.
  const kept = new URLSearchParams({ step: "invite", mode });
  for (const [k, v] of formData.entries()) if (k.startsWith("pick_") && typeof v === "string" && v) kept.append(k, v);
  if (formData.get("reviewed") === "on") kept.set("reviewed", "1");
  const invitePath = `/dashboard/cover/${planId}?${kept.toString()}`;
  const idErr = identifierError(message);
  if (idErr) back(`${invitePath}&fix=message`, `${idErr} Your recipients are kept; rewrite the message without it, or leave it blank.`);
  if (formData.get("reviewed") !== "on") back(`${invitePath}&fix=reviewed`, "Confirm you've reviewed who receives each request.");

  const { data: cases } = await supabase
    .from("coverage_plan_cases")
    .select("id, status")
    .eq("coverage_plan_id", planId)
    .in("status", ["needs_cover", "declined_all"]);
  let sent = 0;
  // Any request that couldn't be sent is reported, not passed over.
  const failed: string[] = [];
  for (const c of cases || []) {
    const picks = formData.getAll(`pick_${c.id}`).map(String).filter(Boolean);
    if (picks.length === 0) continue;
    const first = mode === "parallel" ? picks : picks.slice(0, 1);
    let order = 1;
    for (const pid of first) {
      const { error } = await sendCoverageRequest(supabase, userId, c.id, pid, order++, message);
      if (!error) sent++;
      else failed.push(error);
    }
    await supabase
      .from("coverage_plan_cases")
      .update({ outreach_queue: mode === "sequential" ? picks.slice(1) : [] })
      .eq("id", c.id);
  }
  if (sent === 0) back(invitePath, failed.length ? `Nothing was sent: ${failed[0]}` : "Choose at least one colleague for a client before sending.");
  const { error: planErr } = await supabase.from("coverage_plans").update({ status: "active", outreach_mode: mode }).eq("id", planId);
  revalidatePath("/dashboard/cover");
  const problems = [
    failed.length ? `${failed.length} request${failed.length === 1 ? "" : "s"} couldn't be sent (${failed[0]}). Use Ask on that client to try someone else.` : "",
    planErr ? "The plan's status didn't update; refresh to check it." : "",
  ].filter(Boolean).join(" ");
  redirect(`/dashboard/cover/${planId}?step=track&sent=${sent}${problems ? `&error=${encodeURIComponent(problems)}` : ""}`);
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
  // "Ask a question first": the question goes into Messages, in this
  // request's thread with the colleague who asked, and the request shows
  // as being discussed until the final answer.
  const question = String(formData.get("question") || "").trim();
  if (response === "discussing") {
    if (!question) back("/dashboard/cover", "Write your question first.");
    const idErr = identifierError(question);
    if (idErr) back("/dashboard/cover", idErr);
  }
  const { error } = await respondToCoverageRequest(supabase, userId, requestId, response);
  if (error) back("/dashboard/cover", error);
  if (response === "discussing") {
    const { data: req } = await supabase
      .from("coverage_requests")
      .select("coverage_plan_case_id, coverage_plan_cases(coverage_plan_id, coverage_plans(profile_id))")
      .eq("id", requestId)
      .maybeSingle();
    const ownerId = (req as any)?.coverage_plan_cases?.coverage_plans?.profile_id as string | undefined;
    const planId = (req as any)?.coverage_plan_cases?.coverage_plan_id;
    const title = String(formData.get("thread_title") || "Cover request");
    const link = planId ? `/dashboard/cover/${planId}?step=track#case-${(req as any).coverage_plan_case_id}` : undefined;
    const sent = ownerId ? await postToThread(supabase, userId, [ownerId], title, question, link) : null;
    revalidatePath("/dashboard/messages");
    if (!sent || sent.error) back("/dashboard/cover", "Your reply is saved, but the question didn't reach Messages. Use Go to messages to send it there.");
  }
  revalidatePath("/dashboard/cover");
  const ownerName = String(formData.get("owner_name") || "").trim();
  redirect(
    `/dashboard/cover?ok=${encodeURIComponent(
      response === "accepted"
        ? "You've accepted. The colleague will be in touch about the handoff."
        : response === "declined"
          ? "Declined. Thanks for letting them know."
          : `Question sent${ownerName ? ` to ${ownerName}` : ""}. Their reply appears here, under the client.`
    )}#request-${requestId}`
  );
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
