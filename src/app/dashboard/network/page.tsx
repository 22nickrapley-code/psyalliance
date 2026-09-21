import { createClient } from "@/lib/supabase/server";
import { sendConnectionRequest, respondToConnection, removeConnection } from "./actions";
import { startConversation } from "../messages/actions";
import { resolveAvatarUrls } from "@/lib/avatars";
import Avatar from "../avatar";
import { professionFor, professionLabel, type Profession } from "@/lib/profession";
import UsStateDatalist from "@/components/us-state-datalist";

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
};

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
    searchParams: Promise<{ q?: string; state?: string; specialism?: string; degree?: string; psypact?: string; profession?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const recommended = Array.from(people.values())
    .filter((p) => !connectionByOtherId.has(p.id))
    .filter((p) => sharedSpecialismsWith(p).length > 0)
    .slice(0, 10);

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

  const q = (searchParams?.q || "").trim().toLowerCase();
  const stateFilter = (searchParams?.state || "").trim().toUpperCase();
  const specialismFilter = searchParams?.specialism || "";
  const degreeFilter = searchParams?.degree || "";
  const psypactFilter = searchParams?.psypact === "1";
  const professionFilter = searchParams?.profession || "";

  const filteredDirectory = Array.from(people.values()).filter((p) => {
    if (q && !p.full_name.toLowerCase().includes(q)) return false;
    if (stateFilter && p.primary_state !== stateFilter) return false;
    if (specialismFilter && !p.specialisms.has(specialismFilter)) return false;
    if (degreeFilter && degreeFilter !== "all" && connectionDegree(p) !== degreeFilter) return false;
    if (psypactFilter && !p.psypact_participating) return false;
    if (professionFilter && professionFor(p.qualification_level) !== professionFilter) return false;
    return true;
  });

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

      {incoming.length > 0 && (
        <div className="card">
          <h2>Pending requests to you</h2>
          {incoming.map((c: any) => (
            <div key={c.id} className="person-row">
              <span className="person-row-info">
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
        </div>
      )}

      <div className="card">
        <h2>
          <span className="tag tier-partner" style={{ marginRight: "0.5rem" }}>Partner</span>
          Partners ({partners.length})
        </h2>
        {partners.map((c: any) => {
          const otherId = otherIdOf(c);
          return (
          <div key={c.id} className="person-row">
            <span className="person-row-info">
              <Avatar url={avatarOf(c)} name={nameOf(c) || ""} />
              <PersonLink id={otherId} name={nameOf(c) || ""} tier="partner" />
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
          return (
          <div key={c.id} className="person-row">
            <span className="person-row-info">
              <Avatar url={avatarOf(c)} name={nameOf(c) || ""} />
              <PersonLink id={otherId} name={nameOf(c) || ""} tier="bench" />
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

      {outgoing.length > 0 && (
        <div className="card">
          <h2>Sent requests, awaiting response</h2>
          {outgoing.map((c: any) => (
            <div key={c.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                <Avatar url={avatarOf(c)} name={nameOf(c) || ""} />
                <PersonLink id={otherIdOf(c)} name={nameOf(c) || ""} />
              </span>
              <TierTag tier={c.tier} />
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Recommended for you</h2>
        <p className="muted">Colleagues who share at least one of your treatment specialisms.</p>
        {recommended.map((p) => {
          const badge = engagementBadge(p.id);
          const shared = sharedSpecialismsWith(p);
          return (
          <div key={p.id} className="directory-row">
            <div className="directory-row-person">
              <Avatar url={avatarUrlByPath.get(p.avatar_path || "") || null} name={p.full_name} />
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
                <button type="submit">Connect (Partner)</button>
              </form>
              <form action={sendConnectionRequest} style={{ display: "inline" }}>
                <input type="hidden" name="addressee_id" value={p.id} />
                <input type="hidden" name="tier" value="bench" />
                <button type="submit" className="secondary">Add to Bench</button>
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
        {recommended.length === 0 && (
          <p className="muted">No matches yet. Verified colleagues with overlapping specialisms will show up here.</p>
        )}
      </div>

      <div className="card">
        <h2>Full verified directory ({filteredDirectory.length} of {people.size})</h2>
        <form method="GET" className="field-row" style={{ alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div className="field">
            <label htmlFor="q">Name</label>
            <input id="q" name="q" type="text" defaultValue={searchParams?.q || ""} placeholder="Search by name" />
          </div>
          <div className="field" style={{ maxWidth: 100 }}>
            <label htmlFor="state">State</label>
            <input id="state" name="state" type="text" maxLength={24} defaultValue={searchParams?.state || ""} placeholder="TX or Texas" list="us-states" autoComplete="off" />
            <UsStateDatalist />
          </div>
          <div className="field">
            <label htmlFor="specialism">Specialism</label>
            <select id="specialism" name="specialism" defaultValue={specialismFilter}>
              <option value="">Any</option>
              {(allSpecialisms || []).map((s) => (
                <option key={s.value} value={s.value}>{s.value}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="degree">Connection</label>
            <select id="degree" name="degree" defaultValue={degreeFilter}>
              <option value="all">All</option>
              <option value="partner">Partner</option>
              <option value="bench">Bench</option>
              <option value="recommended">Recommended</option>
              <option value="none">Not yet connected</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="profession">Profession</label>
            <select id="profession" name="profession" defaultValue={professionFilter}>
              <option value="">Any</option>
              <option value="psychologist">Psychologist</option>
              <option value="psychiatrist">Psychiatrist</option>
            </select>
          </div>
          <div className="field checkbox-row" style={{ flex: "0 0 auto", alignSelf: "center" }}>
            <input id="psypact" name="psypact" type="checkbox" value="1" defaultChecked={psypactFilter} />
            <label htmlFor="psypact" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
              PSYPACT only
            </label>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Filter</button>
          </div>
          {(q || stateFilter || specialismFilter || degreeFilter || psypactFilter || professionFilter) && (
            <div className="field" style={{ flex: "0 0 auto" }}>
              <a href="/dashboard/network" className="btn secondary" style={{ display: "inline-block" }}>Clear</a>
            </div>
          )}
        </form>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Profession</th>
              <th>City / state</th>
              <th>Specialisms</th>
              <th>Degree</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredDirectory.map((p) => {
              const degree = connectionDegree(p);
              return (
              <tr key={p.id}>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Avatar url={avatarUrlByPath.get(p.avatar_path || "") || null} name={p.full_name} size={24} />
                    <PersonLink
                      id={p.id}
                      name={`${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}`}
                      tier={degree}
                    />
                  </span>
                  {p.psypact_participating && (
                    <span className="tag" style={{ marginLeft: "0.4rem" }} title="Holds PSYPACT Authority to Practice Interjurisdictional Telepsychology">
                      PSYPACT
                    </span>
                  )}
                </td>
                <td><ProfessionTag profession={professionFor(p.qualification_level)} /></td>
                <td>{p.primary_practice_city || "-"}{p.primary_state ? `, ${p.primary_state}` : ""}</td>
                <td>{[...p.specialisms].slice(0, 3).map((s) => <span key={s} className="tag">{s}</span>)}</td>
                <td><TierTag tier={degree} /></td>
                <td>
                  {connectionByOtherId.has(p.id) ? (
                    connectionByOtherId.get(p.id).status === "accepted" ? (
                      <form action={startConversation} style={{ display: "inline" }}>
                        <input type="hidden" name="participant_ids" value={p.id} />
                        <input type="hidden" name="title" value={`${p.credential_prefix || ""} ${p.full_name}`.trim()} />
                        <input type="hidden" name="body" value={`Hi ${p.full_name}, `} />
                        <button type="submit" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                          Message
                        </button>
                      </form>
                    ) : (
                      <span className="muted">{connectionByOtherId.get(p.id).status}</span>
                    )
                  ) : (
                    <form action={sendConnectionRequest} style={{ display: "inline" }}>
                      <input type="hidden" name="addressee_id" value={p.id} />
                      <input type="hidden" name="tier" value="partner" />
                      <button type="submit" className="secondary">Connect</button>
                    </form>
                  )}
                </td>
              </tr>
              );
            })}
            {filteredDirectory.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {people.size === 0 ? "No verified colleagues yet." : "No colleagues match those filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
