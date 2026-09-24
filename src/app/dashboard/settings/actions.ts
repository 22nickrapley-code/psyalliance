"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function settingsError(message: string): never {
  redirect(`/dashboard/settings?error=${encodeURIComponent(message)}`);
}

export async function saveNotificationPreferences(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // One switch per trigger in the spec's notification table. Some switches
  // cover several underlying event columns (e.g. "replies" covers replies
  // to referrals, cover requests and questions).
  const on = (k: string) => formData.get(k) === "on";
  const digest = String(formData.get("digest_frequency") || "weekly");
  const row = {
    profile_id: user.id,
    email_on_coverage_request: on("n_cover_request"),
    email_on_referral_request: on("n_referral_match"),
    email_on_referral_response: on("n_replies"),
    email_on_coverage_response: on("n_replies"),
    email_on_consultation_response: on("n_replies"),
    email_on_trusted_invitation: on("n_invitations"),
    email_on_consultation_invite: on("n_invitations"),
    email_on_connection_request: on("n_invitations"),
    email_on_message: on("n_messages"),
    email_on_availability_reminder: on("n_availability"),
    email_on_credential_reminder: on("n_credentials"),
    digest_frequency: ["weekly", "fortnightly", "off"].includes(digest) ? digest : "weekly",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("notification_preferences").upsert(row);
  if (error) settingsError(error.message);

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}

export async function saveEmergencyContact(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const contactProfileId = String(formData.get("contact_profile_id") || "");
  if (!contactProfileId) settingsError("Choose a colleague first");
  if (contactProfileId === user.id) settingsError("You can't set yourself as your own emergency contact");

  const { error } = await supabase.from("emergency_contacts").upsert({
    profile_id: user.id,
    contact_profile_id: contactProfileId,
    notes: String(formData.get("notes") || "") || null,
  });
  if (error) settingsError(error.message);

  revalidatePath("/dashboard/settings");
}

export async function removeEmergencyContact() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("emergency_contacts").delete().eq("profile_id", user.id);
  if (error) settingsError(error.message);

  revalidatePath("/dashboard/settings");
}

export async function addToBlocklist(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const blockedProfileId = String(formData.get("blocked_profile_id") || "");
  if (!blockedProfileId) settingsError("Choose a colleague first");
  if (blockedProfileId === user.id) settingsError("You can't block yourself");

  const { error } = await supabase.from("do_not_work_with").insert({
    profile_id: user.id,
    blocked_profile_id: blockedProfileId,
  });
  if (error) settingsError(error.message);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/network");
  revalidatePath(`/dashboard/people/${blockedProfileId}`);
}

export async function removeFromBlocklist(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const blockedProfileId = String(formData.get("blocked_profile_id") || "");

  const { error } = await supabase
    .from("do_not_work_with")
    .delete()
    .eq("profile_id", user.id)
    .eq("blocked_profile_id", blockedProfileId);
  if (error) settingsError(error.message);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/network");
  revalidatePath(`/dashboard/people/${blockedProfileId}`);
}

// "Who can see your profile" (Product Spec v1, Settings > Privacy).
export async function savePrivacyAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const visible = formData.get("directory_visible") === "listed";
  const { error } = await supabase.from("profiles").update({ directory_visible: visible }).eq("id", user.id);
  if (error) settingsError(error.message);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/network");
  redirect("/dashboard/settings?saved=privacy#privacy");
}

// Block: they can't message or invite you and you're hidden from each
// other's directory and suggestions. Never shown to the other person.
export async function blockMemberAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const target = String(formData.get("blocked_profile_id") || "");
  const returnTo = String(formData.get("return_to") || "/dashboard/settings#privacy");
  if (!target) settingsError("Choose a member first");
  if (target === user.id) settingsError("You can't block yourself");
  const { error } = await supabase.from("blocked_members").upsert({ profile_id: user.id, blocked_profile_id: target });
  if (error) settingsError(error.message);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/network");
  redirect(returnTo.startsWith("/dashboard") ? returnTo : "/dashboard/settings#privacy");
}

export async function unblockMemberAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const target = String(formData.get("blocked_profile_id") || "");
  const { error } = await supabase.from("blocked_members").delete().eq("profile_id", user.id).eq("blocked_profile_id", target);
  if (error) settingsError(error.message);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/network");
}

// Demo network view (0076). Admins can switch it on; anyone who has it can
// switch it off. The database enforces the same rule.
export async function setDemoViewAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const on = formData.get("demo_view") === "on";
  const { error } = await supabase.from("profiles").update({ demo_view: on }).eq("id", user.id);
  if (error) settingsError(error.message);
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/settings?saved=${on ? "demo-on" : "demo-off"}#demo`);
}
