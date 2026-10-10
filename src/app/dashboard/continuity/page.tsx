import { createClient } from "@/lib/supabase/server";
import { clinicianName } from "@/lib/profession";
import { loadColleagueSuggestions } from "@/lib/colleague-suggestions";
import { ContinuityView } from "./view";
import { safeBack } from "@/lib/back";

export const metadata = { title: "Continuity plan" };

export default async function ContinuityPage(props: { searchParams: Promise<{ saved?: string; error?: string; reviewed?: string; back?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;
  const [{ data: plan }, { data: duties }, { data: lic }, { data: prof }] = await Promise.all([
    supabase
      .from("continuity_plans")
      .select("*, backup:backup_profile_id(id, full_name, credential_prefix, qualification_level), alternate:alternate_profile_id(id, full_name, credential_prefix, qualification_level)")
      .eq("profile_id", me)
      .maybeSingle<any>(),
    supabase.rpc("my_continuity_duties"),
    supabase.from("licenses").select("state, license_number").eq("profile_id", me).order("state"),
    supabase.from("profiles").select("full_name, credential_prefix, qualification_level, malpractice_carrier, malpractice_expires").eq("id", me).maybeSingle<any>(),
  ]);
  // What PsyAlliance already knows, offered as a starting point.
  const known = {
    licenses: ((lic as any[]) || []).map((l) => `${l.state} ${l.license_number}`).join(", "),
    owner: prof ? clinicianName(prof.full_name, prof.qualification_level, prof.credential_prefix) : "",
    malpractice: prof?.malpractice_carrier ? `${prof.malpractice_carrier}${prof.malpractice_expires ? `, renews ${prof.malpractice_expires}` : ""}` : "",
  };
  const suggestions = await loadColleagueSuggestions(supabase, me, plan?.backup_profile_id || plan?.alternate_profile_id || null);
  const nameOf = (p: any) => (p ? clinicianName(p.full_name, p.qualification_level, p.credential_prefix) : null);
  return (
    <ContinuityView
      sp={sp}
      answers={(plan?.answers as Record<string, string>) || {}}
      backup={plan?.backup_profile_id ? { id: plan.backup_profile_id, name: nameOf(plan.backup) || "Colleague", status: plan.backup_status } : null}
      alternate={plan?.alternate_profile_id ? { id: plan.alternate_profile_id, name: nameOf(plan.alternate) || "Colleague", status: plan.alternate_status } : null}
      updatedAt={plan?.updated_at || null}
      reviewedAt={plan?.reviewed_at || null}
      suggestions={suggestions}
      dutiesWaiting={((duties as any[]) || []).filter((d) => d.status === "invited").length}
      dutiesTotal={((duties as any[]) || []).length}
      known={known}
      back={safeBack(sp.back)}
    />
  );
}
