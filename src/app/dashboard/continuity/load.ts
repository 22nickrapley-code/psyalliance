import { createClient } from "@/lib/supabase/server";
import { clinicianName, roleLabel } from "@/lib/profession";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// A plan in the shape the document needs. Row-level security decides who
// can read it: the owner, or a backup who has agreed.
export async function loadPlanForDocument(supabase: Supabase, owner: string) {
  const { data: plan } = await supabase
    .from("continuity_plans")
    .select("*, backup:backup_profile_id(full_name, credential_prefix, qualification_level), alternate:alternate_profile_id(full_name, credential_prefix, qualification_level)")
    .eq("profile_id", owner)
    .maybeSingle<any>();
  if (!plan) return null;
  const { data: p } = await supabase.from("profiles").select("full_name, credential_prefix, qualification_level, primary_practice_city, primary_state").eq("id", owner).maybeSingle<any>();
  const answers = (plan.answers || {}) as Record<string, string>;
  const nameOf = (x: any) => clinicianName(x.full_name, x.qualification_level, x.credential_prefix);
  const person = (member: any, status: string, outside: string) =>
    member ? { name: nameOf(member), status } : outside?.trim() ? { name: outside.trim() } : null;
  return {
    ownerName: p ? nameOf(p) : "Clinician",
    ownerRole: p ? [roleLabel(p.qualification_level), [p.primary_practice_city, p.primary_state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") : "",
    answers,
    backup: person(plan.backup, plan.backup_status, answers.backup_outside || ""),
    alternate: person(plan.alternate, plan.alternate_status, answers.alternate_outside || ""),
    updatedAt: plan.updated_at as string | null,
    reviewedAt: plan.reviewed_at as string | null,
  };
}
