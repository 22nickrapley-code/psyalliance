import { createClient } from "@/lib/supabase/server";
import { SettingsView } from "./view";

export default async function SettingsPage(props: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;

  const [{ data: prefs }, { data: profile }, { data: emergency }, { data: excluded }, { data: blocked }, { data: circleRows }] = await Promise.all([
    supabase.from("notification_preferences").select("*").eq("profile_id", me).maybeSingle(),
    supabase.rpc("my_profile").select("directory_visible, demo_view, is_admin, account_kind").maybeSingle<any>(),
    supabase.from("emergency_contacts").select("*, contact:contact_profile_id(id, full_name, credential_prefix, qualification_level)").eq("profile_id", me).maybeSingle(),
    supabase.from("do_not_work_with").select("blocked_profile_id, blocked:blocked_profile_id(id, full_name, credential_prefix, qualification_level)").eq("profile_id", me),
    supabase.from("blocked_members").select("blocked_profile_id, created_at").eq("profile_id", me),
    // The emergency-contact picker offers the member's own circle.
    supabase
      .from("connections")
      .select("requester_id, requester:requester_id(id, full_name, credential_prefix, qualification_level), addressee:addressee_id(id, full_name, credential_prefix, qualification_level)")
      .eq("status", "accepted")
      .or(`requester_id.eq.${me},addressee_id.eq.${me}`),
  ]);
  const circle = (circleRows || []).map((c: any) => (c.requester_id === me ? c.addressee : c.requester)).filter(Boolean);

  // Blocked members are hidden from each other everywhere, so their names
  // come from a function that only returns the blocker's own list.
  const { data: blockedProfiles } = (blocked || []).length ? await supabase.rpc("my_blocked_members") : { data: [] as any[] };
  return <SettingsView sp={sp} email={user!.email || ""} me={me} prefs={prefs} profile={profile} emergency={emergency} excluded={excluded} blocked={blocked} blockedProfiles={blockedProfiles} circle={circle} />;
}
