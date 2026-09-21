"use server";

import { createClient } from "@/lib/supabase/server";
import { computeRankedCandidates, draftCoverageMessage } from "@/lib/server-matching";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendNetworkNotice } from "../network/actions";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function plannerError(message: string): never {
  redirect(`/dashboard/planner/coverage-plans?error=${encodeURIComponent(message)}`);
}

// Separate from plannerError above (which targets the legacy project-based
// coverage-plan flow at /dashboard/planner/coverage-plans) - these actions
// belong to the new per-client recommendation table that now lives at
// /dashboard/planner itself.
function recTableError(message: string): never {
  redirect(`/dashboard/planner?error=${encodeURIComponent(message)}`);
}

// Runs only in an owner-authenticated context (either creating the project,
// or the owner explicitly advancing to the next candidate after a decline -
// never on behalf of a candidate) so it always has the owner's own RLS
// visibility into their connections, blocklist, and community scores.
async function offerToNextCandidate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignmentId: number,
  requesterId: string,
  requesterName: string,
  caseRow: { primary_need: string | null; city: string | null; state: string | null; session_type: string | null },
  dateRange: { start_date: string; end_date: string }
) {
  const { data: priorOffers } = await supabase
    .from("planner_offers")
    .select("candidate_profile_id")
    .eq("assignment_id", assignmentId);
  const alreadyOffered = (priorOffers || []).map((o) => o.candidate_profile_id);

  const ranked = await computeRankedCandidates(
    supabase,
    requesterId,
    {
      specialismValue: caseRow.primary_need,
      city: caseRow.city,
      state: caseRow.state,
      sessionType: caseRow.session_type,
    },
    alreadyOffered
  );

  const next = ranked[0];
  if (!next) {
    await supabase.from("planner_assignments").update({ status: "exhausted" }).eq("id", assignmentId);
    return null;
  }

  const message = draftCoverageMessage({
    requesterName,
    hasPriorRelationship: next.connectionTier === "partner" || next.connectionTier === "bench",
    specialismSummary: caseRow.primary_need || "a case that matches your listed specialisms",
    startDate: dateRange.start_date,
    endDate: dateRange.end_date,
  });

  await supabase
    .from("planner_offers")
    .insert({ assignment_id: assignmentId, candidate_profile_id: next.profileId, message });
  await supabase.from("planner_assignments").update({ status: "offered" }).eq("id", assignmentId);
  return next;
}

export async function createPlannerProject(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: myProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  const name = String(formData.get("name") || "");
  const startDate = String(formData.get("start_date") || "");
  const endDate = String(formData.get("end_date") || "");
  const notes = String(formData.get("notes") || "") || null;
  const caseIds = formData.getAll("case_ids").map((v) => Number(v));

  if (!name || !startDate || !endDate) plannerError("Name and date range are required");
  if (caseIds.length === 0) plannerError("Select at least one case to cover");

  const { data: project, error: projectError } = await supabase
    .from("planner_projects")
    .insert({ profile_id: user.id, name, start_date: startDate, end_date: endDate, notes })
    .select()
    .single();
  if (projectError) plannerError(projectError.message);

  const { data: cases } = await supabase
    .from("caseload_clients")
    .select("id, primary_need, city, state, session_type")
    .in("id", caseIds)
    .eq("profile_id", user.id);

  for (const caseRow of cases || []) {
    const { data: assignment, error: assignmentError } = await supabase
      .from("planner_assignments")
      .insert({ project_id: project.id, caseload_client_id: caseRow.id })
      .select()
      .single();
    if (assignmentError) plannerError(assignmentError.message);

    await offerToNextCandidate(
      supabase,
      assignment.id,
      user.id,
      myProfile?.full_name || "your colleague",
      caseRow,
      { start_date: startDate, end_date: endDate }
    );
  }

  revalidatePath("/dashboard/planner/coverage-plans");
}

