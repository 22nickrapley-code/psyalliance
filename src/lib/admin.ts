import { createClient } from "@/lib/supabase/server";

// Shared defense-in-depth admin check, used by every admin page/action.
// RLS already blocks a non-admin from writing admin-controlled columns, but
// that fails silently (a no-op update, no error) rather than telling the
// caller they're not allowed - so every admin entry point checks is_admin
// explicitly first and throws a clear error instead of relying on RLS alone.
export async function assertIsAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<void> {
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (!me?.is_admin) throw new Error("Not authorized");
}

// For page-level redirects (no user session = not admin, rather than throwing).
export async function requireAdminOrRedirectPath(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/auth/sign-in";
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_admin) return "/dashboard";
  return null;
}

// Changes a member's verification status. Verified requires at least one
// reviewed, in-date licence; the database enforces that
// (guard_verification_evidence, migration 0082) and its message comes back
// as the error. Only a real transition into verified notifies the member.
export async function setVerificationStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminId: string,
  profileId: string,
  status: string
): Promise<{ error: string | null }> {
  if (!["pending", "verified", "flagged", "rejected"].includes(status)) return { error: "Unknown status" };
  const { data: before } = await supabase.from("profiles").select("verification_status").eq("id", profileId).maybeSingle();
  const { error } = await supabase
    .from("profiles")
    .update({ verification_status: status, verified_at: status === "verified" ? new Date().toISOString() : null })
    .eq("id", profileId);
  if (error) return { error: error.message };
  if (status === "verified" && before?.verification_status !== "verified") {
    const { notifyProfile } = await import("@/lib/notifications");
    await notifyProfile(supabase, {
      profileId,
      title: "Your credentials are verified",
      body: "You're now part of the network in the states where your licence has been reviewed: listed, matched for referrals and cover, and able to consult with colleagues.",
      createdBy: adminId,
    });
  }
  return { error: null };
}
