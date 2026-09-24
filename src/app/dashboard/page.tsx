import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { HomeView, type HomeData, type NextStep } from "./home-view";

// Home (Product Spec v1). Everything here is derived from real activity:
// requests, replies, invitations, messages, availability and licences.

const AVAIL = {
  referral: { yes: "Accepting", limited: "Selected referrals", no: "Not accepting" } as Record<string, string>,
  cover: { yes: "Available", ask_me: "Limited, ask me", no: "Not available" } as Record<string, string>,
  consult: { yes: "Open to consult", limited: "Limited", no: "Not now" } as Record<string, string>,
};

const nameOf = (p: any) => (p ? `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}` : "A colleague");

export default async function HomePage(props: { searchParams: Promise<{ reconfirmed?: string }> }) {
  const { reconfirmed } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", myself).maybeSingle();
  if (!profile) redirect("/dashboard/profile");

  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  const [
    options,
    { data: coverToMe },
    { data: myPlans },
    { data: myReferrals },
    { data: visibleReferrals },
    { data: myResponses },
    { data: pendingInvites },
    { data: connections },
    { count: savedCount },
    { data: worked },
    { data: myLicences },
    { data: myFocusRows },
    { data: conversationRows },
    { data: resourceRows },
  ] = await Promise.all([
    loadNeedOptions(supabase),
    supabase
      .from("coverage_requests")
      .select("id, coverage_plan_cases(specialism_lookup_ids, coverage_plans(title, absence_type, owner:profile_id(full_name, credential_prefix)))")
      .eq("requested_profile_id", myself)
      .eq("status", "sent"),
    supabase.from("coverage_plans").select("id, title, status, coverage_plan_cases(status)").eq("profile_id", myself).in("status", ["draft", "active"]),
    supabase
      .from("referral_requests")
      .select("id, specialism_lookup_ids, status, referral_responses(status)")
      .eq("requesting_profile_id", myself)
      .in("status", ["sent", "open", "connected"]),
    supabase
      .from("referral_requests")
      .select("id, specialism_lookup_ids, state, city, audience_type, created_at, requester:requesting_profile_id(full_name, credential_prefix)")
      .neq("requesting_profile_id", myself)
      .in("status", ["sent", "open"])
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("referral_responses").select("referral_request_id").eq("responding_profile_id", myself),
    supabase
      .from("connections")
      .select("id, requester:requester_id(full_name, credential_prefix)")
      .eq("addressee_id", myself)
      .eq("status", "pending"),
    supabase
      .from("connections")
      .select("requester_id, addressee_id, tier, responded_at, created_at")
      .eq("status", "accepted")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`),
    supabase.from("saved_clinicians").select("id", { count: "exact", head: true }).eq("profile_id", myself),
    supabase.from("worked_with_before").select("colleague_id").eq("profile_id", myself),
    supabase.from("licenses").select("state, status, expiration_date, reviewed_at").eq("profile_id", myself),
    supabase
      .from("profile_lookup_values")
      .select("lookup_value_id, lookup_values!inner(category)")
      .eq("profile_id", myself)
      .eq("lookup_values.category", "treatment_specialism"),
    supabase
      .from("conversation_participants")
      .select("last_read_at, conversation:conversation_id(last_message_at)")
      .eq("profile_id", myself),
    supabase.from("documents").select("id, title").eq("owner_scope", "world").eq("review_status", "published"),
  ]);

  const focusName = (ids: number[] | null) =>
    (ids || []).map((id) => options.focus.find((f) => f.id === Number(id))?.value).filter(Boolean).join(" + ") || "A referral";

  // ---- Next steps ----
  const steps: NextStep[] = [];
  for (const r of coverToMe || []) {
    const p = (r as any).coverage_plan_cases?.coverage_plans;
    steps.push({
      key: `cover-${r.id}`,
      title: `${nameOf(p?.owner)} asked you to cover a case`,
      detail: `${focusName((r as any).coverage_plan_cases?.specialism_lookup_ids)} · ${p?.title || "Cover plan"}`,
      href: "/dashboard/cover",
      action: "Respond",
      urgent: p?.absence_type === "unexpected",
    });
  }
  for (const p of myPlans || []) {
    const cases = (p as any).coverage_plan_cases || [];
    const open = cases.filter((c: any) => c.status === "needs_cover" || c.status === "declined_all").length;
    if (p.status === "draft") {
      steps.push({ key: `plan-${p.id}`, title: `Finish your cover plan: ${p.title}`, detail: `${cases.length} case${cases.length === 1 ? "" : "s"} added, nothing sent yet`, href: `/dashboard/cover/${p.id}?step=needs`, action: "Continue" });
    } else if (open > 0) {
      steps.push({ key: `plan-${p.id}`, title: `${p.title} has ${open} unresolved need${open === 1 ? "" : "s"}`, detail: `${cases.filter((c: any) => c.status === "confirmed").length} of ${cases.length} covered`, href: `/dashboard/cover/${p.id}?step=track`, action: "Review plan" });
    }
  }
  for (const r of myReferrals || []) {
    const replies = ((r as any).referral_responses || []).filter((x: any) => x.status === "interested" || x.status === "question").length;
    if (replies > 0 && r.status !== "connected") {
      steps.push({ key: `ref-${r.id}`, title: `${replies} colleague${replies === 1 ? "" : "s"} replied to your referral`, detail: focusName(r.specialism_lookup_ids), href: `/dashboard/refer/${r.id}`, action: "Review replies" });
    }
  }
  const answered = new Set((myResponses || []).map((r: any) => r.referral_request_id));
  const myFocus = new Set((myFocusRows || []).map((r: any) => Number(r.lookup_value_id)));
  const activeLicences = (myLicences || []).filter((l: any) => l.status === "active" && (!l.expiration_date || l.expiration_date >= today));
  const myStates = new Set(activeLicences.map((l: any) => String(l.state).toUpperCase()));
  const relevantRefs = (visibleReferrals || []).filter((r: any) => {
    if (answered.has(r.id)) return false;
    if (r.audience_type === "selected" || r.audience_type === "trusted") return true;
    const ids: number[] = (r.specialism_lookup_ids || []).map(Number);
    return (ids.length === 0 || ids.some((i) => myFocus.has(i))) && (!r.state || myStates.has(String(r.state).toUpperCase()));
  });
  for (const r of relevantRefs.filter((r: any) => r.audience_type !== "wider_network").slice(0, 3)) {
    steps.push({ key: `offer-${r.id}`, title: `${nameOf(r.requester)} sent you a referral`, detail: focusName(r.specialism_lookup_ids), href: `/dashboard/refer/${r.id}`, action: "Reply" });
  }
  for (const c of pendingInvites || []) {
    steps.push({ key: `inv-${c.id}`, title: `${nameOf((c as any).requester)} invited you to their trusted circle`, detail: "A relationship request is waiting for your decision", href: "/dashboard/network", action: "Review" });
  }
  const unread = (conversationRows || []).filter((r: any) => r.conversation && new Date(r.conversation.last_message_at) > new Date(r.last_read_at)).length;
  if (unread > 0) steps.push({ key: "msgs", title: `${unread} unread conversation${unread === 1 ? "" : "s"}`, detail: "Messages from colleagues", href: "/dashboard/messages", action: "Read" });

  const confirmedAt = profile.availability_confirmed_at as string | null;
  const age = confirmedAt ? Math.floor((Date.now() - new Date(confirmedAt).getTime()) / 86_400_000) : null;
  const stale = age === null || age > 30;
  if (stale) {
    steps.push({
      key: "avail",
      title: age === null ? "Set your availability" : "Confirm your availability",
      detail: age === null ? "Colleagues can't see whether you're taking referrals or cover" : `Last confirmed ${age} days ago. Colleagues see it as stale`,
      href: "/dashboard/availability",
      action: age === null ? "Set" : "Update",
    });
  }
  const expiring = activeLicences.filter((l: any) => l.expiration_date && l.expiration_date <= in90);
  for (const l of expiring) {
    const days = Math.ceil((new Date(l.expiration_date).getTime() - Date.now()) / 86_400_000);
    steps.push({ key: `lic-${l.state}`, title: `Your ${l.state} licence expires in ${days} day${days === 1 ? "" : "s"}`, detail: "Renew it and update Credentials to stay listed", href: "/dashboard/credentials", action: "Open", urgent: days <= 7 });
  }
  if (activeLicences.length > 0 && !activeLicences.some((l: any) => l.reviewed_at) && profile.verification_status === "verified") {
    steps.push({ key: "lic-review", title: "Your licence is awaiting review", detail: "You'll be listed and matched as soon as an admin has checked it. Nothing to do.", href: "/dashboard/credentials", action: "View" });
  }
  if (activeLicences.length === 0 && profile.verification_status === "verified") {
    steps.push({ key: "lic-none", title: "Add your licence", detail: "Members are only listed and matched with an active licence on record", href: "/dashboard/credentials", action: "Add" });
  }
  steps.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));

  // ---- Circle ----
  const trustedIds: string[] = [];
  let newThisMonth = 0;
  for (const c of connections || []) {
    const other = c.requester_id === myself ? c.addressee_id : c.requester_id;
    if (c.tier === "trusted_colleague" || c.tier === "partner") trustedIds.push(other);
    if ((c.responded_at || c.created_at) >= monthAgo) newThisMonth++;
  }
  let recentlyAvailable: string[] = [];
  if (trustedIds.length) {
    const { data: fresh } = await supabase
      .from("profiles")
      .select("full_name, credential_prefix")
      .in("id", trustedIds)
      .eq("referral_availability", "yes")
      .gte("availability_confirmed_at", weekAgo);
    recentlyAvailable = (fresh || []).map(nameOf);
  }

  // ---- Getting started (new members) ----
  const gettingStarted =
    trustedIds.length === 0 && age === null
      ? [
          { label: "Complete your profile", done: myFocus.size > 0 && !!profile.primary_state, href: "/dashboard/profile" },
          { label: "Confirm your availability", done: age !== null, href: "/dashboard/availability" },
          { label: "Invite three colleagues you already trust", done: trustedIds.length >= 3, href: "/dashboard/network" },
        ]
      : null;

  // ---- Resources for this moment ----
  const pick = (code: string, purpose: string) => {
    const doc = (resourceRows || []).find((d: any) => String(d.title).startsWith(code));
    return doc ? { code, title: String(doc.title).replace(/^PA-\d+:\s*/, ""), purpose, href: `/dashboard/documents/${code}` } : null;
  };
  const resources = [
    (myPlans || []).length ? pick("PA-02", "Guidance and a handoff pack for your cover plan.") : null,
    expiring.length ? pick("PA-19", "Keep renewals and compliance dates visible.") : null,
    (myReferrals || []).length ? pick("PA-07", "Referral outcomes and handoff responsibilities.") : null,
    pick("PA-05", "Shape a focused, de-identified case question."),
  ]
    .filter(Boolean)
    .slice(0, 2) as HomeData["resources"];

  const d: HomeData = {
    firstName: String(profile.full_name || "there").replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0],
    steps: steps.slice(0, 6),
    gettingStarted,
    availability: {
      referrals: AVAIL.referral[profile.referral_availability] || "Not set",
      cover: AVAIL.cover[profile.coverage_availability] || "Not set",
      consult: AVAIL.consult[profile.consultation_availability] || "Not set",
      confirmedLabel:
        age === null ? "Never confirmed" : age === 0 ? "Confirmed today" : `Last confirmed ${age} day${age === 1 ? "" : "s"} ago${stale ? ". Reconfirm to stay in suggestions" : ""}`,
      stale,
      canReconfirm: !!(profile.referral_availability && profile.coverage_availability && profile.consultation_availability),
    },
    relevant: [
      ...(coverToMe || []).slice(0, 2).map((r: any) => ({
        key: `c${r.id}`,
        title: `Cover request: ${focusName(r.coverage_plan_cases?.specialism_lookup_ids)}`,
        detail: `From ${nameOf(r.coverage_plan_cases?.coverage_plans?.owner)}`,
        why: "Sent to you",
        href: "/dashboard/cover",
      })),
      ...relevantRefs.slice(0, 4).map((r: any) => ({
        key: `r${r.id}`,
        title: `Referral: ${focusName(r.specialism_lookup_ids)}`,
        detail: `From ${nameOf(r.requester)}${r.state ? ` · ${r.state}` : ""}`,
        why: r.audience_type === "selected" ? "Sent to you" : r.audience_type === "trusted" ? "From your trusted circle" : "Matches your specialties and licence",
        href: `/dashboard/refer/${r.id}`,
      })),
    ].slice(0, 5),
    circle: { trusted: trustedIds.length, saved: savedCount || 0, workedWith: (worked || []).length, newThisMonth, recentlyAvailable },
    resources,
    options,
    notice: reconfirmed ? "Availability reconfirmed. Colleagues will see it as current." : undefined,
  };

  return <HomeView d={d} />;
}
