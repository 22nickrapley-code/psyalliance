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
  // The owner's own details come from their own-profile function, which
  // includes their insurer. A backup reading the plan gets the owner's
  // directory listing only; the insurer reaches them through the plan's own
  // saved answers, which the owner chose to share.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let p: any = null;
  if (user?.id === owner) {
    const { data } = await supabase.rpc("my_profile").maybeSingle<any>();
    p = data;
  } else {
    const { data } = await supabase
      .from("public_directory")
      .select("full_name, credential_prefix, qualification_level, primary_practice_city, primary_state")
      .eq("id", owner)
      .limit(1);
    p = (data as any[])?.[0] || null;
  }
  const answers = { ...((plan.answers || {}) as Record<string, string>) };
  // Fill gaps from what's already on file: license numbers and the name in
  // the suggested voicemail.
  if (!(answers.licenses || "").trim()) {
    const { data: lic } = await supabase.from("licenses").select("state, license_number").eq("profile_id", owner).order("state");
    const list = ((lic as any[]) || []).map((l) => `${l.state} ${l.license_number}`).join(", ");
    if (list) answers.licenses = list;
  }
  const nameOf = (x: any) => clinicianName(x.full_name, x.qualification_level, x.credential_prefix);
  const person = (member: any, status: string, outside: string) =>
    member ? { name: nameOf(member), status } : outside?.trim() ? { name: outside.trim() } : null;
  if (!(answers.malpractice || "").trim() && p?.malpractice_carrier) {
    answers.malpractice = `${p.malpractice_carrier}${p.malpractice_expires ? `, renews ${p.malpractice_expires}` : ""}`;
  }
  if (p) for (const k of Object.keys(answers)) answers[k] = String(answers[k] ?? "").replaceAll("Dr. [name]", nameOf(p));
  return {
    ownerName: p ? nameOf(p) : "Name not available",
    ownerRole: p ? [roleLabel(p.qualification_level), [p.primary_practice_city, p.primary_state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") : "",
    answers,
    backup: person(plan.backup, plan.backup_status, answers.backup_outside || ""),
    alternate: person(plan.alternate, plan.alternate_status, answers.alternate_outside || ""),
    updatedAt: plan.updated_at as string | null,
    reviewedAt: plan.reviewed_at as string | null,
  };
}
