import type { SupabaseClient } from "@supabase/supabase-js";

// Demo network parity. Fake accounts (profiles.is_demo) never appear to
// real members. A viewer with the demo view switched on (or a demo account
// itself) sees only the demo network. Every query that lists other members
// outside RLS-filtered views should filter on this.
export async function viewerIsDemo(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.rpc("viewer_is_demo");
  return data === true;
}
