import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import type { LiveBoot, WorkspaceView } from "../adapters/live";
import { shapeLibrary } from "./library";
import { computeHubStates } from "@/lib/hub-states";

// Loads the signed-in member's workspace in one request, as that member
// (their own session; row-level security and the database's own rules
// apply). Anyone the workspace is not for is sent to the existing screens.
export async function loadWorkspaceBoot(path: string): Promise<LiveBoot> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const jar = await cookies();
    if (IS_DEMO_SITE && jar.get("pa_pass")?.value && !jar.get("pa_resumed")?.value) redirect(`/sandbox/resume?next=${encodeURIComponent(path)}`);
    redirect(IS_DEMO_SITE ? "/sandbox/ended" : "/auth/sign-in");
  }
  const { data, error } = await supabase.rpc("workspace_boot");
  if (error) throw new Error(`workspace_boot: ${error.message}`);
  const boot = data as any;
  if (!boot) redirect(IS_DEMO_SITE ? "/sandbox/ended" : "/auth/sign-in");
  if (boot.gate === "no_profile") redirect("/dashboard/profile");
  if (boot.gate === "operator") redirect("/dashboard/admin");
  // Suspended or closed accounts: their settings, where they can see their status and manage the account.
  if (boot.gate === "inactive") redirect("/dashboard/settings");
  // A light presence signal used only to order equally good matches ("last login"); not awaited.
  supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", user.id).then(() => {});
  const { saved, ...rest } = boot;
  // On the demo site a guest sees the sandbox's own note and controls.
  let sandbox: any = null;
  if (IS_DEMO_SITE) {
    const { data: info } = await supabase.rpc("sandbox_info");
    sandbox = info ? { ...(info as any), leaveUrl: (info as any).label ? `${REAL_SITE_URL}/dashboard/profile` : "" } : null;
  }
  // Profile setup (Nick, 1 Nov): what a member still has to do, shown in the Hub's Actions as "Profile setup"
  // and, until the essentials are done, as "Finish setup" in the sidebar. Same rules as the Profile page.
  const [{ data: prof }, { data: lic }, { data: looks }, { data: plan }, { data: ai }, { data: membership }, { data: circles }, { data: features }] = await Promise.all([
    supabase.rpc("my_profile").select("full_name, qualification_level, avatar_path, bio, primary_practice_city, primary_state, availability_confirmed_at").maybeSingle<any>(),
    supabase.from("licenses").select("status, expiration_date, reviewed_at").eq("profile_id", user.id),
    supabase.from("profile_lookup_values").select("lookup_values!inner(category)").eq("profile_id", user.id).in("lookup_values.category", ["treatment_specialism", "insurance"]),
    supabase.from("continuity_plans").select("answers, backup_profile_id, reviewed_at, updated_at").eq("profile_id", user.id).maybeSingle(),
    // AI (v4): whether this site's "AI tech enabled" switch is on, and the member's uses left today.
    supabase.rpc("ai_status").then((r) => (r.error ? { data: null } : r)),
    // Membership (v4): activation and founding places.
    supabase.rpc("my_membership").then((r) => (r.error ? { data: null } : r)),
    // States building their founding circle: referrals to the whole network wait there.
    supabase.rpc("founding_circle_states").then((r) => (r.error ? { data: [] } : r)),
    // Site switches (v5): consultation groups are off unless the admin Features page turns them on.
    supabase.rpc("feature_flags").then((r) => (r.error ? { data: null } : r)),
  ]);
  const hub = computeHubStates({
    profile: prof || null,
    specialties: ((looks as any[]) || []).filter((r) => r.lookup_values?.category === "treatment_specialism").length,
    insurance: ((looks as any[]) || []).filter((r) => r.lookup_values?.category === "insurance").length,
    licences: (lic as any[]) || [],
    plan: (plan as any) || null,
  });
  const setup = {
    states: hub,
    photo: !!prof?.avatar_path,
    bio: !!String(prof?.bio || "").trim(),
    specialties: ((looks as any[]) || []).filter((r) => r.lookup_values?.category === "treatment_specialism").length,
    licence: ((lic as any[]) || []).length > 0,
    // The last time the member reviewed their continuity plan, for the yearly reminder (Nick, 4 Nov).
    continuityReviewedAt: (plan as any)?.reviewed_at || (plan as any)?.updated_at || null,
    reviewed: ((lic as any[]) || []).some((l) => !!l.reviewed_at),
    availability: !!prof?.availability_confirmed_at,
  };
  return { ...rest, ...shapeLibrary({ resources: boot.resources, saved }), demo: IS_DEMO_SITE, sandbox, userId: user.id, setup, ai: (ai as any) || { enabled: false, left: 0 }, membership: (membership as any) || null, foundingCircle: (circles as any) || [], features: (features as any) || { consultGroups: false } } as LiveBoot;
}

export type { WorkspaceView };