// Owner-only: after a candidate declines, the owner reviews and explicitly
// advances to the next-ranked candidate ("all names clickable... goes to
// next shortlisted Psychologist" - a user-visible step, not silent
// automation). This always runs as the project owner, so it reuses the
// same matching computation with full RLS visibility into their own
// connections/blocklist/scores - no cross-user impersonation needed.
export async function advanceToNextCandidate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const assignmentId = Number(formData.get("assignment_id"));
  const { data: assignment, error } = await supabase
    .from("planner_assignments")
    .select("*, planner_projects(*), caseload_clients(*)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) plannerError(error.message);
  if (!assignment || assignment.planner_projects.profile_id !== user.id) {
    plannerError("Not your assignment to advance");
  }

  const { data: myProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  await offerToNextCandidate(
    supabase,
    assignmentId,
    user.id,
    myProfile?.full_name || "your colleague",
    assignment.caseload_clients,
    { start_date: assignment.planner_projects.start_date, end_date: assignment.planner_projects.end_date }
  );

  revalidatePath("/dashboard/planner/coverage-plans");
}

// Candidate-only: only ever touches the candidate's own offer row, which
// they're always authorized to update. The owner sees the decline (and
// advances to the next candidate themselves) next time they load Planner.
export async function respondToPlannerOffer(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const offerId = Number(formData.get("offer_id"));
  const decision = String(formData.get("decision") || "");
  if (decision !== "accepted" && decision !== "declined") plannerError("Invalid decision");

  const { error } = await supabase
    .from("planner_offers")
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("candidate_profile_id", user.id);
  if (error) plannerError(error.message);

  revalidatePath("/dashboard/planner/coverage-plans");
}

export async function cancelPlannerProject(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));

  const { error } = await supabase.from("planner_projects").update({ status: "cancelled" }).eq("id", id);
  if (error) plannerError(error.message);

  revalidatePath("/dashboard/planner/coverage-plans");
}

// ---------- New per-client recommendation table (main Planner page) ----------

// The inline red "-" on a recommended candidate: excludes them from that
// client's ranked list from now on, so the next-ranked colleague rotates
// into their slot next render. Separate from an actual connection
// block (do_not_work_with) - this is scoped to one client only.
export async function rejectCandidate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const caseloadClientId = Number(formData.get("caseload_client_id"));
  const candidateProfileId = String(formData.get("candidate_profile_id") || "");
  if (!caseloadClientId || !candidateProfileId) recTableError("Missing client or candidate");

  const { error } = await supabase.from("referral_rejections").insert({
    profile_id: user.id,
    caseload_client_id: caseloadClientId,
    candidate_profile_id: candidateProfileId,
  });
  // A repeat click hits the unique constraint - treat that as a no-op
  // rather than an error the user has to do anything about.
  if (error && error.code !== "23505") recTableError(error.message);

  revalidatePath("/dashboard/planner");
}

export async function unassignReferral(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = Number(formData.get("id"));

  const { error } = await supabase
    .from("referral_assignments")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) recTableError(error.message);

  revalidatePath("/dashboard/planner");
}

// The Planner (Team) table's thumbs-down / thumbs-up / heart "Assignment
// Completed Satisfactorily" rating - stored on the individual assignment;
// the team summary shows the most recent one per colleague.
export async function rateAssignmentSatisfaction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = Number(formData.get("id"));
  const rating = String(formData.get("rating") || "");
  if (!["down", "up", "heart"].includes(rating)) recTableError("Invalid rating");

  const { error } = await supabase
    .from("referral_assignments")
    .update({ satisfaction_rating: rating })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) recTableError(error.message);

  revalidatePath("/dashboard/planner");
}

// The bulk "Send" button above the recommendation table: one templated
// message per colleague who currently has at least one assigned referral,
// summarizing which clients they've been assigned - reuses the same
// conversations-based notice helper the Network page uses, so repeat
// clicks land in the same thread with the colleague instead of spawning a
// new one every time.
export async function bulkSendAssignedMessages(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: myProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  const { data: assignments } = await supabase
    .from("referral_assignments")
    .select("assigned_profile_id, caseload_clients(private_label)")
    .eq("profile_id", user.id)
    .eq("status", "assigned");

  const labelsByColleague = new Map<string, string[]>();
  for (const a of assignments || []) {
    const label = (a as any).caseload_clients?.private_label || "a client";
    const list = labelsByColleague.get(a.assigned_profile_id) || [];
    list.push(label);
    labelsByColleague.set(a.assigned_profile_id, list);
  }

  if (labelsByColleague.size === 0) recTableError("No assigned referrals to send yet - assign a colleague to a client first.");

  for (const [colleagueId, labels] of labelsByColleague) {
    await sendNetworkNotice(
      supabase,
      user.id,
      colleagueId,
      `Referral assignments from ${myProfile?.full_name || "a colleague"}`,
      `${myProfile?.full_name || "A colleague"} assigned you referrals for: ${labels.join(", ")}.`
    );
  }

  revalidatePath("/dashboard/planner");
}
