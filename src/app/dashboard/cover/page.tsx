import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { CoverIndexView } from "./views";
import { summarise, focusLabel, caseDetails } from "./data";
import { ABSENCE } from "./views";

// Cover (Product Spec v1): your plans, and cover requests colleagues have
// sent you.
export default async function CoverPage(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [options, { data: plans }, { data: incomingRows }] = await Promise.all([
    loadNeedOptions(supabase),
    supabase
      .from("coverage_plans")
      .select("*, coverage_plan_cases(status)")
      .eq("profile_id", myself)
      .order("created_at", { ascending: false }),
    supabase
      .from("coverage_requests")
      .select("id, coverage_plan_cases(*, coverage_plans(id, title, starts_on, ends_on, absence_type, profile_id, owner:profile_id(full_name, credential_prefix)))")
      .eq("requested_profile_id", myself)
      .eq("status", "sent")
      .order("sent_at", { ascending: false }),
  ]);

  const fmt = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
  const incoming = (incomingRows || [])
    .filter((r: any) => r.coverage_plan_cases?.coverage_plans)
    .map((r: any) => {
      const c = r.coverage_plan_cases;
      const p = c.coverage_plans;
      const owner = p.owner;
      return {
        requestId: r.id,
        ownerId: p.profile_id,
        ownerName: owner ? `${owner.credential_prefix ? owner.credential_prefix + " " : ""}${owner.full_name}` : "A colleague",
        planTitle: ABSENCE[p.absence_type || ""]?.label || p.title,
        dates: [fmt(p.starts_on), fmt(p.ends_on)].filter(Boolean).join(" – ") || "Dates to confirm",
        caseLabel: focusLabel(c.specialism_lookup_ids, options),
        details: caseDetails(c),
        urgent: p.absence_type === "unexpected",
      };
    });

  return (
    <CoverIndexView
      plans={(plans || []).map((p: any) => summarise(p, p.coverage_plan_cases || []))}
      incoming={incoming}
      ok={ok}
      error={error}
    />
  );
}
