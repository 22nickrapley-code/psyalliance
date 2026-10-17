// Small, fictional situations the journeys start from, created with each
// member's own permissions (the same calls the app makes). Staging only.
import { memberClient, account } from "./auth";

const inWeeks = (n: number) => new Date(Date.now() + n * 7 * 86400000).toISOString().slice(0, 10);

export async function coverPlan(ownerKey: string, recipientKeys: string[], clients = ["Client 1"], state = "NY") {
  const owner = await memberClient(ownerKey);
  const ownerId = account(ownerKey).id;
  const { data: plan, error: e1 } = await owner
    .from("coverage_plans")
    .insert({
      profile_id: ownerId,
      title: `QA plan ${Date.now()}`,
      plan_type: "extended_leave",
      absence_type: "extended_leave",
      jurisdiction_state: state,
      outreach_mode: "parallel",
      starts_on: inWeeks(2),
      ends_on: inWeeks(6),
      status: "active",
    })
    .select("id")
    .single();
  if (e1) throw new Error(`plan: ${e1.message}`);
  const cases: { id: number; label: string; requests: Record<string, number> }[] = [];
  for (const label of clients) {
    const { data: kase, error: e2 } = await owner
      .from("coverage_plan_cases")
      .insert({ coverage_plan_id: plan!.id, case_reference: label, specialism_lookup_ids: [7], modality: "either", jurisdiction_state: state })
      .select("id")
      .single();
    if (e2) throw new Error(`case: ${e2.message}`);
    const requests: Record<string, number> = {};
    for (const [i, k] of recipientKeys.entries()) {
      const { data: r, error } = await owner
        .from("coverage_requests")
        .insert({ coverage_plan_case_id: kase!.id, requested_profile_id: account(k).id, sequence_order: i + 1 })
        .select("id")
        .single();
      if (error) throw new Error(`request: ${error.message}`);
      requests[k] = r!.id;
    }
    cases.push({ id: kase!.id, label, requests });
  }
  return { planId: plan!.id as number, cases };
}

export async function referral(ownerKey: string, toKeys: string[], notes = "Prefers evening telehealth.") {
  const owner = await memberClient(ownerKey);
  const { data, error } = await owner
    .from("referral_requests")
    .insert({
      requesting_profile_id: account(ownerKey).id,
      specialism_lookup_ids: [7],
      specialism_lookup_id: 7,
      state: "NY",
      status: "sent",
      audience_type: "selected",
      audience_profile_ids: toKeys.map((k) => account(k).id),
      timeframe: "within_month",
      notes,
    })
    .select("id")
    .single();
  if (error) throw new Error(`referral: ${error.message}`);
  return data!.id as number;
}
