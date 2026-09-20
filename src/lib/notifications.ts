import { createClient } from "@/lib/supabase/server";

// Thin helper around inserting a row into system_notifications - shared by
// every admin action that should notify a member (starting with credential/
// membership approval). Callers pass the already-created server client so
// this runs inside the same RLS-respecting session as the rest of the
// action (the "admins can create notifications" policy is what actually
// allows the insert to land in someone else's inbox).
export async function notifyProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: { profileId: string; title: string; body: string; createdBy: string }
) {
  const { error } = await supabase.from("system_notifications").insert({
    profile_id: opts.profileId,
    title: opts.title,
    body: opts.body,
    created_by: opts.createdBy,
  });
  // Never let a notification failure take down the approval itself - the
  // approval (the thing with real consequences) has already succeeded by
  // the time this is called. Surfacing this loudly isn't worth crashing an
  // admin's whole review flow over.
  if (error) console.error("notifyProfile failed:", error.message);
}
