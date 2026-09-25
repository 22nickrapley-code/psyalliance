import { clinicianName } from "@/lib/profession";
import { createClient } from "@/lib/supabase/server";
import type { NeedOptions } from "@/lib/need-options";
import type { CaseItem, PlanSummary } from "./views";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Shared loaders for the Cover screens.

export function caseDetails(c: any): string[] {
  const out: string[] = [];
  if (c.age_band) out.push(c.age_band);
  out.push(c.modality === "virtual" ? "Virtual" : c.modality === "in_person" ? "In person" : "Virtual or in person");
  if (c.insurance) out.push(c.insurance);
  if (c.frequency) out.push(c.frequency);
  if (c.prescribing_needed) out.push("Prescribing needed");
  return out;
}

export function focusLabel(ids: number[] | null, options: NeedOptions) {
  const names = (ids || []).map((id) => options.focus.find((f) => f.id === Number(id))?.value).filter(Boolean);
  return names.length ? names.join(" + ") : "Any focus";
}

export function summarise(plan: any, cases: { status: string }[]): PlanSummary {
  const counts = {
    total: cases.length,
    covered: cases.filter((c) => c.status === "confirmed").length,
    invited: cases.filter((c) => c.status === "awaiting_response").length,
    open: cases.filter((c) => c.status === "needs_cover" || c.status === "declined_all").length,
  };
  return {
    id: plan.id,
    title: plan.title,
    absenceType: plan.absence_type,
    starts: plan.starts_on,
    ends: plan.ends_on,
    state: plan.jurisdiction_state,
    status: plan.status,
    counts,
  };
}

const nameOf = (p: any) => (p ? clinicianName(p?.full_name, p?.qualification_level, p?.credential_prefix) : "A colleague");

export async function loadPlan(supabase: Supabase, userId: string, planId: number, options: NeedOptions) {
  const { data: plan } = await supabase.from("coverage_plans").select("*").eq("id", planId).eq("profile_id", userId).maybeSingle();
  if (!plan) return null;
  const { data: caseRows } = await supabase
    .from("coverage_plan_cases")
    .select("*, assigned:assigned_clinician_id(full_name, credential_prefix, qualification_level), coverage_requests(requested_profile_id, status, sequence_order, requested:requested_profile_id(full_name, credential_prefix, qualification_level))")
    .eq("coverage_plan_id", planId)
    .order("id");
  const cases: CaseItem[] = (caseRows || []).map((c: any) => ({
    id: c.id,
    reference: c.case_reference,
    focus: focusLabel(c.specialism_lookup_ids, options),
    details: caseDetails(c),
    status: c.status,
    invited: (c.coverage_requests || [])
      .sort((a: any, b: any) => a.sequence_order - b.sequence_order)
      .map((r: any) => ({ name: nameOf(r.requested), status: r.status })),
    assignedName: c.assigned ? nameOf(c.assigned) : null,
    assignedId: c.assigned_clinician_id,
    queueCount: (c.outreach_queue || []).length,
  }));
  return { plan, raw: caseRows || [], cases, summary: summarise(plan, cases) };
}

export function caseNeed(c: any, plan: any) {
  return {
    kind: "cover" as const,
    focusIds: (c.specialism_lookup_ids || []).map(Number),
    state: plan.jurisdiction_state,
    setting: (c.modality as any) || "either",
    insurance: c.insurance,
    ageBand: c.age_band,
    prescribing: !!c.prescribing_needed,
  };
}

export async function excludedFor(supabase: Supabase, caseId: number) {
  const [{ data: asked }, { data: rejected }] = await Promise.all([
    supabase.from("coverage_requests").select("requested_profile_id").eq("coverage_plan_case_id", caseId),
    supabase.from("coverage_case_rejections").select("candidate_profile_id").eq("coverage_plan_case_id", caseId),
  ]);
  return [...(asked || []).map((r: any) => r.requested_profile_id), ...(rejected || []).map((r: any) => r.candidate_profile_id)];
}
