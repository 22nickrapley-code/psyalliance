import { redirect } from "next/navigation";
import { loadLedger, ledgerItems } from "@/lib/ledger";
import { effectiveReferral, effectiveCover } from "@/lib/availability";
import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { resolveAvatarUrls } from "@/lib/avatars";
import { clinicianName } from "@/lib/profession";
import { IS_DEMO_SITE } from "@/lib/env";
import { HomeView, type HomeData, type NextStep, type CircleNode } from "./home-view";

export const metadata = { title: "Home" };

// Home (Product Spec v1). Everything here is derived from real activity:
// requests, replies, invitations, messages, availability and licenses.

// Colour for an availability line: open, limited (selected / ask me), closed.
const toneOf = (open: boolean, value: string | null | undefined): "open" | "limited" | "closed" | "unset" =>
  !value ? "unset" : !open ? "closed" : value === "limited" || value === "ask_me" ? "limited" : "open";

const AVAIL = {
  referral: { yes: "Accepting", limited: "Selected referrals", no: "Not accepting" } as Record<string, string>,
  cover: { yes: "Available", ask_me: "Limited, ask me", no: "Not available" } as Record<string, string>,
  consult: { yes: "Open to consult", limited: "Limited", no: "Not now" } as Record<string, string>,
};

const nameOf = (p: any) => (p ? clinicianName(p.full_name, p.qualification_level, p.credential_prefix) : "A colleague");

