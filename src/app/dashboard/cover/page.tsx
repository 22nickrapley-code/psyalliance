import type { CoveringItem } from "./views";
import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { CoverIndexView } from "./views";
import { summarise, focusLabel, caseDetails, clientRef } from "./data";
import { ABSENCE, type IncomingPlan } from "./views";
import { clinicianName, roleLabel } from "@/lib/profession";
import { resolveAvatarUrls } from "@/lib/avatars";
import { US_STATES } from "@/lib/us-states";

export const metadata = { title: "Cover" };

// Cover (Product Spec v1): your plans, and cover requests colleagues have
// sent you.
export default async function CoverPage(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [options, { data: plans }, { data: incomingRows }, { data: acceptedRows }] = await Promise.all([
    loadNeedOptions(supabase),
    supabase
      .from("coverage_plans")
      .select("*, coverage_plan_cases(status)")
      .eq("profile_id", myself)
      .order("created_at", { ascending: false }),
    supabase
      .from("coverage_requests")
      .select("id, status, message, sent_at, coverage_plan_cases(*, coverage_plans(id, title, starts_on, ends_on, absence_type, jurisdiction_state, outreach_mode, notes, profile_id, owner:profile_id(full_name, credential_prefix, qualification_level, primary_practice_city, primary_state, avatar_path)))")
      .eq("requested_profile_id", myself)
      .in("status", ["sent", "discussing"])
      .order("sent_at", { ascending: false }),
    supabase
      .from("coverage_requests")
      .select("id, responded_at, coverage_plan_cases(case_reference, specialism_lookup_ids, coverage_plans(id, starts_on, ends_on, status, profile_id, owner:profile_id(full_name, credential_prefix, qualification_level)))")
      .eq("requested_profile_id", myself)
      .eq("status", "accepted")
      .order("responded_at", { ascending: false })
      .limit(40),
  ]);

  const fmt = (d: string | null) =>
    d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" }) : "";
  const weeks = (a: string | null, b: string | null) => {
    if (!a || !b) return "";
    const days = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
    return days >= 14 ? `${Math.round(days / 7)} weeks` : `${days} day${days === 1 ? "" : "s"}`;
  };
  const rows = (incomingRows || []).filter((r: any) => r.coverage_plan_cases?.coverage_plans);
  const urls = await resolveAvatarUrls(supabase, rows.map((r: any) => r.coverage_plan_cases.coverage_plans.owner?.avatar_path));

  // One card per colleague's plan: how many patients they are asking you
  // to cover, where, when, and every detail they gave for each case.
  const byPlan = new Map<number, IncomingPlan>();
  for (const r of rows as any[]) {
    const c = r.coverage_plan_cases;
    const p = c.coverage_plans;
    const owner = p.owner || {};
    const stateName = US_STATES.find((s) => s.code === p.jurisdiction_state)?.name || p.jurisdiction_state;
    if (!byPlan.has(p.id)) {
      byPlan.set(p.id, {
        planId: p.id,
        ownerId: p.profile_id,
        ownerName: clinicianName(owner.full_name, owner.qualification_level, owner.credential_prefix),
        ownerRole: `${roleLabel(owner.qualification_level)}${owner.primary_practice_city ? ` · ${owner.primary_practice_city}, ${owner.primary_state}` : ""}`,
        ownerAvatar: urls.get(owner.avatar_path || "") || null,
        absence: ABSENCE[p.absence_type || ""]?.label || "Cover",
        planTitle: p.title,
        dates: p.starts_on ? `${fmt(p.starts_on)} to ${fmt(p.ends_on)}` : "Dates to confirm",
        length: weeks(p.starts_on, p.ends_on),
        location: [owner.primary_practice_city && owner.primary_state === p.jurisdiction_state ? owner.primary_practice_city : null, stateName].filter(Boolean).join(", ") || "Not stated",
        outreach: p.outreach_mode === "parallel" ? "Asked of several colleagues at once" : "You are asked in turn; others follow if you decline",
        note: r.message || p.notes || null,
        urgent: p.absence_type === "unexpected",
        sentAt: r.sent_at,
        cases: [],
      });
    }
    byPlan.get(p.id)!.cases.push({
      requestId: r.id,
      status: r.status,
      reference: clientRef(c.case_reference),
      focus: focusLabel(c.specialism_lookup_ids, options),
      details: [
        ["Age band", c.age_band || "Not stated"],
        ["Setting", c.modality === "virtual" ? "Virtual" : c.modality === "in_person" ? "In person" : "Virtual or in person"],
        ["Insurance", c.insurance || "Not stated"],
        ["Frequency", c.frequency || "Not stated"],
        ["Prescribing", c.prescribing_needed ? "Needed" : "Not needed"],
        ...(c.service_needed ? [["Service", c.service_needed] as [string, string]] : []),
      ],
    });
  }
  const incoming = [...byPlan.values()].sort((a, b) => Number(b.urgent) - Number(a.urgent));

  // What you've agreed to cover: by colleague, with dates and clients, until
  // their plan ends.
  const today = new Date().toISOString().slice(0, 10);
  const coveringBy = new Map<number, CoveringItem>();
  for (const r of (acceptedRows || []) as any[]) {
    const c = r.coverage_plan_cases;
    const p = c?.coverage_plans;
    if (!p || p.status === "cancelled" || (p.ends_on && p.ends_on < today)) continue;
    const o = p.owner || {};
    if (!coveringBy.has(p.id)) {
      coveringBy.set(p.id, {
        planId: p.id,
        ownerId: p.profile_id,
        ownerName: clinicianName(o.full_name, o.qualification_level, o.credential_prefix),
        dates: p.starts_on ? `${fmt(p.starts_on)} to ${fmt(p.ends_on)}` : "Dates to confirm",
        clients: [],
      });
    }
    coveringBy.get(p.id)!.clients.push(`${clientRef(c.case_reference) || "Client"} · ${focusLabel(c.specialism_lookup_ids, options)}`);
  }
  const covering = [...coveringBy.values()];
  void caseDetails;

  return (
    <CoverIndexView
      plans={(plans || []).map((p: any) => summarise(p, p.coverage_plan_cases || []))}
      incoming={incoming}
      covering={covering}
      ok={ok}
      error={error}
    />
  );
}
