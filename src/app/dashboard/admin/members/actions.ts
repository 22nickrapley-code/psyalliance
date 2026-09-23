"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin, hasReviewableCredentialEvidence } from "@/lib/admin";
import { notifyProfile } from "@/lib/notifications";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function membersError(message: string): never {
  redirect(`/dashboard/admin/members?error=${encodeURIComponent(message)}`);
}

export async function setMemberVerificationStatus(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const profileId = String(formData.get("profile_id") || "");
  const status = String(formData.get("status") || "");

  // See the identical check in verifications/actions.ts - only a genuine
  // transition into 'verified' should send the "you're approved" notice.
  const { data: before } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", profileId)
    .maybeSingle();

  // Launch-readiness audit finding: "verified" must mean an admin actually
  // reviewed a real credential, not just a status flip. See the comment on
  // hasReviewableCredentialEvidence for the incident this closes.
  if (status === "verified" && before?.verification_status !== "verified") {
    const hasEvidence = await hasReviewableCredentialEvidence(supabase, profileId);
    if (!hasEvidence) {
      membersError("Can't mark verified: no license on file and no reviewed/matched credential submission. Add a license or review a submission first.");
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      verification_status: status,
      verified_at: status === "verified" ? new Date().toISOString() : null,
    })
    .eq("id", profileId);
  if (error) membersError(error.message);

  if (status === "verified" && before?.verification_status !== "verified") {
    await notifyProfile(supabase, {
      profileId,
      title: "You're approved!",
      body: "Your credential verification is complete and your PsyAlliance membership is now approved. You have full access to the network - Caseload, Messages, Network, and every other tool.",
      createdBy: user.id,
    });
  }

  revalidatePath("/dashboard/admin/members");
  revalidatePath("/dashboard/admin/verifications");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/messages");
  revalidatePath("/dashboard");
}

// Lets an existing admin (Nick) promote a trusted co-reviewer (e.g. Rena) to
// admin, or demote one. The self-promotion trigger on profiles (migration
// 0009) still blocks a non-admin from setting this on themselves via any
// path other than an already-trusted admin doing it - this action is just
// the UI for that, with the same assertIsAdmin check as everything else here.
export async function setMemberAdminFlag(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const profileId = String(formData.get("profile_id") || "");
  const isAdmin = formData.get("is_admin") === "1";

  const { error } = await supabase.from("profiles").update({ is_admin: isAdmin }).eq("id", profileId);
  if (error) membersError(error.message);

  revalidatePath("/dashboard/admin/members");
}

// PsyA2 #100 (member administration): restrict/suspend/restore/deactivate.
// See the account_status column comment (rebuild_admin_moderation
// migration) for what these actually do today - a flat "hidden from other
// members" effect, not four different enforcement levels yet. This is the
// direct action (used from All members); the moderation queue's
// restrict/suspend buttons go through resolveReport() in moderation.ts
// instead, since those also need to update the report row itself.
export async function setMemberAccountStatusAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const profileId = String(formData.get("profile_id") || "");
  const accountStatus = String(formData.get("account_status") || "") as
    | "active"
    | "restricted"
    | "suspended"
    | "deactivated";

  const { error } = await supabase.from("profiles").update({ account_status: accountStatus }).eq("id", profileId);
  if (error) membersError(error.message);

  revalidatePath("/dashboard/admin/members");
}
