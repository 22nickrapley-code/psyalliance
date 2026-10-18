import { clinicianName } from "@/lib/profession";
import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { ReferIndexView, type ReferralListItem, type ReceivedItem } from "./views";

export const metadata = { title: "Refer" };

// Refer (Product Spec v1): start a referral, your referrals out, and the
// referrals colleagues sent you, each list a colour-coded history, newest
// first (Nick, 18 Oct).
export default async function ReferPage(props: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const REQ = "id, requesting_profile_id, specialism_lookup_ids, specialism_lookup_id, state, city, status, created_at, audience_type, audience_profile_ids, requester:requesting_profile_id(full_name, credential_prefix, qualification_level)";
  const [options, { data: mineRows }, { data: visibleRows }, { data: myResponseRows }, { data: myFocusRows }, { data: myLicences }] = await Promise.all([
    loadNeedOptions(supabase),
    supabase
      .from("referral_requests")
      .select("id, specialism_lookup_ids, specialism_lookup_id, state, city, status, created_at, audience_type, audience_profile_ids, referral_responses(status)")
      .eq("requesting_profile_id", myself)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("referral_requests").select(REQ).neq("requesting_profile_id", myself).in("status", ["sent", "open"]).order("created_at", { ascending: false }).limit(60),
    // Everything you've answered, whatever happened next: the history.
    supabase
      .from("referral_responses")
      .select(`status, referral_request:referral_request_id(${REQ})`)
      .eq("responding_profile_id", myself)
      .order("created_at", { ascending: false })
      .limit(80),
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
    placed: (r.referral_responses || []).some((x: any) => x.status === "accepted"),
    audience: r.audience_type,
    audienceCount: r.audience_type === "selected" ? (r.audience_profile_ids || []).length : null,
  }));

  // Relevance for open referrals offered to me: selected/trusted always; the
  // wider network only when it overlaps my specialties and license states.
  const myFocus = new Set((myFocusRows || []).map((r: any) => Number(r.lookup_value_id)));
  const myStates = new Set((myLicences || []).map((l: any) => String(l.state).toUpperCase()));
  const relevant = (visibleRows || []).filter((r: any) => {
    if (r.audience_type === "selected" || r.audience_type === "trusted") return true;
    const ids: number[] = (r.specialism_lookup_ids || []).map(Number);
    const focusOk = ids.length === 0 || ids.some((id) => myFocus.has(id));
    const stateOk = !r.state || myStates.has(String(r.state).toUpperCase());
    return focusOk && stateOk;
  });
  const answered = new Map<number, { status: string; request: any }>();
  for (const row of (myResponseRows as any[]) || []) if (row.referral_request) answered.set(Number(row.referral_request.id), { status: row.status, request: row.referral_request });

  const toReceived = (r: any, myResponse: string | null): ReceivedItem => ({
    id: r.id,
    focus: focusName(r.specialism_lookup_ids, r.specialism_lookup_id),
    where: whereOf(r),
    status: r.status,
    createdAt: r.created_at,
    responses: 0,
    interested: 0,
    audience: r.audience_type,
    from: r.requester ? clinicianName(r.requester?.full_name, r.requester?.qualification_level, r.requester?.credential_prefix) : "A colleague",
    myResponse,
  });
  const received: ReceivedItem[] = [
    ...relevant.filter((r: any) => !answered.has(Number(r.id))).map((r: any) => toReceived(r, null)),
    ...[...answered.values()].map((a) => toReceived(a.request, a.status)),
  ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return <ReferIndexView options={options} mine={mine} offered={received} ok={ok} error={error} />;
}
