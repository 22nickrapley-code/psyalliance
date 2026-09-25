import { clinicianName } from "@/lib/profession";
import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { ReferIndexView, type ReferralListItem } from "./views";

// Refer (Product Spec v1): quick search, your referrals out, and referrals
// offered to you that fit your practice.
export default async function ReferPage(props: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [options, { data: mineRows }, { data: visibleRows }, { data: myFocusRows }, { data: myLicences }] = await Promise.all([
    loadNeedOptions(supabase),
    supabase
      .from("referral_requests")
      .select("id, specialism_lookup_ids, specialism_lookup_id, state, city, status, created_at, audience_type, audience_profile_ids, referral_responses(status)")
      .eq("requesting_profile_id", myself)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("referral_requests")
      .select("id, requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, status, created_at, audience_type, audience_profile_ids, requester:requesting_profile_id(full_name, credential_prefix, qualification_level)")
      .neq("requesting_profile_id", myself)
      .in("status", ["sent", "open"])
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("profile_lookup_values")
      .select("lookup_value_id, lookup_values!inner(category)")
      .eq("profile_id", myself)
      .eq("lookup_values.category", "treatment_specialism"),
    supabase.from("licenses").select("state, status").eq("profile_id", myself).eq("status", "active"),
  ]);

  const focusName = (ids: number[] | null, single: number | null) => {
    const list = (ids && ids.length ? ids : single ? [single] : []).map((id) => options.focus.find((f) => f.id === Number(id))?.value).filter(Boolean);
    return list.length ? list.join(" + ") : "Any focus";
  };
  const whereOf = (r: any) => [r.city, options.states.find((s) => s.code === r.state)?.name || r.state].filter(Boolean).join(", ") || "Anywhere";

  const mine: ReferralListItem[] = (mineRows || []).map((r: any) => ({
    id: r.id,
    focus: focusName(r.specialism_lookup_ids, r.specialism_lookup_id),
    where: whereOf(r),
    status: r.status,
    createdAt: r.created_at,
    responses: (r.referral_responses || []).length,
    interested: (r.referral_responses || []).filter((x: any) => x.status === "interested" || x.status === "accepted").length,
    audience: r.audience_type,
    audienceCount: r.audience_type === "selected" ? (r.audience_profile_ids || []).length : null,
  }));

  // Relevance for referrals offered to me: selected/trusted always; the
  // wider network only when it overlaps my specialties and licence states.
  const myFocus = new Set((myFocusRows || []).map((r: any) => Number(r.lookup_value_id)));
  const myStates = new Set((myLicences || []).map((l: any) => String(l.state).toUpperCase()));
  const relevant = (visibleRows || []).filter((r: any) => {
    if (r.audience_type === "selected" || r.audience_type === "trusted") return true;
    const ids: number[] = (r.specialism_lookup_ids || []).map(Number);
    const focusOk = ids.length === 0 || ids.some((id) => myFocus.has(id));
    const stateOk = !r.state || myStates.has(String(r.state).toUpperCase());
    return focusOk && stateOk;
  });
  const { data: myResponses } = relevant.length
    ? await supabase
        .from("referral_responses")
        .select("referral_request_id, status")
        .eq("responding_profile_id", myself)
        .in("referral_request_id", relevant.map((r: any) => r.id))
    : { data: [] as any[] };
  const responded = new Map((myResponses || []).map((r: any) => [r.referral_request_id, r.status]));

  const offered = relevant.map((r: any) => ({
    id: r.id,
    focus: focusName(r.specialism_lookup_ids, r.specialism_lookup_id),
    where: whereOf(r),
    status: r.status,
    createdAt: r.created_at,
    responses: 0,
    interested: 0,
    audience: r.audience_type,
    from: r.requester ? clinicianName(r.requester?.full_name, r.requester?.qualification_level, r.requester?.credential_prefix) : "A colleague",
    myResponse: responded.get(r.id) || null,
  }));

  return <ReferIndexView options={options} mine={mine} offered={offered} ok={ok} error={error} />;
}
