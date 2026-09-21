"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendNetworkNotice } from "../network/actions";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same profile page with an inline banner rather than taking the page down.
function profileActionError(profileId: string, message: string): never {
  redirect(`/dashboard/people/${profileId}?error=${encodeURIComponent(message)}`);
}

// Written, LinkedIn-style endorsement. One per (endorser, endorsee) pair -
// re-submitting updates the existing row via upsert rather than stacking
// duplicates, so "Edit your endorsement" and "Endorse" are the same action.
export async function submitEndorsement(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const endorseeId = String(formData.get("endorsee_id") || "");
  const body = String(formData.get("body") || "").trim();
  if (!endorseeId) throw new Error("Missing endorsee");
  if (endorseeId === user.id) profileActionError(endorseeId, "You can't endorse yourself");
  if (!body) profileActionError(endorseeId, "Write a line or two before endorsing");

  const { data: existing } = await supabase
    .from("endorsements")
    .select("id")
    .eq("endorser_id", user.id)
    .eq("endorsee_id", endorseeId)
    .maybeSingle();

  const { error } = await supabase
    .from("endorsements")
    .upsert(
      { endorser_id: user.id, endorsee_id: endorseeId, body, updated_at: new Date().toISOString() },
      { onConflict: "endorser_id,endorsee_id" }
    );
  if (error) profileActionError(endorseeId, error.message);

  if (!existing) {
    const { data: myProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    await sendNetworkNotice(
      supabase,
      user.id,
      endorseeId,
      `Endorsement from ${myProfile?.full_name || "a colleague"}`,
      `${myProfile?.full_name || "A colleague"} endorsed you: "${body}"`
    );
  }

  revalidatePath(`/dashboard/people/${endorseeId}`);
}

export async function deleteEndorsement(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const endorseeId = String(formData.get("endorsee_id") || "");

  const { error } = await supabase
    .from("endorsements")
    .delete()
    .eq("endorser_id", user.id)
    .eq("endorsee_id", endorseeId);
  if (error) profileActionError(endorseeId, error.message);

  revalidatePath(`/dashboard/people/${endorseeId}`);
}

// One-off "assign this colleague to my client" quick action from the
// profile page. Deliberately the same referral_assignments shape the
// upcoming Planner recommendation table will read/write - see the
// endorsements_and_referral_assignments migration.
export async function assignColleagueToClient(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const assignedProfileId = String(formData.get("assigned_profile_id") || "");
  const caseloadClientId = Number(formData.get("caseload_client_id"));
  const note = String(formData.get("note") || "").trim() || null;
  if (!assignedProfileId) throw new Error("Missing colleague");
  if (!caseloadClientId) profileActionError(assignedProfileId, "Pick a client to assign this colleague to first");

  const { data: caseRow } = await supabase
    .from("caseload_clients")
    .select("id, private_label, primary_need, state, session_type")
    .eq("id", caseloadClientId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!caseRow) profileActionError(assignedProfileId, "That client wasn't found in your caseload");

  const { data: myProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  const { error } = await supabase.from("referral_assignments").insert({
    profile_id: user.id,
    caseload_client_id: caseloadClientId,
    assigned_profile_id: assignedProfileId,
    message: note,
    status: "assigned",
  });
  if (error) profileActionError(assignedProfileId, error.message);

  const summary = [caseRow!.primary_need, caseRow!.state, caseRow!.session_type].filter(Boolean).join(" - ");
  await sendNetworkNotice(
    supabase,
    user.id,
    assignedProfileId,
    `Referral from ${myProfile?.full_name || "a colleague"}`,
    `${myProfile?.full_name || "A colleague"} assigned you a referral for client ${caseRow!.private_label}${
      summary ? ` (${summary})` : ""
    }.${note ? ` Note: ${note}` : ""}`
  );

  revalidatePath(`/dashboard/people/${assignedProfileId}`);
  revalidatePath("/dashboard/caseload");
}

// Records that the referrer has told the patient about the assigned
// practitioner - there's no patient-facing login in this app, so this is a
// log/checkbox action for the referrer's own record, not an actual message
// sent anywhere. Mirrors the "Send Practitioner Details to Patient" column
// planned for the Planner recommendation table (Task #78).
export async function markSentToPatient(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = Number(formData.get("id"));
  const assignedProfileId = String(formData.get("assigned_profile_id") || "");

  const { error } = await supabase
    .from("referral_assignments")
    .update({ sent_to_patient: true, sent_to_patient_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) profileActionError(assignedProfileId, error.message);

  revalidatePath(`/dashboard/people/${assignedProfileId}`);
}