export default async function HomePage(props: { searchParams: Promise<{ reconfirmed?: string; welcome?: string; sandbox_error?: string }> }) {
  const { reconfirmed, welcome, sandbox_error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const { data: profile } = await supabase.rpc("my_profile").maybeSingle<any>();
  if (!profile) redirect("/dashboard/profile");
  // Admin-only logins have no practice: their home is the admin overview.
  if (profile.account_kind === "operator") redirect("/dashboard/admin");
  const [{ data: status }, { count: licenceCount }] = await Promise.all([
    supabase.rpc("my_network_status").maybeSingle<any>(),
    supabase.from("licenses").select("id", { count: "exact", head: true }).eq("profile_id", myself),
  ]);

  const myAvatar = (await resolveAvatarUrls(supabase, [profile.avatar_path])).get(profile.avatar_path || "") || null;
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
    { data: savedRows },
    { data: worked },
    { data: myLicences },
    { data: myFocusRows },
    { data: conversationRows },
    { data: resourceRows },
  ] = await Promise.all([
    loadNeedOptions(supabase),
    supabase
      .from("coverage_requests")
      .select("id, coverage_plan_cases(specialism_lookup_ids, coverage_plans(id, title, absence_type, starts_on, ends_on, jurisdiction_state, profile_id, owner:profile_id(full_name, credential_prefix, qualification_level)))")
      .eq("requested_profile_id", myself)
      .eq("status", "sent"),
    supabase.from("coverage_plans").select("id, title, status, coverage_plan_cases(status)").eq("profile_id", myself).in("status", ["draft", "active"]),
    supabase
      .from("referral_requests")
      .select("id, specialism_lookup_ids, status, audience_type, audience_profile_ids, referral_responses(status)")
      .eq("requesting_profile_id", myself)
      .in("status", ["sent", "open", "connected"]),
    supabase
      .from("referral_requests")
      .select("id, specialism_lookup_ids, state, city, audience_type, created_at, requesting_profile_id, requester:requesting_profile_id(full_name, credential_prefix, qualification_level)")
      .neq("requesting_profile_id", myself)
      .in("status", ["sent", "open"])
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("referral_responses").select("referral_request_id").eq("responding_profile_id", myself),
    supabase
      .from("connections")
      .select("id, requester_id, requester:requester_id(full_name, credential_prefix, qualification_level)")
      .eq("addressee_id", myself)
      .eq("status", "pending"),
    supabase
      .from("connections")
      .select("requester_id, addressee_id, tier, responded_at, created_at")
      .eq("status", "accepted")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`),
    supabase.from("saved_clinicians").select("clinician_id").eq("profile_id", myself),
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
    supabase.from("documents").select("id, title, library_code, review_status").eq("owner_scope", "world").in("review_status", ["published", "provisional"]),
  ]);

  const focusName = (ids: number[] | null) =>
    (ids || []).map((id) => options.focus.find((f) => f.id === Number(id))?.value).filter(Boolean).join(" + ") || "A referral";

  // ---- Next steps ----
  const steps: NextStep[] = [];
  // One step per colleague's plan, however many of its cases they asked
  // you about: the per-case decisions live on Cover.
  const coverGroups = new Map<string, { plan: any; focus: string[]; count: number }>();
  for (const r of coverToMe || []) {
    const pc = (r as any).coverage_plan_cases;
    const p = pc?.coverage_plans;
    const key = String(p?.id ?? `r${r.id}`);
    const g = coverGroups.get(key) || { plan: p, focus: [], count: 0 };
    g.count += 1;
    const f = focusName(pc?.specialism_lookup_ids);
    if (!g.focus.includes(f)) g.focus.push(f);
    coverGroups.set(key, g);
  }
  const ABSENCE_LABEL: Record<string, string> = {
    short_planned: "Short planned absence",
    extended_leave: "Extended leave",
    unexpected: "Unexpected absence",
    closing_practice: "Closing practice",
    reciprocal: "Reciprocal cover",
  };
  for (const [key, g] of coverGroups) {
    const p = g.plan;
    steps.push({
      key: `cover-${key}`,
      title: `${nameOf(p?.owner)} asked you to cover ${g.count === 1 ? "a client" : `${g.count} clients`}`,
      detail: [g.focus.join(" and "), ABSENCE_LABEL[p?.absence_type] || p?.title, p?.jurisdiction_state, shortRange(p?.starts_on, p?.ends_on)].filter(Boolean).join(" · "),
      href: "/dashboard/cover",
      action: "Review request",
      person: p?.profile_id ? { id: p.profile_id, name: nameOf(p?.owner) } : undefined,
      urgent: p?.absence_type === "unexpected",
      rank: 0,
    });
  }
  for (const p of myPlans || []) {
    const cases = (p as any).coverage_plan_cases || [];
    const open = cases.filter((c: any) => c.status === "needs_cover" || c.status === "declined_all").length;
    if (p.status === "draft") {
      steps.push({ key: `plan-${p.id}`, title: `Finish your cover plan: ${p.title}`, detail: `${cases.length} client${cases.length === 1 ? "" : "s"} added, nothing sent yet`, href: `/dashboard/cover/${p.id}?step=needs`, action: "Continue", rank: 1 });
    } else if (open > 0) {
      steps.push({ key: `plan-${p.id}`, title: `${p.title}: ${open} client${open === 1 ? "" : "s"} still need${open === 1 ? "s" : ""} a colleague`, detail: `${cases.filter((c: any) => c.status === "confirmed").length} of ${cases.length} covered`, href: `/dashboard/cover/${p.id}?step=track`, action: "Review plan", rank: 1 });
    }
  }
  for (const r of myReferrals || []) {
    const resp = (r as any).referral_responses || [];
    const replies = resp.filter((x: any) => x.status === "interested" || x.status === "question").length;
    const audience = (r as any).audience_type === "selected" ? ((r as any).audience_profile_ids || []).length : 0;
    if (replies > 0 && r.status !== "connected") {
      const ready = audience > 0 && resp.length >= audience;
      steps.push({
        key: `ref-${r.id}`,
        title: ready ? `Your ${focusName(r.specialism_lookup_ids)} referral is ready to choose` : `${replies} colleague${replies === 1 ? "" : "s"} replied to your referral`,
        detail: ready ? `Everyone you asked has replied. ${replies} interested` : focusName(r.specialism_lookup_ids),
        href: `/dashboard/refer/${r.id}`,
        action: ready ? "Choose a colleague" : "Review replies",
        rank: 2,
      });
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
  // Incoming referrals are one decision queue, not one step each.
  const incoming = relevantRefs.filter((r: any) => r.audience_type !== "wider_network");
  if (incoming.length === 1) {
    const r: any = incoming[0];
    steps.push({ key: `offer-${r.id}`, title: `${nameOf(r.requester)} sent you a referral`, detail: [focusName(r.specialism_lookup_ids), r.city || r.state].filter(Boolean).join(" · "), href: `/dashboard/refer/${r.id}`, action: "Reply", rank: 3, person: { id: r.requesting_profile_id, name: nameOf(r.requester) } });
  } else if (incoming.length > 1) {
    steps.push({
      key: "offers",
      title: `${incoming.length} referrals are waiting for your reply`,
      detail: incoming.slice(0, 3).map((r: any) => `${focusName(r.specialism_lookup_ids)} from ${nameOf(r.requester).split(",")[0]}`).join(" · "),
      href: "/dashboard/refer",
      action: "Review referrals",
      rank: 3,
    });
  }
  if ((pendingInvites || []).length === 1) {
    const c: any = (pendingInvites || [])[0];
    steps.push({ key: `inv-${c.id}`, title: `${nameOf(c.requester)} invited you to their trusted circle`, detail: "A relationship request is waiting for your decision", href: `/dashboard/people/${c.requester_id}`, action: "Review", rank: 4, person: { id: c.requester_id, name: nameOf(c.requester) } });
  } else if ((pendingInvites || []).length > 1) {
    steps.push({ key: "invs", title: `${(pendingInvites || []).length} colleagues invited you to their trusted circle`, detail: (pendingInvites || []).map((c: any) => nameOf(c.requester).split(",")[0]).join(", "), href: "/dashboard/network", action: "Review", rank: 4 });
  }
  const unread = (conversationRows || []).filter((r: any) => r.conversation && new Date(r.conversation.last_message_at) > new Date(r.last_read_at)).length;
  // Colleagues who named you as their continuity backup.
  const { data: dutyRows } = await supabase.rpc("my_continuity_duties");
  const askedDuties = ((dutyRows as any[]) || []).filter((d) => d.status === "invited");
  if (askedDuties.length > 0) {
    const who = askedDuties.map((d) => clinicianName(d.owner_name, d.qualification_level, d.credential_prefix));
    steps.push({
      key: "duty",
      title: askedDuties.length === 1 ? `${who[0]} named you as their backup` : `${askedDuties.length} colleagues named you as their backup`,
      detail: "If they can't practice, you'd look after their clients and records. Agree, talk first, or decline.",
      href: "/dashboard/continuity/duties",
      action: "Reply",
      rank: 4,
    });
  }
  if (unread > 0) steps.push({ key: "msgs", title: `${unread} unread conversation${unread === 1 ? "" : "s"}`, detail: "Messages from colleagues", href: "/dashboard/messages", action: "Read", rank: 5 });

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
      rank: 6,
    });
  }
  const expiring = activeLicences.filter((l: any) => l.expiration_date && l.expiration_date <= in90);
  for (const l of expiring) {
    const days = Math.ceil((new Date(l.expiration_date).getTime() - Date.now()) / 86_400_000);
    steps.push({ key: `lic-${l.state}`, title: `Your ${l.state} license expires in ${days} day${days === 1 ? "" : "s"}`, detail: "Renew it and update Credentials to stay listed", href: "/dashboard/credentials", action: "Open", urgent: days <= 7, rank: 6 });
  }
  // Waiting on PsyAlliance, not on the member: a status line, not a task.
  let statusLine: string | undefined;
  if (activeLicences.length > 0 && !activeLicences.some((l: any) => l.reviewed_at) && profile.verification_status === "verified") {
    statusLine = "Your license is with a reviewer. You'll be listed and matched as soon as it's checked; nothing for you to do.";
  }
  if (activeLicences.length === 0 && profile.verification_status === "verified") {
    steps.push({ key: "lic-none", title: "Add your license", detail: "Members are only listed and matched with an active license on record", href: "/dashboard/credentials", action: "Add", rank: 1 });
  }
  steps.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || (a.rank ?? 9) - (b.rank ?? 9));

  // Referrals in the wider network that fit this member's practice.
  const wider = relevantRefs.filter((r: any) => r.audience_type === "wider_network");
  if (wider.length > 0) {
    steps.push({
      key: "wider",
      title: `${wider.length} referral${wider.length === 1 ? "" : "s"} in the network match${wider.length === 1 ? "es" : ""} your practice`,
      detail: wider.slice(0, 2).map((r: any) => `${focusName(r.specialism_lookup_ids)} from ${nameOf(r.requester).split(",")[0]}`).join(" · "),
      href: "/dashboard/refer",
      action: "Have a look",
      rank: 5,
    });
    steps.sort((x, y) => Number(!!y.urgent) - Number(!!x.urgent) || (x.rank ?? 9) - (y.rank ?? 9));
  }


  // ---- Circle (counted for getting started; drawn on Network) ----
  const trustedIds: string[] = [];
  for (const c of connections || []) {
    const other = c.requester_id === myself ? c.addressee_id : c.requester_id;
    if (c.tier === "trusted_colleague" || c.tier === "partner") trustedIds.push(other);
  }

  // ---- Circle snapshot: who in the trusted circle is open right now ----
  const { data: circlePeople } = trustedIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, credential_prefix, qualification_level, avatar_path, referral_availability, coverage_availability, availability_confirmed_at, availability_paused_until")
        .in("id", trustedIds.slice(0, 60))
    : { data: [] as any[] };
  const circleUrls = await resolveAvatarUrls(supabase, (circlePeople || []).map((p: any) => p.avatar_path));
  const circleRows = (circlePeople || []).map((p: any) => ({
    id: p.id as string,
    name: clinicianName(p.full_name, p.qualification_level, p.credential_prefix),
    avatarUrl: circleUrls.get(p.avatar_path || "") || null,
    referrals: effectiveReferral(p.referral_availability, p.availability_confirmed_at, p.availability_paused_until).open,
    cover: effectiveCover(p.coverage_availability, p.availability_confirmed_at, p.availability_paused_until).open,
  }));
  circleRows.sort((a, b) => Number(b.referrals || b.cover) - Number(a.referrals || a.cover) || a.name.localeCompare(b.name));
  const circleSnapshot = {
    trusted: trustedIds.length,
    referrals: circleRows.filter((r) => r.referrals).length,
    cover: circleRows.filter((r) => r.cover).length,
    people: circleRows.slice(0, 7).map((r) => ({ id: r.id, name: r.name, avatarUrl: r.avatarUrl, open: r.referrals || r.cover })),
  };

  // ---- Getting started (new members) ----
  // Not yet in the network: the steps that get them verified.
  const awaitingVerification = !status?.is_member && !IS_DEMO_SITE;
  // Not in the network yet: still being verified, or verified in a state
  // that hasn't opened (my_access, 0102).
  const { data: accessRaw } = awaitingVerification ? await supabase.rpc("my_access") : { data: null };
  const access = (accessRaw as any) || null;
  const verifiedWaiting = awaitingVerification && profile.verification_status === "verified" && !!status?.has_reviewed_licence;
  let gettingStarted: { label: string; done: boolean; href: string; waiting?: boolean }[] | null = null;
  if (awaitingVerification) {
    gettingStarted = [
      { label: "Complete your profile: specialties and practice state", done: myFocus.size > 0 && !!profile.primary_state, href: "/dashboard/profile" },
      { label: "Add your license so we can review it", done: (licenceCount || 0) > 0, href: "/dashboard/credentials" },
      { label: "Set your availability", done: age !== null, href: "/dashboard/availability" },
      { label: "We check your license against the state board", done: verifiedWaiting, href: "/dashboard/credentials", waiting: true },
    ];
    if (verifiedWaiting) {
      gettingStarted.push({ label: `PsyAlliance opens in your state`, done: false, href: "/dashboard", waiting: true });
    }
  } else if (trustedIds.length === 0 && age === null) {
    // A continuity plan counts once it's started, or once they've saved a
    // working copy of the Professional Will template to write it on paper.
    const [{ count: pa03Copies }, { data: plan }] = await Promise.all([
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("profile_id", myself).eq("owner_scope", "personal").or("sources.like.Working copy of PA-03%,sources.like.Working copy of the Professional Will%,sources.like.Your copy of the Professional Will%"),
      supabase.from("continuity_plans").select("updated_at").eq("profile_id", myself).maybeSingle(),
    ]);
    gettingStarted = [
      { label: "Complete your profile", done: myFocus.size > 0 && !!profile.primary_state, href: "/dashboard/profile" },
      { label: "Confirm your availability", done: age !== null, href: "/dashboard/availability" },
      { label: "Invite three colleagues you already trust", done: trustedIds.length >= 3, href: "/dashboard/network" },
      { label: "Make your continuity plan", done: (pa03Copies || 0) > 0 || !!plan, href: "/dashboard/continuity" },
    ];
  }

  const ledger = await loadLedger(supabase, myself);

  const d: HomeData = {
    firstName: String(profile.full_name || "there").replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0],
    steps,
    statusLine,
    today: new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }),
    greeting: greetingFor(new Date()),
    gettingStarted,
    awaitingVerification,
    access: awaitingVerification
      ? {
          verified: verifiedWaiting,
          openStates: (access?.open_states as string[]) || [],
          waitlist: ((access?.waitlist as any[]) || []).map((w) => ({ state: String(w.state), position: Number(w.position), waiting: Number(w.waiting) })),
        }
      : null,
    error: sandbox_error || null,
    availability: {
      referrals: effectiveReferral(profile.referral_availability, profile.availability_confirmed_at, profile.availability_paused_until).label,
      cover: effectiveCover(profile.coverage_availability, profile.availability_confirmed_at, profile.availability_paused_until).label,
      consult: AVAIL.consult[profile.consultation_availability] || "Not set",
      confirmedLabel:
        age === null ? "Never confirmed" : age === 0 ? "Confirmed today" : `Last confirmed ${age} day${age === 1 ? "" : "s"} ago${stale ? ". Reconfirm to stay in suggestions" : ""}`,
      stale,
      canReconfirm: !!(profile.referral_availability && profile.coverage_availability && profile.consultation_availability),
      tones: {
        referrals: toneOf(effectiveReferral(profile.referral_availability, profile.availability_confirmed_at, profile.availability_paused_until).open, profile.referral_availability),
        cover: toneOf(effectiveCover(profile.coverage_availability, profile.availability_confirmed_at, profile.availability_paused_until).open, profile.coverage_availability),
        consult: profile.consultation_availability === "yes" ? "open" : profile.consultation_availability ? "closed" : "unset",
      },
    },
    circleSnapshot,
    ledger: ledgerItems(ledger),
    ledgerYear: ledger.year,
    sandbox: IS_DEMO_SITE,
    options,
    notice: reconfirmed
      ? "Availability reconfirmed. Colleagues will see it as current."
      : welcome === "reset"
        ? "Your sandbox is back to the start. Everything you did has been cleared; colleagues will start getting in touch again in a minute or two."
        : undefined,
  };

  return <HomeView d={d} />;
}

function shortRange(start?: string | null, end?: string | null) {
  if (!start) return "";
  const f = (x: string) => new Date(x + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return end ? `${f(start)} to ${f(end)}` : `From ${f(start)}`;
}

function greetingFor(now: Date) {
  const h = Number(now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function initialsOf(name: string | null) {
  return String(name || "")
    .replace(/^(dr\.?)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
