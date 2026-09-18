"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function reviewCredential(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

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
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/admin/verifications");
}

export async function setProfileVerificationStatus(formData: FormData) {
  const supabase = await createClient();
  const profileId = String(formData.get("profile_id") || "");
  const status = String(formData.get("status") || "");

  const { error } = await supabase
    .from("profiles")
    .update({
      verification_status: status,
      verified_at: status === "verified" ? new Date().toISOString() : null,
    })
    .eq("id", profileId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/admin/verifications");
}
