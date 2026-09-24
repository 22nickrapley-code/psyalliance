import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl } from "@/lib/avatars";
import { ProfileView } from "./view";

export default async function ProfilePage(props: {
  searchParams: Promise<{ saved?: string; avatar_saved?: string; avatar_error?: string; error?: string }>;
}) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;

  const [{ data: profile }, { data: lookups }, { data: selectedRows }, { count: licenceCount }] = await Promise.all([
    supabase.rpc("my_profile").maybeSingle<any>(),
    supabase.from("lookup_values").select("id, category, value").neq("category", "us_state").order("value"),
    supabase.from("profile_lookup_values").select("lookup_value_id, rank").eq("profile_id", me),
    supabase.from("licenses").select("id", { count: "exact", head: true }).eq("profile_id", me),
  ]);

  const avatarUrl = await resolveAvatarUrl(supabase, profile?.avatar_path);
  return <ProfileView sp={sp} profile={profile} lookups={lookups} selectedRows={selectedRows} licenceCount={licenceCount} avatarUrl={avatarUrl} me={me} />;
}
