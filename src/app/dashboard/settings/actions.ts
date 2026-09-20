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

  const row = {
    profile_id: user.id,
    email_on_connection_request: formData.get("email_on_connection_request") === "on",
    email_on_referral_request: formData.get("email_on_referral_request") === "on",
    email_on_referral_response: formData.get("email_on_referral_response") === "on",
    email_on_message: formData.get("email_on_message") === "on",
    email_on_town_hall_reply: formData.get("email_on_town_hall_reply") === "on",
    email_on_endorsement: formData.get("email_on_endorsement") === "on",
    email_on_new_colleague_in_location: formData.get("email_on_new_colleague_in_location") === "on",
    email_on_new_colleague_matching_specialism: formData.get("email_on_new_colleague_matching_specialism") === "on",
    email_on_new_colleague_matching_caseload: formData.get("email_on_new_colleague_matching_caseload") === "on",
    digest_frequency: String(formData.get("digest_frequency") || "realtime"),
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
}
