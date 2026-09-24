import { createClient } from "@/lib/supabase/server";
import { computeRankedCandidates } from "@/lib/server-matching";
import UsStateDatalist from "@/components/us-state-datalist";
import { buildTierMap, rankRecommended, type Tier } from "@/lib/tiers";
import { resolveAvatarUrls } from "@/lib/avatars";
import Avatar from "./avatar";

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

function GoLink({ href }: { href: string }) {
  return <a href={href} className="go-link">Go &rarr;</a>;
}

const AVAILABILITY_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

// Home (Master Brief #17): "What needs my attention?" first, then "What do
// you need?", then the professional-opportunity layer ("Relevant to you"),
// then relationship activity ("Your network"), then Practice Library. This
// replaces the old Overview page's caseload-pie/annual-income financial
// widgets - both still live in full on their own Legacy pages (Caseload,
// Income), just no longer previewed here, since Home's job now is
// attention and opportunity, not a finance dashboard. The old "My profile"
// quick-toggle card is dropped for the same reason: every toggle it had
// already lives on My Profile, one click away in the new nav.
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
    { data: recentPersonalDocs },
    { data: recentSharedDocs },
    { data: pendingCoverageRequests },
    { data: myConsultationsWithReplies },
    { data: openReferralsFromColleagues },
    { data: openConsultationsFromColleagues },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", myself).maybeSingle(),
    supabase.from("connections").select("id", { count: "exact", head: true }).eq("addressee_id", myself).eq("status", "pending"),
    supabase.from("referral_requests").select("id, referral_responses(status)").eq("requesting_profile_id", myself).eq("status", "open"),
    // Physician referrals awaiting a response - shown in full on the
    // Messages "Notices" tab; surfaced here only as an attention count so
    // it's never a blind spot on Home.
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
      .select("last_read_at, conversation:conversation_id(last_message_at)")
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
    supabase.from("documents").select("id, title, created_at").eq("profile_id", myself).eq("owner_scope", "personal").order("created_at", { ascending: false }).limit(3),
    supabase.from("documents").select("id, title, created_at, uploader:uploaded_by(full_name)").eq("owner_scope", "world").order("created_at", { ascending: false }).limit(3),
    // Requests hub's own attention feed: coverage requests sent to me,
    // still waiting on a response.
    supabase
      .from("coverage_requests")
      .select("id, sent_at, coverage_plan_cases(case_reference, coverage_plans(title))")
      .eq("requested_profile_id", myself)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(5),
    // My own consultations that have at least one reply waiting to be read
    // ("Sarah replied to your consultation").
    supabase
      .from("consultations")
      .select("id, question, created_at")
      .eq("author_profile_id", myself)
      .eq("status", "responses_received")
      .order("created_at", { ascending: false })
      .limit(5),
    // Opportunity layer, part 1: open referral requests from colleagues,
    // RLS already narrows this to whatever audience I'm actually allowed
    // to see (trusted/selected-me/suggested/wider_network) - matched down
    // to my own specialisms client-side below.
    supabase
      .from("referral_requests")
      .select("id, state, city, created_at, lookup_values(value)")
      .neq("requesting_profile_id", myself)
      .in("status", ["open", "sent"])
      .order("created_at", { ascending: false })
      .limit(25),
    // Opportunity layer, part 2: open consultations from colleagues -
    // there's no specialism field on consultations to match against, so
    // this is simply "recent and visible to me" rather than ranked.
    supabase
      .from("consultations")
      .select("id, question, consultation_type, audience_type, author_profile_id, author:author_profile_id(full_name)")
      .neq("author_profile_id", myself)
      .in("status", ["open", "responses_received"])
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const expiringLicenseCount = expiringLicenseCountRaw ?? 0;
  const expiringPanelCount = expiringPanelCountRaw ?? 0;

  const peerOffersAwaitingDecision = (myOpenRequests || []).reduce(
    (sum, r: any) => sum + (r.referral_responses || []).filter((resp: any) => resp.status === "offered").length,
    0
  );
  const providerReferralsAwaitingDecision = (pendingProviderReferrals || []).length;
  const offersAwaitingDecision = peerOffersAwaitingDecision + providerReferralsAwaitingDecision;

  const unreadMessageCount = (myConversationRows || []).filter((r: any) => {
    if (!r.conversation) return false;
    return new Date(r.conversation.last_message_at) > new Date(r.last_read_at);
  }).length;

  const pendingCoverageRequestCount = (pendingCoverageRequests || []).length;
  const consultationRepliesCount = (myConsultationsWithReplies || []).length;
  const availabilityStale =
    !profile?.availability_confirmed_at ||
    Date.now() - new Date(profile.availability_confirmed_at).getTime() > AVAILABILITY_STALE_AFTER_MS;

  const hasAttentionItems =
    (pendingConnectionCount ?? 0) > 0 ||
    offersAwaitingDecision > 0 ||
    expiringLicenseCount > 0 ||
    expiringPanelCount > 0 ||
    (plannerOfferCount ?? 0) > 0 ||
    unreadMessageCount > 0 ||
    pendingCoverageRequestCount > 0 ||
    consultationRepliesCount > 0 ||
    availabilityStale;

  // ---------- Your network: Trusted Colleagues / Bench / Recommended ----------
  const trustedColleagues: { id: string; name: string; avatarPath: string | null }[] = [];
  const bench: { id: string; name: string; avatarPath: string | null }[] = [];
  const connectedIds = new Set<string>();
  for (const c of acceptedConnections || []) {
    const other = c.requester_id === myself ? (c.addressee as any) : (c.requester as any);
    const otherId = c.requester_id === myself ? c.addressee_id : c.requester_id;
    connectedIds.add(otherId);
    const entry = { id: otherId, name: other?.full_name, avatarPath: other?.avatar_path || null };
    if (c.tier === "trusted_colleague" || c.tier === "partner") trustedColleagues.push(entry);
    else bench.push(entry);
  }
  const tierByOtherId = buildTierMap(acceptedConnections as any, myself);
  const mySpecialisms = new Set(
    (myLookups || []).filter((l: any) => l.lookup_values?.category === "treatment_specialism").map((l: any) => l.lookup_values.value)
  );
  const blockedIds = new Set((blocklist || []).map((b) => b.blocked_profile_id));
  // Same "top 5, recomputed live" rule as everywhere else recommended
  // colleagues show up - see Network page for the full interactive list.
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

  // ---------- Relevant to you: opportunity layer ----------
  const matchingReferrals = (openReferralsFromColleagues || [])
    .filter((r: any) => !r.lookup_values?.value || mySpecialisms.has(r.lookup_values.value))
    .slice(0, 3);
  const consultQuestions = openConsultationsFromColleagues || [];
  const hasRelevantItems = matchingReferrals.length > 0 || consultQuestions.length > 0;

  // One batched resolve for every avatar_path referenced anywhere on this
  // page, so a name shown anywhere carries the person's real picture (or
  // initials), not just colored text.
  const homeAvatarUrlByPath = await resolveAvatarUrls(supabase, [
    ...trustedColleagues.map((p) => p.avatarPath),
    ...bench.map((p) => p.avatarPath),
    ...Array.from(recommendedCandidates.values()).map((r) => r.avatarPath),
  ]);
  const avatarUrlOf = (path: string | null | undefined) => homeAvatarUrlByPath.get(path || "") || null;

  // ---------- Recent documents (Practice Library teaser) ----------
  const recentDocs = [
    ...(recentPersonalDocs || []).map((d) => ({ ...d, scope: "Personal" as const, uploaderName: null as string | null })),
    ...(recentSharedDocs || []).map((d: any) => ({ ...d, scope: "Shared" as const, uploaderName: d.uploader?.full_name || null })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4);

  // ---------- Quick Referral Search - carried over unchanged from the old
  // Overview page, just relocated under "For your practice" ----------
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

  return (
    <div className="overview-page">
      {searchParams.error && <div className="error-banner">{searchParams.error}</div>}
      <div className="overview-topline">
        <div>
          <h1>Home</h1>
          <p className="sub">
            {profile?.credential_prefix ? `${profile.credential_prefix} ` : ""}{displayName || "Welcome"}
            {profile?.qualification_level ? ` · ${profile.qualification_level}` : ""}, here's where things stand.
          </p>
        </div>
        {/* Sept 23 audit: this strip used to be static vanity counts (Active
            clients, Library document count) that never asked for anything -
            replaced with the same unresolved-item signals the "Needs your
            attention" bar below already computes, so the top of Home is
            entirely "here's what's waiting on you," not a mix of that and
            "here's how many things you own." */}
        <div className="overview-stat-strip">
          <a href="/dashboard/messages" className="overview-stat-pill">
            <span className="value">{unreadMessageCount}</span>
            <span className="label">Unread</span>
          </a>
          <a href="/dashboard/network" className="overview-stat-pill">
            <span className="value">{pendingConnectionCount ?? 0}</span>
            <span className="label">Network</span>
          </a>
          <a href="/dashboard/requests" className="overview-stat-pill">
            <span className="value">{pendingCoverageRequestCount}</span>
            <span className="label">Coverage requests</span>
          </a>
          <a href="/dashboard/consult" className="overview-stat-pill">
            <span className="value">{consultationRepliesCount}</span>
            <span className="label">Consult replies</span>
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
          {pendingCoverageRequestCount > 0 && (
            <span>
              <a href="/dashboard/requests">{pendingCoverageRequestCount} coverage request{pendingCoverageRequestCount === 1 ? "" : "s"} waiting on you</a>
            </span>
          )}
          {consultationRepliesCount > 0 && (
            <span>
              <a href="/dashboard/consult">{consultationRepliesCount} consultation repl{consultationRepliesCount === 1 ? "y" : "ies"} to review</a>
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
              <a href="/dashboard/cover">{plannerOfferCount} coverage offer{plannerOfferCount === 1 ? "" : "s"}</a>
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
          {availabilityStale && (
            <span>
              <a href="/dashboard/availability">Availability not confirmed recently</a>
            </span>
          )}
        </div>
      )}

      <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.6rem" }}>What do you need?</h2>
      <div className="home-action-grid">
        <a href="/dashboard/requests?tab=coverage" className="home-action-tile">
          <div className="home-action-title">Find cover</div>
          <div className="home-action-sub">Line up appropriate clinicians for a coverage plan</div>
        </a>
        <a href="/dashboard/requests?tab=referrals" className="home-action-tile">
          <div className="home-action-title">Refer a patient</div>
          <div className="home-action-sub">Post a referral request to your network</div>
        </a>
        <a href="/dashboard/consult" className="home-action-tile">
          <div className="home-action-title">Ask colleagues</div>
          <div className="home-action-sub">Get a second opinion or a clinical question answered</div>
        </a>
        <a href="/dashboard/network" className="home-action-tile">
          <div className="home-action-title">Find a clinician</div>
          <div className="home-action-sub">Search the directory by specialism, state or PSYPACT</div>
        </a>
      </div>

      <div className="overview-bento">
        {/* ---------- Left: relevant to you + practice ---------- */}
        <div className="overview-col-left">
          <div className="ov-card">
            <div className="widget-header">
              <h2>Relevant to you</h2>
            </div>
            {hasRelevantItems ? (
              <>
                {matchingReferrals.map((r: any) => (
                  <a key={`ref-${r.id}`} href="/dashboard/requests?tab=referrals" className="ov-feed-row">
                    <span className="title">Referral request matches your specialties</span>
                    <span className="snippet">
                      {r.lookup_values?.value || "General"}
                      {r.city || r.state ? ` · ${[r.city, r.state].filter(Boolean).join(", ")}` : ""}
                    </span>
                  </a>
                ))}
                {consultQuestions.map((c: any) => (
                  <a key={`con-${c.id}`} href="/dashboard/consult" className="ov-feed-row">
                    <span className="title">{c.author?.full_name || "A colleague"} asked a question</span>
                    <span className="snippet">{c.question}</span>
                  </a>
                ))}
              </>
            ) : (
              <p className="muted">
                Nothing matching your specialties right now. Check <a href="/dashboard/requests">Requests</a> and{" "}
                <a href="/dashboard/consult">Consult</a> for everything open across the network.
              </p>
            )}
          </div>

          <div className="ov-card">
            <div className="widget-header">
              <h2>For your practice</h2>
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
                No Library resources yet. <a href="/dashboard/documents">Upload one</a> to share with
                the network or keep for yourself.
              </p>
            )}
          </div>
        </div>

        {/* ---------- Right: your network + quick tools ---------- */}
        <div className="overview-col-right">
          <div className="ov-card">
            <div className="widget-header">
              <h2>Your network</h2>
              <GoLink href="/dashboard/network" />
            </div>
            <div className="ov-tier-line">
              <span className="tag tier-trusted_colleague">Trusted Colleagues</span>
              <strong>{trustedColleagues.length}</strong>
            </div>
            <p className="ov-tier-names">
              {trustedColleagues.length > 0 ? trustedColleagues.slice(0, 4).map((p) => (
                <TierName key={p.id} id={p.id} name={p.name} tier="trusted_colleague" avatarUrl={avatarUrlOf(p.avatarPath)} />
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
              <span className="tag tier-recommended">Suggested for you</span>
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
                    <div key={r.profileId} className="ov-feed-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
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
