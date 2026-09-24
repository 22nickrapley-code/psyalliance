"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin, setVerificationStatus } from "@/lib/admin";
import { notifyProfile } from "@/lib/notifications";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function verificationsError(message: string): never {
  redirect(`/dashboard/admin/verifications?error=${encodeURIComponent(message)}`);
}

export async function reviewCredential(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision") || "");
  const flaggedReason = String(formData.get("flagged_reason") || "") || null;

  const { error } = await supabase
    .from("credential_verifications")
    .update({
      matched: decision === "matched",
      flagged_reason: decision === "flagged" ? flaggedReason : null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) verificationsError(error.message);

  revalidatePath("/dashboard/admin/verifications");
}

export async function setProfileVerificationStatus(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const { error } = await setVerificationStatus(supabase, user.id, String(formData.get("profile_id") || ""), String(formData.get("status") || ""));
  if (error) verificationsError(error);

  revalidatePath("/dashboard/admin/verifications");
  revalidatePath("/dashboard/admin/members");
  revalidatePath("/dashboard/admin");
}

// Trust rule "Verified means reviewed": a licence only counts toward
// listing and matching once an admin has checked it against the state
// board. Members can't set this themselves (guard_licence_review trigger).
export async function reviewLicenceAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision") || "");
  const { data: lic } = await supabase.from("licenses").select("id, profile_id, state").eq("id", id).maybeSingle();
  if (!lic) verificationsError("Licence not found");

  if (decision === "approve") {
    const { error } = await supabase
      .from("licenses")
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq("id", id);
    if (error) verificationsError(error.message);
    await notifyProfile(supabase, {
      profileId: lic.profile_id,
      title: `Your ${lic.state} licence has been reviewed`,
      body: "It's now on record. Once your profile is verified, you're listed and matched for referrals and cover in that state.",
      createdBy: user.id,
    });
  } else {
    await notifyProfile(supabase, {
      profileId: lic.profile_id,
      title: `We couldn't confirm your ${lic.state} licence`,
      body: "Please check the state, licence number and expiry date in Credentials. Editing them sends the licence back for review.",
      createdBy: user.id,
    });
  }
  revalidatePath("/dashboard/admin/verifications");
}
