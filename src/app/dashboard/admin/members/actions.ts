"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";

export async function setMemberVerificationStatus(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

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

  revalidatePath("/dashboard/admin/members");
  revalidatePath("/dashboard/admin/verifications");
  revalidatePath("/dashboard/admin");
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
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/admin/members");
}
