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
