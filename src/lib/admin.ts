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

// Found in the Sept 23 launch-readiness audit: a profile could be (and one
// real one was) set to verification_status='verified' with zero rows in
// `licenses` and no reviewed/matched row in `credential_verifications` -
// nothing ever checked that "verified" meant an admin had actually looked
// at a real credential. That's a direct contradiction of what "verified"
// promises a clinician browsing the directory, so both admin verify actions
// (members and verifications) now call this before allowing the transition.
// Self-entered licenses and NPI registry checks do not establish a reviewed
// professional license. The database trigger repeats this condition for
// direct writes, while this helper provides a useful action error.
export async function hasReviewableCredentialEvidence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("credential_verifications")
    .select("reviewed_by")
    .eq("profile_id", profileId)
    .in("source", ["state_board", "asppb"])
    .eq("matched", true)
    .not("reviewed_at", "is", null);
  return !error && !!data?.some((record) => record.reviewed_by && record.reviewed_by !== profileId);
}
