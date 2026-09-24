"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const back = (q: string) => redirect(`/dashboard/admin/invitations?${q}`);

async function admin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);
  return { supabase, user };
}

// A personal invitation, bound to an email when we have one. The link is
// shown once here for the admin to send from their own inbox.
export async function createInvitationAction(formData: FormData) {
  const { supabase, user } = await admin();
  const email = String(formData.get("email") || "").trim().toLowerCase() || null;
  const fullName = String(formData.get("full_name") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;
  const joinRequestId = Number(formData.get("join_request_id")) || null;
  const { data, error } = await supabase
    .from("cohort_invitations")
    .insert({ email, full_name: fullName, note, join_request_id: joinRequestId, created_by: user.id })
    .select("token")
    .single();
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  if (joinRequestId) await supabase.from("join_requests").update({ status: "invited", handled_by: user.id }).eq("id", joinRequestId);
  revalidatePath("/dashboard/admin/invitations");
  back(`created=${encodeURIComponent(data!.token)}`);
}

export async function declineJoinRequestAction(formData: FormData) {
  const { supabase, user } = await admin();
  const id = Number(formData.get("id"));
  const { error } = await supabase.from("join_requests").update({ status: "declined", handled_by: user.id }).eq("id", id);
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/admin/invitations");
  back("");
}

export async function revokeInvitationAction(formData: FormData) {
  const { supabase } = await admin();
  const id = Number(formData.get("id"));
  const { error } = await supabase.from("cohort_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/admin/invitations");
  back("");
}
