import { createClient } from "@/lib/supabase/server";
import { computeRankedCandidates } from "@/lib/server-matching";
import { setProfileFlag } from "./actions";
import { professionFor, professionLabel } from "@/lib/profession";
import UsStateDatalist from "@/components/us-state-datalist";
import { caseMonthlyGross, caseMonthlyNet, currency } from "@/lib/finance";
import { buildTierMap, rankRecommended, type Tier } from "@/lib/tiers";
import ToggleBox from "@/components/toggle-box";
import { resolveAvatarUrls } from "@/lib/avatars";
import Avatar from "./avatar";

const PIE_COLORS = ["#1f4d3f", "#b08d57", "#6b4c6b", "#2456a6", "#a3372c", "#4a4842", "#7a3fa0"];

function TierName({ id, name, tier, avatarUrl }: { id: string; name: string; tier: Tier; avatarUrl?: string | null }) {
  const link = (
    <a href={`/dashboard/people/${id}`} className={tier === "none" ? "person-link" : `person-link tier-${tier}`}>
      {name}
    </a>
  );
  if (avatarUrl === undefined) return link;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
      <Avatar url={avatarUrl} name={name} size={22} ring={tier} />
      {link}
    </span>
  );
}

function ToggleButton({ flag, value, label, compact }: { flag: string; value: boolean; label: string; compact?: boolean }) {
  return (
    <div className={compact ? "ov-toggle-row" : "toggle-row"}>
      <span>{label}</span>
      <form action={setProfileFlag} style={{ display: "inline" }}>
        <input type="hidden" name="flag" value={flag} />
        <input type="hidden" name="value" value={(!value).toString()} />
        <button type="submit" className="oswitch-row" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} aria-pressed={value} title="Click to toggle">
          <span className={`oswitch-text ${value ? "yes" : "no"}`}>{value ? "Yes" : "No"}</span>
          <span className={`oswitch oswitch-btn ${value ? "yes" : "no"}`} />
        </button>
      </form>
    </div>
  );
}

function GoLink({ href }: { href: string }) {
  return <a href={href} className="go-link">Go &rarr;</a>;
}

