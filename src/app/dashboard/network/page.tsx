import { createClient } from "@/lib/supabase/server";
import { sendConnectionRequest, respondToConnection, removeConnection, sendDueConnectionReminders } from "./actions";
import { startConversation } from "../messages/actions";
import { resolveAvatarUrls } from "@/lib/avatars";
import Avatar from "../avatar";
import { professionFor, professionLabel, type Profession } from "@/lib/profession";
import ExpandableList from "@/components/expandable-list";
import ToggleBox from "@/components/toggle-box";
import { rankRecommended } from "@/lib/tiers";
import DirectoryBrowser, { type DirectoryEntry } from "./directory-browser";

type DirectoryPerson = {
  id: string;
  full_name: string;
  credential_prefix: string | null;
  qualification_level: string;
  primary_practice_city: string | null;
  primary_state: string | null;
  accepting_referrals: boolean;
  psypact_participating: boolean;
  avatar_path: string | null;
  specialisms: Set<string>;
  last_active_at: string | null;
};

// "Connected N months/days ago", for the Partners list - so an established
// relationship reads differently from one made yesterday.
function connectedDuration(sinceIso: string | null | undefined): string | null {
  if (!sinceIso) return null;
  const since = new Date(sinceIso).getTime();
  const days = Math.floor((Date.now() - since) / (1000 * 60 * 60 * 24));
  if (days < 1) return "Connected today";
  if (days < 30) return `Connected ${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Connected ${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `Connected ${years} year${years === 1 ? "" : "s"}`;
}

type Tier = "partner" | "bench" | "recommended" | "none";

function ProfessionTag({ profession }: { profession: Profession }) {
  return (
    <span className={`tag${profession === "psychiatrist" ? " psychiatrist" : ""}`}>
      {professionLabel(profession)}
    </span>
  );
}

// Consistent Partner=blue / Bench=purple / Recommended=orange coloring,
// used everywhere a connection tier shows up on this page.
function TierTag({ tier }: { tier: Tier }) {
  if (tier === "none") return <span className="tag tier-none">Not yet connected</span>;
  const label = tier === "partner" ? "Partner" : tier === "bench" ? "Bench" : "Recommended";
  return <span className={`tag tier-${tier}`}>{label}</span>;
}

function PersonLink({ id, name, tier }: { id: string; name: string; tier?: Tier }) {
  const tierClass = tier && tier !== "none" ? ` tier-${tier}` : "";
  return (
    <a href={`/dashboard/people/${id}`} className={`person-link${tierClass}`}>
      {name}
    </a>
  );
}

export default async function NetworkPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Lazy reminder sweep for this user's own outgoing requests - see
  // sendDueConnectionReminders for why this runs inline on page load rather
  // than on a schedule.
  await sendDueConnectionReminders(supabase, user!.id);

  const [
    { data: directoryRows },
    { data: connections },
    { data: myLookups },
    { data: blocklist },
    { data: scores },
    { data: allSpecialisms },
  ] = await Promise.all([
    supabase.from("public_directory").select("*"),
    supabase
      .from("connections")
      .select("*, requester:requester_id(full_name, avatar_path), addressee:addressee_id(full_name, avatar_path)")
      .or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`),
    supabase
      .from("profile_lookup_values")
      .select("lookup_value_id, lookup_values(category, value)")
      .eq("profile_id", user!.id),
    supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", user!.id),
    supabase.from("community_endorsement_scores").select("profile_id, score"),
    supabase.from("lookup_values").select("value").eq("category", "treatment_specialism").order("value"),
  ]);

  const blockedIds = new Set((blocklist || []).map((b) => b.blocked_profile_id));
  const scoreById = new Map((scores || []).map((s) => [s.profile_id, s.score as number]));
  const engagementBadge = (personId: string) => {
    const score = scoreById.get(personId) || 0;
    if (score >= 20) return { label: "Highly engaged, consider Partner", score };
    if (score >= 10) return { label: "Community pick, consider Bench", score };
    return null;
  };

  const myself = user!.id;
  const people = new Map<string, DirectoryPerson>();
  for (const row of directoryRows || []) {
    if (row.id === myself) continue;
    if (blockedIds.has(row.id)) continue;
    if (!people.has(row.id)) {
      people.set(row.id, {
        id: row.id,
        full_name: row.full_name,
        credential_prefix: row.credential_prefix,
        qualification_level: row.qualification_level,
        primary_practice_city: row.primary_practice_city,
        primary_state: row.primary_state,
        accepting_referrals: row.accepting_referrals,
        psypact_participating: row.psypact_participating,
        avatar_path: row.avatar_path,
        specialisms: new Set(),
        last_active_at: (row as any).last_active_at ?? null,
      });
    }
    if (row.category === "treatment_specialism") {
      people.get(row.id)!.specialisms.add(row.value);
    }
  }

  const avatarUrlByPath = await resolveAvatarUrls(supabase, [
    ...Array.from(people.values()).map((p) => p.avatar_path),
    ...(connections || []).map((c: any) => c.requester?.avatar_path),
    ...(connections || []).map((c: any) => c.addressee?.avatar_path),
  ]);
  const avatarOf = (c: any) =>
    avatarUrlByPath.get((c.requester_id === myself ? c.addressee?.avatar_path : c.requester?.avatar_path) || "") || null;

  const mySpecialisms = new Set(
    (myLookups || [])
      .filter((l: any) => l.lookup_values?.category === "treatment_specialism")
      .map((l: any) => l.lookup_values.value)
  );

  // The specific specialisms shared with the viewer, used both for the
  // "recommended" degree computation and for the per-person one-line reason
  // Nick asked for ("depression, anxiety" rather than a generic sentence).
  const sharedSpecialismsWith = (p: DirectoryPerson) => [...p.specialisms].filter((s) => mySpecialisms.has(s));

  const connectionByOtherId = new Map<string, any>();
  for (const c of connections || []) {
    const otherId = c.requester_id === myself ? c.addressee_id : c.requester_id;
    connectionByOtherId.set(otherId, c);
  }

  const partners = (connections || []).filter((c: any) => c.status === "accepted" && c.tier === "partner");
  const bench = (connections || []).filter((c: any) => c.status === "accepted" && c.tier === "bench");
  const incoming = (connections || []).filter((c: any) => c.status === "pending" && c.addressee_id === myself);
  const outgoing = (connections || []).filter((c: any) => c.status === "pending" && c.requester_id === myself);

  // Ranked by shared-specialism overlap, then recent activity, capped to 10
  // total (shown 5 at a time with an expand) - same "top N, recomputed live"
  // approach as Overview's My World, so this never balloons to the dozens
  // and naturally shifts as people's data changes rather than being a fixed
  // list.
  const recommendedCandidates = Array.from(people.values())
    .filter((p) => !connectionByOtherId.has(p.id))
    .map((p) => ({ person: p, sharedCount: sharedSpecialismsWith(p).length, lastActiveAt: p.last_active_at }))
    .filter((c) => c.sharedCount > 0);
  const recommended = rankRecommended(recommendedCandidates, 10).map((c) => c.person);

  const nameOf = (c: any) => (c.requester_id === myself ? c.addressee?.full_name : c.requester?.full_name);
  const otherIdOf = (c: any) => (c.requester_id === myself ? c.addressee_id : c.requester_id);

  // Connection-degree filter, per the spec ("filter by Partner | Bench |
  // Recommended | ALL, ala LinkedIn 1st/2nd/3rd degree").
  function connectionDegree(p: DirectoryPerson): Tier {
    const conn = connectionByOtherId.get(p.id);
    if (conn?.status === "accepted") return conn.tier;
    if (sharedSpecialismsWith(p).length > 0) return "recommended";
    return "none";
  }

  // Full plain-serializable directory list for the client-side browser -
  // every filter, search, and page turn happens in local state from here on
  // (see directory-browser.tsx), so there's no server round-trip and no
  // page reload for any of it.
  const directoryEntries: DirectoryEntry[] = Array.from(people.values()).map((p) => {
    const conn = connectionByOtherId.get(p.id);
    return {
      id: p.id,
      name: p.full_name,
      credentialPrefix: p.credential_prefix,
      profession: professionFor(p.qualification_level),
      qualificationLevel: p.qualification_level,
      city: p.primary_practice_city,
      state: p.primary_state,
      specialisms: Array.from(p.specialisms),
      psypact: p.psypact_participating,
      avatarUrl: avatarUrlByPath.get(p.avatar_path || "") || null,
      tier: connectionDegree(p),
      connectionStatus: conn ? (conn.status === "accepted" ? "accepted" : "pending") : null,
    };
  });
  const specialismOptions = (allSpecialisms || []).map((s) => s.value);

  return (
    <div>
      <h1>Network</h1>
      <p className="muted">
        <span className="tag tier-partner" style={{ marginRight: "0.35rem" }}>Partner</span>
        first-degree, mutual-consent connections.
        <span className="tag tier-bench" style={{ margin: "0 0.35rem 0 0.75rem" }}>Bench</span>
        a looser "known, not yet connected" tier.
        <span className="tag tier-recommended" style={{ margin: "0 0.35rem 0 0.75rem" }}>Recommended</span>
        computed from shared specialisms, nothing here is stored until you connect.
      </p>

      {searchParams?.error && <div className="error-banner">{searchParams.error}</div>}

      {(incoming.length > 0 || outgoing.length > 0) && (
        <div className="card">
          <div className="widget-header">
            <h2 style={{ margin: 0 }}>Requests</h2>
          </div>
          <ToggleBox
            defaultTab="incoming"
            tabs={[
              {
                key: "incoming",
                label: `Incoming (${incoming.length})`,
                content: incoming.length > 0 ? (
                  <ExpandableList
                    items={incoming.map((c: any) => (
                      <div key={c.id} className="person-row">
                        <span className="person-row-info">
                          <Avatar url={avatarOf(c)} name={nameOf(c) || ""} ring={c.tier} />
                          <PersonLink id={otherIdOf(c)} name={nameOf(c) || ""} /> wants to connect as <TierTag tier={c.tier} />
                        </span>
                        <span className="person-row-actions">
                          <form action={respondToConnection}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="decision" value="accepted" />
                            <button type="submit">Accept</button>
                          </form>
                          <form action={respondToConnection}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="decision" value="declined" />
                            <button type="submit" className="secondary">Decline</button>
                          </form>
                        </span>
                      </div>
                    ))}
                  />
                ) : (
                  <p className="muted">No incoming requests.</p>
                ),
              },
              {
                key: "sent",
                label: `Sent (${outgoing.length})`,
                content: outgoing.length > 0 ? (
                  <ExpandableList
                    items={outgoing.map((c: any) => (
                      <div key={c.id} className="person-row">
                        <span className="person-row-info">
                          <Avatar url={avatarOf(c)} name={nameOf(c) || ""} ring={c.tier} />
                          <PersonLink id={otherIdOf(c)} name={nameOf(c) || ""} /> - request sent as <TierTag tier={c.tier} />
                        </span>
                        <span className="person-row-actions">
                          <form action={removeConnection}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="secondary">Remove request</button>
                          </form>
                        </span>
                      </div>
                    ))}
                  />
                ) : (
                  <p className="muted">No sent requests awaiting a response.</p>
                ),
              },
            ]}
          />
        </div>
      )}

      <div className="card">
        <h2>
          <span className="tag tier-partner" style={{ marginRight: "0.5rem" }}>Partner</span>
          Partners ({partners.length})
        </h2>
        {partners.map((c: any) => {
          const otherId = otherIdOf(c);
          const duration = connectedDuration(c.responded_at || c.created_at);
          return (
          <div key={c.id} className="person-row">
            <span className="person-row-info">
              <Avatar url={avatarOf(c)} name={nameOf(c) || ""} ring="partner" />
              <PersonLink id={otherId} name={nameOf(c) || ""} tier="partner" />
              {duration && <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.8rem" }}>{duration}</span>}
            </span>
            <span className="person-row-actions">
              <form action={startConversation}>
                <input type="hidden" name="participant_ids" value={otherId} />
                <input type="hidden" name="title" value={`${nameOf(c)}`} />
                <input type="hidden" name="body" value={`Hi ${nameOf(c) || ""}, wanted to connect.`} />
                <button type="submit" className="secondary">Message</button>
              </form>
              <form action={removeConnection}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" className="secondary">Remove</button>
              </form>
            </span>
          </div>
          );
        })}
        {partners.length === 0 && <p className="muted">No partners yet.</p>}
      </div>

      <div className="card">
        <h2>
          <span className="tag tier-bench" style={{ marginRight: "0.5rem" }}>Bench</span>
          Bench ({bench.length})
        </h2>
        {bench.map((c: any) => {
          const otherId = otherIdOf(c);
          const arrivedNote = c.requester_id === myself ? "You added them" : "They added you";
          const badge = engagementBadge(otherId);
          return (
          <div key={c.id} className="person-row">
            <span className="person-row-info">
              <Avatar url={avatarOf(c)} name={nameOf(c) || ""} ring="bench" />
              <PersonLink id={otherId} name={nameOf(c) || ""} tier="bench" />
              <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.8rem" }}>{arrivedNote}</span>
              {badge && (
                <span className="tag gold" style={{ marginLeft: "0.4rem" }} title={`Community score: ${badge.score}`}>
                  {badge.label}
                </span>
              )}
            </span>
            <span className="person-row-actions">
              <form action={startConversation}>
                <input type="hidden" name="participant_ids" value={otherId} />
                <input type="hidden" name="title" value={`${nameOf(c)}`} />
                <input type="hidden" name="body" value={`Hi ${nameOf(c) || ""}, wanted to connect.`} />
                <button type="submit" className="secondary">Message</button>
              </form>
              <form action={removeConnection}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" className="secondary">Remove</button>
              </form>
            </span>
          </div>
          );
        })}
        {bench.length === 0 && <p className="muted">No bench connections yet.</p>}
      </div>

      <div className="card">
        <h2>Recommended for you</h2>
        <p className="muted">
          Colleagues who share at least one of your treatment specialisms. Capped to the top 10,
          recomputed live from shared specialisms and recent activity.
        </p>
        <ExpandableList
          max={5}
          moreLabelSuffix=" (up to 10)"
          items={recommended.map((p) => {
          const badge = engagementBadge(p.id);
          const shared = sharedSpecialismsWith(p);
          return (
          <div key={p.id} className="directory-row">
            <div className="directory-row-person">
              <Avatar url={avatarUrlByPath.get(p.avatar_path || "") || null} name={p.full_name} ring="recommended" />
              <span className="name">
                <span className="name-primary">
                  <PersonLink id={p.id} name={`${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}`} tier="recommended" />
                  {p.qualification_level ? `, ${p.qualification_level}` : ""}
                </span>
                {(p.primary_practice_city || p.primary_state) && (
                  <span className="name-meta">
                    {p.primary_practice_city}
                    {p.primary_practice_city && p.primary_state ? ", " : ""}
                    {p.primary_state}
                  </span>
                )}
              </span>
            </div>
            <div className="directory-row-badges">
              <ProfessionTag profession={professionFor(p.qualification_level)} />
              {p.psypact_participating && (
                <span className="tag" title="Holds PSYPACT Authority to Practice Interjurisdictional Telepsychology">
                  PSYPACT
                </span>
              )}
              {badge && (
                <span className="tag" title={`Community score: ${badge.score}`}>
                  {badge.label}
                </span>
              )}
            </div>
            <div className="directory-row-actions">
              <form action={startConversation} style={{ display: "inline" }}>
                <input type="hidden" name="participant_ids" value={p.id} />
                <input type="hidden" name="title" value={`${p.credential_prefix || ""} ${p.full_name}`.trim()} />
                <input type="hidden" name="body" value={`Hi ${p.full_name}, I noticed we share a specialism and wanted to reach out.`} />
                <button type="submit" className="secondary">Message</button>
              </form>
              <form action={sendConnectionRequest} style={{ display: "inline" }}>
                <input type="hidden" name="addressee_id" value={p.id} />
                <input type="hidden" name="tier" value="partner" />
                <button type="submit" className="btn-tier-partner">Connect (Partner)</button>
              </form>
              <form action={sendConnectionRequest} style={{ display: "inline" }}>
                <input type="hidden" name="addressee_id" value={p.id} />
                <input type="hidden" name="tier" value="bench" />
                <button type="submit" className="btn-tier-bench">Add to Bench</button>
              </form>
            </div>
            {shared.length > 0 && (
              <div className="directory-row-reason">
                Recommended because you both work with {shared.slice(0, 3).join(", ")}
                {shared.length > 3 ? `, and ${shared.length - 3} more` : ""}.
              </div>
            )}
          </div>
          );
        })}
        />
        {recommended.length === 0 && (
          <p className="muted">No matches yet. Verified colleagues with overlapping specialisms will show up here.</p>
        )}
      </div>

      <div className="card">
        <h2>Full verified directory ({people.size})</h2>
        <DirectoryBrowser
          people={directoryEntries}
          specialismOptions={specialismOptions}
          sendConnectionRequest={sendConnectionRequest}
          startConversation={startConversation}
        />
      </div>
    </div>
  );
}
