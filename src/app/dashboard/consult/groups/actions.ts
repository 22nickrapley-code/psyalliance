"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createConsultationGroup, inviteToConsultationGroup, createConsultation } from "@/lib/consult";

// PsyA2 #63-67 (PA-04 closed peer consultation groups) - consult.ts has had
// createConsultationGroup()/inviteToConsultationGroup() since Phase 4 batch
// 4 with zero UI or callers. This is that UI's actions, first pass: create,
// invite (internal member or external cold-start email), accept/decline/
// leave, a creator-editable charter, and posting a consultation scoped to
// the group. Health checks (#67, explicitly optional/quarterly) and a
// dedicated agenda template/private-resources area (#66) are deliberately
// not in this pass.

function groupsError(message: string): never {
  redirect(`/dashboard/consult/groups?error=${encodeURIComponent(message)}`);
}

function groupError(groupId: number | string, message: string): never {
  redirect(`/dashboard/consult/groups/${groupId}?error=${encodeURIComponent(message)}`);
}

export async function createConsultationGroupAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const name = String(formData.get("name") || "").trim();
  if (!name) groupsError("Give the group a name");
  const purpose = String(formData.get("purpose") || "") || undefined;
  const cadence = String(formData.get("cadence") || "") || undefined;
  const meetingFormat = (String(formData.get("meeting_format") || "") || undefined) as
    | "in_person"
    | "video"
    | "hybrid"
    | undefined;
  const charterBody = String(formData.get("charter_body") || "") || undefined;

  const { groupId, error } = await createConsultationGroup(supabase, user.id, { name, purpose, cadence, meetingFormat, charterBody });
  if (error || !groupId) groupsError(error || "Could not create the group");

  revalidatePath("/dashboard/consult/groups");
  redirect(`/dashboard/consult/groups/${groupId}`);
}

export async function inviteInternalMemberAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const groupId = Number(formData.get("group_id"));
  const profileId = String(formData.get("profile_id") || "");
  if (!profileId) groupError(groupId, "Choose a colleague to invite");

  const { error } = await inviteToConsultationGroup(supabase, groupId, { profileId });
  if (error) groupError(groupId, error);

  revalidatePath(`/dashboard/consult/groups/${groupId}`);
  redirect(`/dashboard/consult/groups/${groupId}`);
}

export async function inviteExternalAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const groupId = Number(formData.get("group_id"));
  const externalEmail = String(formData.get("external_email") || "").trim();
  if (!externalEmail) groupError(groupId, "Enter an email to invite");

  const { error } = await inviteToConsultationGroup(supabase, groupId, { externalEmail });
  if (error) groupError(groupId, error);

  revalidatePath(`/dashboard/consult/groups/${groupId}`);
  redirect(`/dashboard/consult/groups/${groupId}`);
}

export async function respondToGroupInviteAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const membershipId = Number(formData.get("membership_id"));
  const status = String(formData.get("status") || "") as "joined" | "declined" | "left";

  const { error } = await supabase
    .from("consultation_group_members")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("profile_id", user.id);
  if (error) groupsError(error.message);

  revalidatePath("/dashboard/consult/groups");
  redirect("/dashboard/consult/groups");
}

export async function leaveGroupAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const groupId = Number(formData.get("group_id"));
  const membershipId = Number(formData.get("membership_id"));

  const { error } = await supabase
    .from("consultation_group_members")
    .update({ status: "left", responded_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("profile_id", user.id);
  if (error) groupError(groupId, error.message);

  revalidatePath("/dashboard/consult/groups");
  redirect("/dashboard/consult/groups");
}

export async function removeGroupMemberAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const groupId = Number(formData.get("group_id"));
  const membershipId = Number(formData.get("membership_id"));

  // RLS ("group creator manages membership") is the real gate here - this
  // delete only succeeds when the caller created the group.
  const { error } = await supabase.from("consultation_group_members").delete().eq("id", membershipId);
  if (error) groupError(groupId, error.message);

  revalidatePath(`/dashboard/consult/groups/${groupId}`);
  redirect(`/dashboard/consult/groups/${groupId}`);
}

export async function updateCharterAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const groupId = Number(formData.get("group_id"));
  const charterBody = String(formData.get("charter_body") || "");

  const { data: current } = await supabase.from("consultation_groups").select("charter_version").eq("id", groupId).maybeSingle();
  const { error } = await supabase
    .from("consultation_groups")
    .update({ charter_body: charterBody, charter_version: (current?.charter_version || 1) + 1 })
    .eq("id", groupId)
    .eq("created_by", user.id);
  if (error) groupError(groupId, error.message);

  revalidatePath(`/dashboard/consult/groups/${groupId}`);
  redirect(`/dashboard/consult/groups/${groupId}`);
}

export async function postGroupConsultationAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const groupId = Number(formData.get("group_id"));
  const question = String(formData.get("question") || "").trim();
  if (!question) groupError(groupId, "What do you need help thinking through?");

  // Visibility for a group-posted consultation comes from group_id itself
  // (see the consultations RLS policy) regardless of audience_type, so
  // 'trusted' here is just a sensible default, not a second access gate.
  const { error } = await createConsultation(supabase, user.id, {
    question,
    audienceType: "trusted",
    groupId,
    context: String(formData.get("context") || "") || undefined,
  });
  if (error) groupError(groupId, error);

  revalidatePath(`/dashboard/consult/groups/${groupId}`);
  redirect(`/dashboard/consult/groups/${groupId}`);
}
