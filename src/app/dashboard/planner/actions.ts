"use server";

import { createClient } from "@/lib/supabase/server";
import { computeRankedCandidates, draftCoverageMessage } from "@/lib/server-matching";
import { revalidatePath } from "next/cache";

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

  if (!name || !startDate || !endDate) throw new Error("Name and date range are required");
  if (caseIds.length === 0) throw new Error("Select at least one case to cover");

  const { data: project, error: projectError } = await supabase
    .from("planner_projects")
    .insert({ profile_id: user.id, name, start_date: startDate, end_date: endDate, notes })
    .select()
    .single();
  if (projectError) throw new Error(projectError.message);

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
    if (assignmentError) throw new Error(assignmentError.message);

    await offerToNextCandidate(
      supabase,
      assignment.id,
      user.id,
      myProfile?.full_name || "your colleague",
      caseRow,
      { start_date: startDate, end_date: endDate }
    );
  }

  revalidatePath("/dashboard/planner");
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
  if (error) throw new Error(error.message);
  if (!assignment || assignment.planner_projects.profile_id !== user.id) {
    throw new Error("Not your assignment to advance");
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

  revalidatePath("/dashboard/planner");
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
  if (decision !== "accepted" && decision !== "declined") throw new Error("Invalid decision");

  const { error } = await supabase
    .from("planner_offers")
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("candidate_profile_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/planner");
}

export async function cancelPlannerProject(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));

  const { error } = await supabase.from("planner_projects").update({ status: "cancelled" }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/planner");
}
