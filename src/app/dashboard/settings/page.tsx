import { createClient } from "@/lib/supabase/server";
import { SettingsView } from "./view";

export default async function SettingsPage(props: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;

  const [{ data: prefs }, { data: profile }, { data: emergency }, { data: excluded }, { data: blocked }, { data: circle }] = await Promise.all([
    supabase.from("notification_preferences").select("*").eq("profile_id", me).maybeSingle(),
    supabase.from("profiles").select("directory_visible").eq("id", me).maybeSingle(),
    supabase.from("emergency_contacts").select("*, contact:contact_profile_id(id, full_name, credential_prefix)").eq("profile_id", me).maybeSingle(),
    supabase.from("do_not_work_with").select("blocked_profile_id, blocked:blocked_profile_id(id, full_name, credential_prefix)").eq("profile_id", me),
    supabase.from("blocked_members").select("blocked_profile_id, created_at").eq("profile_id", me),
    supabase.from("public_directory").select("id, full_name, credential_prefix"),
  ]);

  // Blocked members are hidden from the directory, so names come from the
  // profile row itself (readable for verified members).
  const blockedIds = (blocked || []).map((b) => b.blocked_profile_id);
  const { data: blockedProfiles } = blockedIds.length
    ? await supabase.from("profiles").select("id, full_name, credential_prefix").in("id", blockedIds)
    : { data: [] as any[] };
  return <SettingsView sp={sp} email={user!.email || ""} me={me} prefs={prefs} profile={profile} emergency={emergency} excluded={excluded} blocked={blocked} blockedProfiles={blockedProfiles} circle={circle} />;
}
