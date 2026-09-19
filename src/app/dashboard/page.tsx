import { createClient } from "@/lib/supabase/server";
import { computeRankedCandidates } from "@/lib/server-matching";
import { setProfileFlag } from "./actions";
import { professionFor, professionLabel } from "@/lib/profession";

const PIE_COLORS = ["#1f4d3f", "#b08d57", "#6b4c6b", "#2456a6", "#a3372c", "#4a4842", "#7a3fa0"];

function ToggleButton({ flag, value, label }: { flag: string; value: boolean; label: string }) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <form action={setProfileFlag} style={{ display: "inline" }}>
        <input type="hidden" name="flag" value={flag} />
        <input type="hidden" name="value" value={(!value).toString()} />
        <button type="submit" className={`toggle-badge toggle-badge-btn ${value ? "yes" : "no"}`} title="Click to toggle">
          {value ? "Yes" : "No"}
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
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", myself).maybeSingle(),
    supabase.from("caseload_clients").select("id", { count: "exact", head: true }).eq("profile_id", myself).eq("is_active", true),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("profile_id", myself),
    supabase.from("connections").select("id", { count: "exact", head: true }).eq("addressee_id", myself).eq("status", "pending"),
    supabase.from("referral_requests").select("id, referral_responses(status)").eq("requesting_profile_id", myself).eq("status", "open"),
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
      .select("conversation_id, last_read_at, conversation:conversation_id(id, title, last_message_at)")
      .eq("profile_id", myself),
    supabase
      .from("connections")
      .select("*, requester:requester_id(full_name), addressee:addressee_id(full_name)")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`)
      .eq("status", "accepted"),
    supabase.from("profile_lookup_values").select("lookup_value_id, lookup_values(category, value)").eq("profile_id", myself),
    supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself),
    supabase.from("lookup_values").select("id, value").eq("category", "treatment_specialism").order("value"),
    supabase.from("lookup_values").select("value").eq("category", "insurance").order("value"),
    supabase.from("lookup_values").select("value").eq("category", "session_type").order("value"),
    supabase
      .from("town_hall_messages")
      .select("id, body, created_at, channel_id, author:author_id(id, full_name), channel:channel_id(name, slug)")
      .is("parent_message_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("caseload_clients").select("id, state, primary_need").eq("profile_id", myself).eq("is_active", true),
    supabase.from("documents").select("id, title, created_at").eq("profile_id", myself).eq("owner_scope", "personal").order("created_at", { ascending: false }).limit(4),
    supabase.from("documents").select("id, title, created_at, uploader:uploaded_by(full_name)").eq("owner_scope", "world").order("created_at", { ascending: false }).limit(4),
  ]);

  const expiringLicenseCount = expiringLicenseCountRaw ?? 0;
  const expiringPanelCount = expiringPanelCountRaw ?? 0;

  const offersAwaitingDecision = (myOpenRequests || []).reduce(
    (sum, r: any) => sum + (r.referral_responses || []).filter((resp: any) => resp.status === "offered").length,
    0
  );

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
  const partners: string[] = [];
  const bench: string[] = [];
  const connectedIds = new Set<string>();
  for (const c of acceptedConnections || []) {
    const name = c.requester_id === myself ? (c.addressee as any)?.full_name : (c.requester as any)?.full_name;
    const otherId = c.requester_id === myself ? c.addressee_id : c.requester_id;
    connectedIds.add(otherId);
    if (c.tier === "partner") partners.push(name);
    else bench.push(name);
  }
  const mySpecialisms = new Set(
    (myLookups || []).filter((l: any) => l.lookup_values?.category === "treatment_specialism").map((l: any) => l.lookup_values.value)
  );
  const blockedIds = new Set((blocklist || []).map((b) => b.blocked_profile_id));
  // A lighter version of Network's "recommended" computation - just enough
  // to show a sample of names and a count on the Overview widget; the full
  // interactive list with actions lives on the Network page itself.
  const { data: directoryForRecommended } = mySpecialisms.size > 0
    ? await supabase.from("public_directory").select("id, full_name, category, value")
    : { data: [] as any[] };
  const recommendedNames = new Map<string, string>();
  for (const row of directoryForRecommended || []) {
    if (row.id === myself || connectedIds.has(row.id) || blockedIds.has(row.id)) continue;
    if (row.category === "treatment_specialism" && mySpecialisms.has(row.value)) {
      recommendedNames.set(row.id, row.full_name);
    }
  }

  // ---------- Town Hall preview ----------
  const townHallGrouped = (townHallRecent || []).slice(0, 5);

  // ---------- Messages preview ----------
  const sortedConversationRows = [...(myConversationRows || [])]
    .filter((r: any) => r.conversation)
    .sort((a: any, b: any) => new Date(b.conversation.last_message_at).getTime() - new Date(a.conversation.last_message_at).getTime())
    .slice(0, 4);
  const previewConversationIds = sortedConversationRows.map((r: any) => r.conversation.id);
  const [{ data: previewParticipants }, { data: previewMessages }] = await Promise.all([
    previewConversationIds.length
      ? supabase.from("conversation_participants").select("conversation_id, profile_id, profile:profile_id(full_name)").in("conversation_id", previewConversationIds)
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
  const otherNamesByConversation = new Map<number, string[]>();
  for (const p of previewParticipants || []) {
    if (p.profile_id === myself) continue;
    const list = otherNamesByConversation.get(p.conversation_id) || [];
    list.push((p.profile as any)?.full_name || "Colleague");
    otherNamesByConversation.set(p.conversation_id, list);
  }
  const latestByConversation = new Map<number, any>();
  for (const m of previewMessages || []) {
    if (!latestByConversation.has(m.conversation_id)) latestByConversation.set(m.conversation_id, m);
  }

  // ---------- Caseload distribution + auto-matched professionals ----------
  const stateCounts = new Map<string, number>();
  const needCounts = new Map<string, number>();
  for (const c of activeCases || []) {
    const st = c.state || "Unspecified";
    stateCounts.set(st, (stateCounts.get(st) || 0) + 1);
    if (c.primary_need) needCounts.set(c.primary_need, (needCounts.get(c.primary_need) || 0) + 1);
  }
  const totalCases = (activeCases || []).length;
  const needEntries = Array.from(needCounts.entries()).sort((a, b) => b[1] - a[1]);
  const topNeed = needEntries[0]?.[0] || null;

  let caseloadMatches: Array<{ profileId: string; fullName: string; connectionTier: string }> = [];
  if (topNeed) {
    const ranked = await computeRankedCandidates(supabase, myself, {
      specialismValue: topNeed,
      city: null,
      state: null,
      sessionType: null,
    });
    caseloadMatches = ranked.slice(0, 5).map((r) => ({ profileId: r.profileId, fullName: r.fullName, connectionTier: r.connectionTier }));
  }

  // Conic-gradient pie built from plain percentages - no charting library
  // needed for a handful of static slices.
  let pieGradient = "";
  let cursor = 0;
  const pieSlices = needEntries.slice(0, 7).map(([need, count], i) => {
    const pct = totalCases > 0 ? (count / totalCases) * 100 : 0;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    const start = cursor;
    cursor += pct;
    return { need, count, pct, color, start, end: cursor };
  });
  pieGradient = pieSlices.length > 0
    ? `conic-gradient(${pieSlices.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ")})`
    : "var(--bg-alt)";

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

  return (
    <div>
      <h1>Overview</h1>

      {!profile && (
        <div className="error-banner">
          You haven't set up your profile yet.{" "}
          <a href="/dashboard/profile">Complete your profile</a> to appear in the directory once
          verified.
        </div>
      )}

      {hasAttentionItems && (
        <div className="card">
          <h2>Needs your attention</h2>
          {unreadMessageCount > 0 && (
            <p>
              <a href="/dashboard/messages">
                {unreadMessageCount} unread conversation{unreadMessageCount === 1 ? "" : "s"}
              </a>{" "}
              in your messages.
            </p>
          )}
          {(pendingConnectionCount ?? 0) > 0 && (
            <p>
              <a href="/dashboard/network">
                {pendingConnectionCount} pending connection request{pendingConnectionCount === 1 ? "" : "s"}
              </a>{" "}
              waiting on your response.
            </p>
          )}
          {offersAwaitingDecision > 0 && (
            <p>
              <a href="/dashboard/referrals">
                {offersAwaitingDecision} colleague offer{offersAwaitingDecision === 1 ? "" : "s"}
              </a>{" "}
              on your open referral request{offersAwaitingDecision === 1 ? "" : "s"}, awaiting your decision.
            </p>
          )}
          {(plannerOfferCount ?? 0) > 0 && (
            <p>
              <a href="/dashboard/planner">
                {plannerOfferCount} coverage request{plannerOfferCount === 1 ? "" : "s"}
              </a>{" "}
              from a colleague going on leave, awaiting your response.
            </p>
          )}
          {expiringLicenseCount > 0 && (
            <p>
              <a href="/dashboard/credentials">
                {expiringLicenseCount} license{expiringLicenseCount === 1 ? "" : "s"}
              </a>{" "}
              expiring within 60 days.
            </p>
          )}
          {expiringPanelCount > 0 && (
            <p>
              <a href="/dashboard/credentials">
                {expiringPanelCount} insurance panel{expiringPanelCount === 1 ? "" : "s"}
              </a>{" "}
              up for renewal within 60 days.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <div className="widget-header">
          <h2>Quick referral search</h2>
        </div>
        <p className="muted">
          Enter a client's basics and psyalliance.org will suggest three verified colleagues to
          connect with. Nothing here is saved, client initials are just a label for your own
          screen.
        </p>
        <form method="GET">
          <div className="field-row">
            <div className="field" style={{ maxWidth: 100 }}>
              <label htmlFor="ref_initials">Client initials</label>
              <input id="ref_initials" name="ref_initials" type="text" maxLength={4} defaultValue={searchParams.ref_initials || ""} placeholder="J.J." />
            </div>
            <div className="field" style={{ maxWidth: 90 }}>
              <label htmlFor="ref_state">State</label>
              <input id="ref_state" name="ref_state" type="text" maxLength={2} defaultValue={searchParams.ref_state || ""} placeholder="TX" />
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
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
          </div>
          <div className="field-row">
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
            <div className="field" style={{ flex: "0 0 auto", alignSelf: "flex-end" }}>
              <button type="submit">Find matches</button>
            </div>
          </div>
        </form>

        {hasSearchInputs && (
          <div style={{ marginTop: "1rem" }}>
            <h3 style={{ fontSize: "0.9rem" }}>
              Recommended by psyalliance.org{searchParams.ref_initials ? ` for ${searchParams.ref_initials}` : ""}
            </h3>
            {quickSearchResults.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>State</th>
                    <th>Connection</th>
                    {searchParams.ref_insurance && <th>Accepts {searchParams.ref_insurance}</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {quickSearchResults.map((r) => (
                    <tr key={r.profileId}>
                      <td><a href={`/dashboard/people/${r.profileId}`} className={`person-link${r.connectionTier !== "none" ? ` tier-${r.connectionTier}` : ""}`}>{r.fullName}</a></td>
                      <td>{r.state || "-"}</td>
                      <td>{r.connectionTier !== "none" ? <span className={`tag tier-${r.connectionTier}`}>{r.connectionTier}</span> : <span className="muted">-</span>}</td>
                      {searchParams.ref_insurance && <td>{r.acceptsInsurance ? "Yes" : "Not listed"}</td>}
                      <td><a href={`/dashboard/people/${r.profileId}`} className="btn secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>View</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Pick at least one treatment area to get suggestions.</p>
            )}
          </div>
        )}
      </div>

      <div className="overview-grid">
        <div className="overview-col">
          <div className="card">
            <div className="widget-header">
              <h2>My profile</h2>
              <GoLink href="/dashboard/profile" />
            </div>
            <p style={{ fontWeight: 600, marginTop: 0 }}>
              {profile?.credential_prefix ? `${profile.credential_prefix} ` : ""}{profile?.full_name || "Your name"}
              {profile?.qualification_level && (
                <span className="muted" style={{ fontWeight: 400 }}> · {profile.qualification_level}</span>
              )}
            </p>
            {profile && (
              <>
                <ToggleButton flag="accepting_referrals" value={!!profile.accepting_referrals} label="Incoming referrals" />
                <ToggleButton flag="open_to_receive_supervision" value={!!profile.open_to_receive_supervision} label="Receiving supervision" />
                <ToggleButton flag="open_to_give_supervision" value={!!profile.open_to_give_supervision} label="Giving supervision" />
                <ToggleButton flag="open_to_group_consultation" value={!!profile.open_to_group_consultation} label="Group consultation" />
              </>
            )}
          </div>

          <div className="card">
            <div className="widget-header">
              <h2>My world</h2>
              <GoLink href="/dashboard/network" />
            </div>
            <p style={{ margin: "0 0 0.3rem" }}>
              <span className="tag tier-partner">Partners</span> {partners.length}
            </p>
            <p className="muted" style={{ marginTop: 0, fontSize: "0.82rem" }}>{partners.slice(0, 4).join(", ") || "None yet"}</p>
            <p style={{ margin: "0.5rem 0 0.3rem" }}>
              <span className="tag tier-bench">Bench</span> {bench.length}
            </p>
            <p className="muted" style={{ marginTop: 0, fontSize: "0.82rem" }}>{bench.slice(0, 4).join(", ") || "None yet"}</p>
            <p style={{ margin: "0.5rem 0 0.3rem" }}>
              <span className="tag tier-recommended">Recommended</span> {recommendedNames.size}
            </p>
            <p className="muted" style={{ marginTop: 0, fontSize: "0.82rem" }}>
              {Array.from(recommendedNames.values()).slice(0, 4).join(", ") || "None yet"}
            </p>
          </div>
        </div>

        <div className="overview-col">
          <div className="card">
            <div className="widget-header">
              <h2>Recent Town Hall conversations</h2>
              <GoLink href="/dashboard/town-hall" />
            </div>
            {townHallGrouped.map((m: any) => (
              <a key={m.id} href={`/dashboard/town-hall/${m.channel_id}`} className="preview-row">
                <span className="title">{m.author?.full_name || "Colleague"} in {m.channel?.name || "Town Hall"}</span>
                <br />
                <span className="snippet">{m.body}</span>
              </a>
            ))}
            {townHallGrouped.length === 0 && <p className="muted">No conversations yet.</p>}
          </div>

          <div className="card">
            <div className="widget-header">
              <h2>My messages</h2>
              <GoLink href="/dashboard/messages" />
            </div>
            {sortedConversationRows.map((r: any) => {
              const conv = r.conversation;
              const others = otherNamesByConversation.get(conv.id) || [];
              const label = conv.title || others.join(", ") || "Conversation";
              const latest = latestByConversation.get(conv.id);
              const unread = latest && (!r.last_read_at || new Date(latest.created_at) > new Date(r.last_read_at));
              return (
                <a key={conv.id} href={`/dashboard/messages/${conv.id}`} className="preview-row">
                  <span className="title">
                    {label}
                    {unread && <span className="tag tier-recommended" style={{ marginLeft: "0.4rem" }}>Unread</span>}
                  </span>
                  <br />
                  <span className="snippet">{latest ? latest.body : "No messages yet"}</span>
                </a>
              );
            })}
            {sortedConversationRows.length === 0 && <p className="muted">No conversations yet.</p>}
          </div>
        </div>

        <div className="overview-col">
          <div className="card">
            <div className="widget-header">
              <h2>My caseload distribution</h2>
              <GoLink href="/dashboard/caseload" />
            </div>
            {totalCases > 0 ? (
              <>
                <div className="pie-chart" style={{ background: pieGradient }} />
                <div className="pie-legend">
                  {pieSlices.map((s) => (
                    <span key={s.need}>
                      <span className="pie-legend-swatch" style={{ background: s.color }} />
                      {s.need} ({Math.round(s.pct)}%)
                    </span>
                  ))}
                </div>
                <div className="mini-stat-row">
                  <div className="mini-stat">
                    <div className="value">{totalCases}</div>
                    <div className="label">Total active</div>
                  </div>
                  <div className="mini-stat">
                    <div className="value">{stateCounts.size}</div>
                    <div className="label">States</div>
                  </div>
                  <div className="mini-stat">
                    <div className="value">{needEntries.length}</div>
                    <div className="label">Treatment areas</div>
                  </div>
                </div>
                {caseloadMatches.length > 0 && (
                  <div style={{ marginTop: "1rem" }}>
                    <h3 style={{ fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                      Matched to your caseload ({topNeed})
                    </h3>
                    {caseloadMatches.map((m) => (
                      <p key={m.profileId} style={{ margin: "0.15rem 0" }}>
                        <a href={`/dashboard/people/${m.profileId}`} className={`person-link${m.connectionTier !== "none" ? ` tier-${m.connectionTier}` : ""}`}>
                          {m.fullName}
                        </a>
                      </p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted">Add active cases on the Caseload page to see your distribution here.</p>
            )}
          </div>

          <div className="card">
            <div className="widget-header">
              <h2>Recent documents</h2>
              <GoLink href="/dashboard/documents" />
            </div>
            {recentDocs.map((d: any) => (
              <a key={`${d.scope}-${d.id}`} href="/dashboard/documents" className="preview-row">
                <span className="title">{d.title}</span>
                <br />
                <span className="snippet">{d.scope}{d.uploaderName ? ` · ${d.uploaderName}` : ""}</span>
              </a>
            ))}
            {recentDocs.length === 0 && <p className="muted">No documents yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