export default async function DashboardHome(
  props: {
    searchParams: Promise<{
      ref_initials?: string;
      ref_state?: string;
      ref_session_type?: string;
      ref_insurance?: string;
      ref_primary?: string;
      ref_secondary?: string;
      ref_tertiary?: string;
      box?: string;
      error?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [
    { data: profile },
    { count: caseCount },
    { count: docCount },
    { count: pendingConnectionCount },
    { data: myOpenRequests },
    { data: pendingProviderReferrals },
    { count: expiringLicenseCountRaw },
    { count: expiringPanelCountRaw },
    { count: plannerOfferCount },
    { data: myConversationRows },
    { data: acceptedConnections },
    { data: myLookups },
    { data: blocklist },
    { data: allSpecialisms },
    { data: insuranceOptions },
    { data: sessionTypeOptions },
    { data: townHallRecent },
    { data: activeCases },
    { data: recentPersonalDocs },
    { data: recentSharedDocs },
    { data: incomeBooks },
    { data: overheadExpenses },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", myself).maybeSingle(),
    supabase.from("caseload_clients").select("id", { count: "exact", head: true }).eq("profile_id", myself).eq("is_active", true),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("profile_id", myself),
    supabase.from("connections").select("id", { count: "exact", head: true }).eq("addressee_id", myself).eq("status", "pending"),
    supabase.from("referral_requests").select("id, referral_responses(status)").eq("requesting_profile_id", myself).eq("status", "open"),
    // Physician referrals awaiting a response - shown in the "My messages"
    // Notices tab below so they're never a blind spot on Overview.
    supabase
      .from("provider_referrals")
      .select("id, reason, urgency, created_at, referring_providers(full_name, practice_name)")
      .eq("target_profile_id", myself)
      .eq("status", "sent")
      .order("created_at", { ascending: false }),
    supabase
      .from("licenses")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", myself)
      .lte("expiration_date", new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .not("expiration_date", "is", null),
    supabase
      .from("insurance_panels")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", myself)
      .lte("renewal_date", new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .not("renewal_date", "is", null),
    supabase.from("planner_offers").select("id", { count: "exact", head: true }).eq("candidate_profile_id", myself).eq("status", "offered"),
    supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at, conversation:conversation_id(id, title, last_message_at, created_by)")
      .eq("profile_id", myself),
    supabase
      .from("connections")
      .select("*, requester:requester_id(full_name, avatar_path), addressee:addressee_id(full_name, avatar_path)")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`)
      .eq("status", "accepted"),
    supabase.from("profile_lookup_values").select("lookup_value_id, lookup_values(category, value)").eq("profile_id", myself),
    supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself),
    supabase.from("lookup_values").select("id, value").eq("category", "treatment_specialism").order("value"),
    supabase.from("lookup_values").select("value").eq("category", "insurance").order("value"),
    supabase.from("lookup_values").select("value").eq("category", "session_type").order("value"),
    supabase
      .from("town_hall_messages")
      .select("id, body, created_at, channel_id, author:author_id(id, full_name, avatar_path), channel:channel_id(name, slug)")
      .is("parent_message_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("caseload_clients")
      .select("id, state, primary_need, rate_per_session, sessions_per_week, book_of_business_id")
      .eq("profile_id", myself)
      .eq("is_active", true),
    supabase.from("documents").select("id, title, created_at").eq("profile_id", myself).eq("owner_scope", "personal").order("created_at", { ascending: false }).limit(4),
    supabase.from("documents").select("id, title, created_at, uploader:uploaded_by(full_name)").eq("owner_scope", "world").order("created_at", { ascending: false }).limit(4),
    supabase.from("books_of_business").select("id, name, expense_burden_pct").eq("profile_id", myself),
    supabase.from("practice_overhead_expenses").select("monthly_cost").eq("profile_id", myself),
  ]);

  const expiringLicenseCount = expiringLicenseCountRaw ?? 0;
  const expiringPanelCount = expiringPanelCountRaw ?? 0;

  const peerOffersAwaitingDecision = (myOpenRequests || []).reduce(
    (sum, r: any) => sum + (r.referral_responses || []).filter((resp: any) => resp.status === "offered").length,
    0
  );
  const providerReferralsAwaitingDecision = (pendingProviderReferrals || []).length;
  // Both feed the same "Referral notices" tab in Messages now, so Overview
  // treats them as one combined attention item rather than two separate ones.
  const offersAwaitingDecision = peerOffersAwaitingDecision + providerReferralsAwaitingDecision;

  const unreadMessageCount = (myConversationRows || []).filter((r: any) => {
    if (!r.conversation) return false;
    return new Date(r.conversation.last_message_at) > new Date(r.last_read_at);
  }).length;

  const hasAttentionItems =
    (pendingConnectionCount ?? 0) > 0 ||
    offersAwaitingDecision > 0 ||
    expiringLicenseCount > 0 ||
    expiringPanelCount > 0 ||
    (plannerOfferCount ?? 0) > 0 ||
    unreadMessageCount > 0;

  // ---------- My World: Partners / Bench / Recommended ----------
  const partners: { id: string; name: string; avatarPath: string | null }[] = [];
  const bench: { id: string; name: string; avatarPath: string | null }[] = [];
  const connectedIds = new Set<string>();
  for (const c of acceptedConnections || []) {
    const other = c.requester_id === myself ? (c.addressee as any) : (c.requester as any);
    const otherId = c.requester_id === myself ? c.addressee_id : c.requester_id;
    connectedIds.add(otherId);
    const entry = { id: otherId, name: other?.full_name, avatarPath: other?.avatar_path || null };
    if (c.tier === "partner") partners.push(entry);
    else bench.push(entry);
  }
  const tierByOtherId = buildTierMap(acceptedConnections as any, myself);
  const mySpecialisms = new Set(
    (myLookups || []).filter((l: any) => l.lookup_values?.category === "treatment_specialism").map((l: any) => l.lookup_values.value)
  );
  const blockedIds = new Set((blocklist || []).map((b) => b.blocked_profile_id));
  // A lighter version of Network's "recommended" computation - just enough
  // to show the top 5 (ranked by shared-specialism overlap, then recent
  // activity - see rankRecommended) on the Overview widget; the full
  // interactive list with actions lives on the Network page itself. Nick's
  // rule: recommended never shows more than 5 anywhere, recomputed live
  // rather than a fixed list.
  const { data: directoryForRecommended } = mySpecialisms.size > 0
    ? await supabase.from("public_directory").select("id, full_name, category, value, last_active_at, avatar_path")
    : { data: [] as any[] };
  const recommendedCandidates = new Map<string, { id: string; name: string; sharedCount: number; lastActiveAt: string | null; avatarPath: string | null }>();
  for (const row of directoryForRecommended || []) {
    if (row.id === myself || connectedIds.has(row.id) || blockedIds.has(row.id)) continue;
    if (row.category === "treatment_specialism" && mySpecialisms.has(row.value)) {
      const entry = recommendedCandidates.get(row.id) || { id: row.id, name: row.full_name, sharedCount: 0, lastActiveAt: row.last_active_at, avatarPath: (row as any).avatar_path || null };
      entry.sharedCount += 1;
      recommendedCandidates.set(row.id, entry);
    }
  }
  const recommendedTotal = recommendedCandidates.size;
  const recommendedTop5 = rankRecommended(Array.from(recommendedCandidates.values()), 5);
  const recommendedNames = new Map(recommendedTop5.map((r) => [r.id, r.name]));

  // ---------- Town Hall preview ----------
  const townHallGrouped = (townHallRecent || []).slice(0, 5);

  // ---------- Messages preview ----------
  // Same Inbox/Sent split as the full Messages page. Both lists are fetched
  // and rendered up front (not just whichever box the URL says), so the
  // Inbox/Sent toggle below can be a client-side swap with no page reload.
  const inboxRows = [...(myConversationRows || [])]
    .filter((r: any) => r.conversation && r.conversation.created_by !== myself)
    .sort((a: any, b: any) => new Date(b.conversation.last_message_at).getTime() - new Date(a.conversation.last_message_at).getTime())
    .slice(0, 4);
  const sentRows = [...(myConversationRows || [])]
    .filter((r: any) => r.conversation && r.conversation.created_by === myself)
    .sort((a: any, b: any) => new Date(b.conversation.last_message_at).getTime() - new Date(a.conversation.last_message_at).getTime())
    .slice(0, 4);
  const previewConversationIds = [...inboxRows, ...sentRows].map((r: any) => r.conversation.id);
  const [{ data: previewParticipants }, { data: previewMessages }] = await Promise.all([
    previewConversationIds.length
      ? supabase.from("conversation_participants").select("conversation_id, profile_id, profile:profile_id(full_name, avatar_path)").in("conversation_id", previewConversationIds)
      : Promise.resolve({ data: [] as any[] }),
    previewConversationIds.length
      ? supabase
          .from("conversation_messages")
          .select("conversation_id, body, author_id, created_at")
          .in("conversation_id", previewConversationIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const otherPeopleByConversation = new Map<number, { id: string; name: string; avatarPath: string | null }[]>();
  for (const p of previewParticipants || []) {
    if (p.profile_id === myself) continue;
    const list = otherPeopleByConversation.get(p.conversation_id) || [];
    list.push({ id: p.profile_id, name: (p.profile as any)?.full_name || "Colleague", avatarPath: (p.profile as any)?.avatar_path || null });
    otherPeopleByConversation.set(p.conversation_id, list);
  }
  const latestByConversation = new Map<number, any>();
  for (const m of previewMessages || []) {
    if (!latestByConversation.has(m.conversation_id)) latestByConversation.set(m.conversation_id, m);
  }
  const tierOf = (id: string): Tier => tierByOtherId.get(id) || (recommendedCandidates.has(id) ? "recommended" : "none");

  // One batched resolve for every avatar_path referenced anywhere on this
  // page (My World, Messages preview, Town Hall preview) - per Nick's rule
  // that a name shown anywhere should carry the person's real picture (or
  // initials) alongside it, not just colored text.
  const overviewAvatarUrlByPath = await resolveAvatarUrls(supabase, [
    ...partners.map((p) => p.avatarPath),
    ...bench.map((p) => p.avatarPath),
    ...Array.from(recommendedCandidates.values()).map((r) => r.avatarPath),
    ...Array.from(otherPeopleByConversation.values()).flatMap((list) => list.map((p) => p.avatarPath)),
    ...townHallGrouped.map((m: any) => m.author?.avatar_path),
  ]);
  const avatarUrlOf = (path: string | null | undefined) => overviewAvatarUrlByPath.get(path || "") || null;

  function renderMessageRows(rows: any[]) {
    return (
      <>
        {rows.map((r: any) => {
          const conv = r.conversation;
          const others = otherPeopleByConversation.get(conv.id) || [];
          const latest = latestByConversation.get(conv.id);
          const needsReply = !!latest && latest.author_id !== myself && (!r.last_read_at || new Date(latest.created_at) > new Date(r.last_read_at));
          const when = latest ? new Date(latest.created_at) : conv.last_message_at ? new Date(conv.last_message_at) : null;
          return (
            <a key={conv.id} href={`/dashboard/messages/${conv.id}`} className={`ov-feed-row${needsReply ? " needs-reply" : ""}`}>
              <span className="title" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <span>
                  {others.length > 0
                    ? others.map((o, i) => (
                        <span key={o.id}>
                          {i > 0 && ", "}
                          <TierName id={o.id} name={o.name} tier={tierOf(o.id)} avatarUrl={avatarUrlOf(o.avatarPath)} />
                        </span>
                      ))
                    : "Conversation"}
                  {conv.title && <span className="muted"> · {conv.title}</span>}
                  {needsReply && <span className="tag gold" style={{ marginLeft: "0.4rem" }}>Needs your reply</span>}
                </span>
                {when && (
                  <span className="muted" style={{ fontSize: "0.7rem", flex: "0 0 auto" }}>
                    {when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </span>
              <span className="snippet">{latest ? latest.body : "No messages yet"}</span>
            </a>
          );
        })}
        {rows.length === 0 && (
          <p className="muted">
            Nothing here yet. <a href="/dashboard/messages">Send a new message</a> to get a conversation going.
          </p>
        )}
      </>
    );
  }

  // Physician referrals + colleagues' offers, both awaiting a decision -
  // the same "Referral notices" content that lives in full on Messages,
  // shown here in miniature so this widget is never a blind spot for them.
  function renderNoticePreviewRows() {
    const peerRows = (myOpenRequests || []).flatMap((r: any) =>
      (r.referral_responses || [])
        .filter((resp: any) => resp.status === "offered")
        .map((resp: any) => ({ kind: "peer" as const, requestId: r.id }))
    );
    const hasAny = (pendingProviderReferrals || []).length > 0 || peerRows.length > 0;
    return (
      <>
        {(pendingProviderReferrals || []).map((r: any) => (
          <a key={`pr-${r.id}`} href="/dashboard/messages" className="ov-feed-row needs-reply">
            <span className="title">
              <span>
                {r.referring_providers?.full_name || "A physician"}
                {r.referring_providers?.practice_name ? `, ${r.referring_providers.practice_name}` : ""}
                <span className={`tag${r.urgency === "urgent" ? " danger" : ""}`} style={{ marginLeft: "0.4rem" }}>{r.urgency}</span>
              </span>
            </span>
            <span className="snippet">{r.reason}</span>
          </a>
        ))}
        {peerOffersAwaitingDecision > 0 && (
          <a href="/dashboard/messages" className="ov-feed-row needs-reply">
            <span className="title"><span>Colleague offers to help</span></span>
            <span className="snippet">
              {peerOffersAwaitingDecision} offer{peerOffersAwaitingDecision === 1 ? "" : "s"} on your posted referral requests
            </span>
          </a>
        )}
        {!hasAny && (
          <p className="muted">
            Nothing here yet. Physician referrals and offers on your posted requests will show up here.
          </p>
        )}
      </>
    );
  }

  // ---------- Caseload distribution + auto-matched professionals ----------
  const needCounts = new Map<string, number>();
  for (const c of activeCases || []) {
    if (c.primary_need) needCounts.set(c.primary_need, (needCounts.get(c.primary_need) || 0) + 1);
  }
  const totalCases = (activeCases || []).length;
  const needEntries = Array.from(needCounts.entries()).sort((a, b) => b[1] - a[1]);

  // Conic-gradient pie built from plain percentages - no charting library
  // needed for a handful of static slices. Capped at the top 5 primary
  // treatment areas per Nick's spec.
  let pieGradient = "";
  let cursor = 0;
  const pieSlices = needEntries.slice(0, 5).map(([need, count], i) => {
    const pct = totalCases > 0 ? (count / totalCases) * 100 : 0;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    const start = cursor;
    cursor += pct;
    return { need, count, pct, color, start, end: cursor };
  });
  pieGradient = pieSlices.length > 0
    ? `conic-gradient(${pieSlices.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ")})`
    : "var(--bg-alt)";

  // ---------- My caseload widget stats (Active / Sessions p.w. / Avg rate) -
  // same figures, same math, as the per-organization stat boxes on the
  // Caseload page, just rolled up across every active client instead of one
  // organization at a time. ----------
  const totalSessionsPerWeek = (activeCases || []).reduce((sum, c: any) => sum + (Number(c.sessions_per_week) || 0), 0);
  const ratedActiveCases = (activeCases || []).filter((c: any) => c.rate_per_session !== null && c.rate_per_session !== undefined);
  const avgHourlyRate = ratedActiveCases.length > 0
    ? ratedActiveCases.reduce((sum: number, c: any) => sum + Number(c.rate_per_session), 0) / ratedActiveCases.length
    : null;

  // ---------- Annual income (same math as the Income page, just rolled up
  // to a single annualized true-net figure for a quick-glance widget) ----------
  const incomeBooksList = incomeBooks || [];
  const monthlyGross = (activeCases || []).reduce((sum, c: any) => sum + caseMonthlyGross(c), 0);
  const monthlyNet = (activeCases || []).reduce((sum, c: any) => sum + caseMonthlyNet(c, incomeBooksList), 0);
  const monthlyOverhead = (overheadExpenses || []).reduce((sum, o) => sum + Number(o.monthly_cost || 0), 0);
  const monthlyTrueNet = monthlyNet - monthlyOverhead;
  const annualGross = monthlyGross * 12;
  const annualTrueNet = monthlyTrueNet * 12;

  // ---------- Recent documents ----------
  const recentDocs = [
    ...(recentPersonalDocs || []).map((d) => ({ ...d, scope: "Personal" as const, uploaderName: null as string | null })),
    ...(recentSharedDocs || []).map((d: any) => ({ ...d, scope: "Shared" as const, uploaderName: d.uploader?.full_name || null })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // ---------- Quick Referral Search ----------
  const hasSearchInputs = !!(searchParams.ref_state || searchParams.ref_primary || searchParams.ref_secondary || searchParams.ref_tertiary);
  let quickSearchResults: Array<{ profileId: string; fullName: string; state: string | null; connectionTier: string; acceptsInsurance: boolean | null }> = [];
  if (hasSearchInputs) {
    const need = searchParams.ref_primary || searchParams.ref_secondary || searchParams.ref_tertiary || null;
    const ranked = need
      ? await computeRankedCandidates(supabase, myself, {
          specialismValue: need,
          city: null,
          state: searchParams.ref_state || null,
          sessionType: searchParams.ref_session_type || null,
        })
      : [];
    const top3 = ranked.slice(0, 3);
    let insuranceByProfile = new Map<string, boolean>();
    if (searchParams.ref_insurance && top3.length > 0) {
      const { data: insuranceRows } = await supabase
        .from("public_directory")
        .select("id, value")
        .in("id", top3.map((c) => c.profileId))
        .eq("category", "insurance");
      const wanted = searchParams.ref_insurance.trim().toLowerCase();
      for (const id of top3.map((c) => c.profileId)) {
        const accepts = (insuranceRows || []).some((r) => r.id === id && r.value.toLowerCase() === wanted);
        insuranceByProfile.set(id, accepts);
      }
    }
    quickSearchResults = top3.map((c) => ({
      profileId: c.profileId,
      fullName: c.fullName,
      state: c.state,
      connectionTier: c.connectionTier,
      acceptsInsurance: searchParams.ref_insurance ? insuranceByProfile.get(c.profileId) ?? false : null,
    }));
  }

  const displayName = profile?.full_name || "";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join("") || "?";

  return (
    <div className="overview-page">
      {searchParams.error && <div className="error-banner">{searchParams.error}</div>}
      <div className="overview-topline">
        <div>
          <h1>Overview</h1>
          <p className="sub">
            {profile?.credential_prefix ? `${profile.credential_prefix} ` : ""}{displayName || "Welcome"}
            {profile?.qualification_level ? ` · ${profile.qualification_level}` : ""}, here's where things stand.
          </p>
        </div>
        <div className="overview-stat-strip">
          <a href="/dashboard/caseload" className="overview-stat-pill">
            <span className="value">{caseCount ?? 0}</span>
            <span className="label">Active clients</span>
          </a>
          <a href="/dashboard/messages" className="overview-stat-pill">
            <span className="value">{unreadMessageCount}</span>
            <span className="label">Unread</span>
          </a>
          <a href="/dashboard/network" className="overview-stat-pill">
            <span className="value">{pendingConnectionCount ?? 0}</span>
            <span className="label">Requests</span>
          </a>
          <a href="/dashboard/documents" className="overview-stat-pill">
            <span className="value">{docCount ?? 0}</span>
            <span className="label">Documents</span>
          </a>
        </div>
      </div>

      {!profile && (
        <div className="error-banner">
          You haven't set up your profile yet.{" "}
          <a href="/dashboard/profile">Complete your profile</a> to appear in the directory once
          verified.
        </div>
      )}

      {hasAttentionItems && (
        <div className="overview-alert-bar">
          <strong>Needs your attention:</strong>
          {unreadMessageCount > 0 && (
            <span>
              <a href="/dashboard/messages">{unreadMessageCount} unread conversation{unreadMessageCount === 1 ? "" : "s"}</a>
            </span>
          )}
          {(pendingConnectionCount ?? 0) > 0 && (
            <span>
              <a href="/dashboard/network">{pendingConnectionCount} pending connection{pendingConnectionCount === 1 ? "" : "s"}</a>
            </span>
          )}
          {offersAwaitingDecision > 0 && (
            <span>
              <a href="/dashboard/messages">{offersAwaitingDecision} referral notice{offersAwaitingDecision === 1 ? "" : "s"}</a>
            </span>
          )}
          {(plannerOfferCount ?? 0) > 0 && (
            <span>
              <a href="/dashboard/planner">{plannerOfferCount} coverage request{plannerOfferCount === 1 ? "" : "s"}</a>
            </span>
          )}
          {expiringLicenseCount > 0 && (
            <span>
              <a href="/dashboard/credentials">{expiringLicenseCount} license{expiringLicenseCount === 1 ? "" : "s"} expiring</a>
            </span>
          )}
          {expiringPanelCount > 0 && (
            <span>
              <a href="/dashboard/credentials">{expiringPanelCount} panel{expiringPanelCount === 1 ? "" : "s"} renewing</a>
            </span>
          )}
        </div>
      )}

      <div className="overview-bento">
        {/* ---------- Left rail: identity ---------- */}
        <div className="overview-col-left">
          <div className="ov-card">
            <div className="widget-header">
              <h2>My profile</h2>
              <GoLink href="/dashboard/profile" />
            </div>
            <div className="ov-profile-head">
              <div className="ov-avatar">{initials}</div>
              <div>
                <div className="name">
                  {profile?.credential_prefix ? `${profile.credential_prefix} ` : ""}{displayName || "Your name"}
                </div>
                {profile?.qualification_level && <div className="degree">{profile.qualification_level}</div>}
              </div>
            </div>
            {profile && (
              <>
                <ToggleButton compact flag="accepting_referrals" value={!!profile.accepting_referrals} label="Incoming referrals" />
                <ToggleButton compact flag="open_to_receive_supervision" value={!!profile.open_to_receive_supervision} label="Receiving supervision" />
                <ToggleButton compact flag="open_to_give_supervision" value={!!profile.open_to_give_supervision} label="Giving supervision" />
                <ToggleButton compact flag="open_to_group_consultation" value={!!profile.open_to_group_consultation} label="Group consultation" />
              </>
            )}
          </div>

          <div className="ov-card">
            <div className="widget-header">
              <h2>My world</h2>
              <GoLink href="/dashboard/network" />
            </div>
            <div className="ov-tier-line">
              <span className="tag tier-partner">Partners</span>
              <strong>{partners.length}</strong>
            </div>
            <p className="ov-tier-names">
              {partners.length > 0 ? partners.slice(0, 4).map((p) => (
                <TierName key={p.id} id={p.id} name={p.name} tier="partner" avatarUrl={avatarUrlOf(p.avatarPath)} />
              )) : "None yet"}
            </p>
            <div className="ov-tier-line">
              <span className="tag tier-bench">Bench</span>
              <strong>{bench.length}</strong>
            </div>
            <p className="ov-tier-names">
              {bench.length > 0 ? bench.slice(0, 4).map((p) => (
                <TierName key={p.id} id={p.id} name={p.name} tier="bench" avatarUrl={avatarUrlOf(p.avatarPath)} />
              )) : "None yet"}
            </p>
            <div className="ov-tier-line">
              <span className="tag tier-recommended">Recommended</span>
              <strong>
                {recommendedTop5.length}
                {recommendedTotal > recommendedTop5.length && <span className="muted" style={{ fontWeight: 400, fontSize: "0.7rem" }}> of {recommendedTotal}</span>}
              </strong>
            </div>
            <p className="ov-tier-names" style={{ marginBottom: 0 }}>
              {recommendedTop5.length > 0 ? recommendedTop5.map((p) => (
                <TierName key={p.id} id={p.id} name={p.name} tier="recommended" avatarUrl={avatarUrlOf(p.avatarPath)} />
              )) : "None yet"}
            </p>
          </div>
        </div>

        {/* ---------- Center: activity feed ---------- */}
        <div className="overview-col-center">
          <div className="ov-card">
            <div className="widget-header">
              <h2>My messages</h2>
              <GoLink href="/dashboard/messages" />
            </div>
            <ToggleBox
              defaultTab={offersAwaitingDecision > 0 ? "notices" : "inbox"}
              tabs={[
                { key: "inbox", label: `Inbox (${inboxRows.length})`, content: renderMessageRows(inboxRows) },
                { key: "notices", label: `Notices (${offersAwaitingDecision})`, content: renderNoticePreviewRows() },
                { key: "sent", label: `Sent (${sentRows.length})`, content: renderMessageRows(sentRows) },
              ]}
            />
          </div>

          <div className="ov-card">
            <div className="widget-header">
              <h2>Recent Town Hall conversations</h2>
              <GoLink href="/dashboard/town-hall" />
            </div>
            {townHallGrouped.map((m: any) => (
              <a key={m.id} href={`/dashboard/town-hall/${m.channel_id}`} className="ov-feed-row">
                <span className="title">
                  <span className="tag" style={{ marginRight: "0.4rem" }}>{m.channel?.name || "Town Hall"}</span>
                  <TierName id={m.author?.id || ""} name={m.author?.full_name || "Colleague"} tier={m.author?.id ? tierOf(m.author.id) : "none"} avatarUrl={avatarUrlOf(m.author?.avatar_path)} />
                </span>
                <span className="snippet">{m.body}</span>
              </a>
            ))}
            {townHallGrouped.length === 0 && (
              <p className="muted">
                No conversations yet. <a href="/dashboard/town-hall">Visit Town Hall</a> to see what
                your specialism channels are talking about.
              </p>
            )}
          </div>

          <div className="ov-card">
            <div className="widget-header">
              <h2>Recent documents</h2>
              <GoLink href="/dashboard/documents" />
            </div>
            {recentDocs.map((d: any) => (
              <a key={`${d.scope}-${d.id}`} href="/dashboard/documents" className="ov-feed-row">
                <span className="title">{d.title}</span>
                <span className="snippet">{d.scope}{d.uploaderName ? ` · ${d.uploaderName}` : ""}</span>
              </a>
            ))}
            {recentDocs.length === 0 && (
              <p className="muted">
                No documents yet. <a href="/dashboard/documents">Upload one</a> to share with the
                network or keep for yourself.
              </p>
            )}
          </div>
        </div>

        {/* ---------- Right rail: numbers + quick actions ---------- */}
        <div className="overview-col-right">
          <div className="ov-card">
            <div className="widget-header">
              <h2>My caseload</h2>
              <GoLink href="/dashboard/caseload" />
            </div>
            {totalCases > 0 ? (
              <>
                <div className="ov-pie-row">
                  <div className="ov-mini-pie" style={{ background: pieGradient }} />
                  <div className="ov-pie-legend">
                    {pieSlices.map((s) => (
                      <span key={s.need}>
                        <span className="pie-legend-swatch" style={{ background: s.color }} />
                        {s.need} ({Math.round(s.pct)}%)
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ov-mini-stats">
                  <div className="ov-mini-stat">
                    <div className="value">{totalCases}</div>
                    <div className="label">Active clients</div>
                  </div>
                  <div className="ov-mini-stat">
                    <div className="value">{Number.isInteger(totalSessionsPerWeek) ? totalSessionsPerWeek : totalSessionsPerWeek.toFixed(1)}</div>
                    <div className="label">Sessions p.w.</div>
                  </div>
                  <div className="ov-mini-stat">
                    <div className="value">{avgHourlyRate !== null ? currency(avgHourlyRate) : "-"}</div>
                    <div className="label">Avg. rate</div>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">Add active clients on the Caseload page to see your distribution here.</p>
            )}
          </div>

          <div className="ov-card">
            <div className="widget-header">
              <h2>Annual income</h2>
              <GoLink href="/dashboard/income" />
            </div>
            <div className="ov-mini-stats">
              <div className="ov-mini-stat">
                <div className="value">{currency(annualGross)}</div>
                <div className="label">Annual gross</div>
              </div>
              <div className="ov-mini-stat">
                <div className="value">{currency(annualTrueNet)}</div>
                <div className="label">Annual true net</div>
              </div>
            </div>
            <p className="muted" style={{ marginTop: "0.6rem", marginBottom: 0, fontSize: "0.76rem" }}>
              Projected from your active caseload, after each practice's retention split and your
              recurring overhead. See <a href="/dashboard/income">Income</a> for the full breakdown
              by practice.
            </p>
          </div>

          <details className="ov-card ov-quick-search" open={hasSearchInputs}>
            <summary>Quick referral search</summary>
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              Enter a client's basics for three verified colleagues to connect with. Nothing here
              is saved.
            </p>
            <form method="GET">
              <div className="field">
                <label htmlFor="ref_initials">Client initials</label>
                <input id="ref_initials" name="ref_initials" type="text" maxLength={4} defaultValue={searchParams.ref_initials || ""} placeholder="J.J." />
              </div>
              <div className="field">
                <label htmlFor="ref_state">State</label>
                <input id="ref_state" name="ref_state" type="text" maxLength={24} defaultValue={searchParams.ref_state || ""} placeholder="TX or Texas" list="us-states" autoComplete="off" />
                <UsStateDatalist />
              </div>
              <div className="field">
                <label htmlFor="ref_session_type">Session type</label>
                <select id="ref_session_type" name="ref_session_type" defaultValue={searchParams.ref_session_type || ""}>
                  <option value="">Any</option>
                  {(sessionTypeOptions || []).map((s) => (
                    <option key={s.value} value={s.value}>{s.value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ref_insurance">Insurance</label>
                <select id="ref_insurance" name="ref_insurance" defaultValue={searchParams.ref_insurance || ""}>
                  <option value="">Any</option>
                  {(insuranceOptions || []).map((s) => (
                    <option key={s.value} value={s.value}>{s.value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ref_primary">Primary treatment area</label>
                <select id="ref_primary" name="ref_primary" defaultValue={searchParams.ref_primary || ""}>
                  <option value="">None</option>
                  {(allSpecialisms || []).map((s) => (
                    <option key={s.id} value={s.value}>{s.value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ref_secondary">Secondary</label>
                <select id="ref_secondary" name="ref_secondary" defaultValue={searchParams.ref_secondary || ""}>
                  <option value="">None</option>
                  {(allSpecialisms || []).map((s) => (
                    <option key={s.id} value={s.value}>{s.value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ref_tertiary">Tertiary</label>
                <select id="ref_tertiary" name="ref_tertiary" defaultValue={searchParams.ref_tertiary || ""}>
                  <option value="">None</option>
                  {(allSpecialisms || []).map((s) => (
                    <option key={s.id} value={s.value}>{s.value}</option>
                  ))}
                </select>
              </div>
              <button type="submit" style={{ width: "100%" }}>Find matches</button>
            </form>

            {hasSearchInputs && (
              <div style={{ marginTop: "1rem" }}>
                <h3 style={{ fontSize: "0.82rem" }}>
                  Recommended{searchParams.ref_initials ? ` for ${searchParams.ref_initials}` : ""}
                </h3>
                {quickSearchResults.length > 0 ? (
                  quickSearchResults.map((r) => (
                    <div key={r.profileId} className="ov-feed-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>
                        <a href={`/dashboard/people/${r.profileId}`} className={`person-link${r.connectionTier !== "none" ? ` tier-${r.connectionTier}` : ""}`} style={{ fontSize: "0.84rem" }}>
                          {r.fullName}
                        </a>
                        <span className="muted" style={{ fontSize: "0.74rem", display: "block" }}>
                          {r.state || "-"}{searchParams.ref_insurance ? ` · ${r.acceptsInsurance ? "Accepts" : "Not listed for"} ${searchParams.ref_insurance}` : ""}
                        </span>
                      </span>
                      {r.connectionTier !== "none" && <span className={`tag tier-${r.connectionTier}`}>{r.connectionTier}</span>}
                    </div>
                  ))
                ) : (
                  <p className="muted">Pick at least one treatment area to get suggestions.</p>
                )}
              </div>
            )}
          </details>
        </div>
      </div>
    </div>
  );
}
