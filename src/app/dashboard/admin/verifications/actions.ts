"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
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

  const profileId = String(formData.get("profile_id") || "");
  const status = String(formData.get("status") || "");

  // Read the current status first so re-saving an already-verified profile
  // (or moving between any two non-verified statuses) never fires a
  // duplicate "you're approved" notification - only a genuine transition
  // into 'verified' should notify.
  const { data: before } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", profileId)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({
      verification_status: status,
      verified_at: status === "verified" ? new Date().toISOString() : null,
    })
    .eq("id", profileId);
  if (error) verificationsError(error.message);

  if (status === "verified" && before?.verification_status !== "verified") {
    await notifyProfile(supabase, {
      profileId,
      title: "You're approved!",
      body: "Your credential verification is complete and your PsyAlliance membership is now approved. You have full access to the network - Caseload, Messages, Network, and every other tool.",
      createdBy: user.id,
    });
  }

  revalidatePath("/dashboard/admin/verifications");
  revalidatePath("/dashboard/admin/members");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/messages");
  revalidatePath("/dashboard");
}
