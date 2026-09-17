import { createClient } from "@/lib/supabase/server";
import { sendConnectionRequest, respondToConnection, removeConnection } from "./actions";

type DirectoryPerson = {
  id: string;
  full_name: string;
  credential_prefix: string | null;
  qualification_level: string;
  primary_practice_city: string | null;
  primary_state: string | null;
  accepting_referrals: boolean;
  specialisms: Set<string>;
};

export default async function NetworkPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: directoryRows }, { data: connections }, { data: myLookups }, { data: blocklist }, { data: scores }] =
    await Promise.all([
      supabase.from("public_directory").select("*"),
      supabase
        .from("connections")
        .select("*, requester:requester_id(full_name), addressee:addressee_id(full_name)")
        .or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`),
      supabase
        .from("profile_lookup_values")
        .select("lookup_value_id, lookup_values(category, value)")
        .eq("profile_id", user!.id),
      supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", user!.id),
      supabase.from("community_endorsement_scores").select("profile_id, score"),
    ]);

  const blockedIds = new Set((blocklist || []).map((b) => b.blocked_profile_id));
  const scoreById = new Map((scores || []).map((s) => [s.profile_id, s.score as number]));
  const engagementBadge = (personId: string) => {
    const score = scoreById.get(personId) || 0;
    if (score >= 20) return { label: "Highly engaged — consider Partner", score };
    if (score >= 10) return { label: "Community pick — consider Bench", score };
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
        specialisms: new Set(),
      });
    }
    if (row.category === "treatment_specialism") {
      people.get(row.id)!.specialisms.add(row.value);
    }
  }

  const mySpecialisms = new Set(
    (myLookups || [])
      .filter((l: any) => l.lookup_values?.category === "treatment_specialism")
      .map((l: any) => l.lookup_values.value)
  );

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
    .filter((p) => [...p.specialisms].some((s) => mySpecialisms.has(s)))
    .slice(0, 10);

  const nameOf = (c: any) => (c.requester_id === myself ? c.addressee?.full_name : c.requester?.full_name);

  return (
    <div>
      <h1>Network</h1>
      <p className="muted">
        Partners are first-degree, mutual-consent connections. Bench is a looser "known, not yet
        connected" tier. Recommended is computed from shared specialisms — nothing here is stored
        until you connect.
      </p>

      {incoming.length > 0 && (
        <div className="card">
          <h2>Pending requests to you</h2>
          {incoming.map((c: any) => (
            <div key={c.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
              <span>{nameOf(c)} wants to connect as <strong>{c.tier}</strong></span>
              <span>
                <form action={respondToConnection} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="decision" value="accepted" />
                  <button type="submit">Accept</button>
                </form>{" "}
                <form action={respondToConnection} style={{ display: "inline" }}>
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
        <h2>Partners ({partners.length})</h2>
        {partners.map((c: any) => (
          <div key={c.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
            <span>{nameOf(c)}</span>
            <form action={removeConnection}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="secondary">Remove</button>
            </form>
          </div>
        ))}
        {partners.length === 0 && <p className="muted">No partners yet.</p>}
      </div>

      <div className="card">
        <h2>Bench ({bench.length})</h2>
        {bench.map((c: any) => (
          <div key={c.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
            <span>{nameOf(c)}</span>
            <form action={removeConnection}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="secondary">Remove</button>
            </form>
          </div>
        ))}
        {bench.length === 0 && <p className="muted">No bench connections yet.</p>}
      </div>

      {outgoing.length > 0 && (
        <div className="card">
          <h2>Sent requests, awaiting response</h2>
          {outgoing.map((c: any) => (
            <p key={c.id} className="muted">{nameOf(c)} — {c.tier}</p>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Recommended for you</h2>
        <p className="muted">Colleagues who share at least one of your treatment specialisms.</p>
        {recommended.map((p) => {
          const badge = engagementBadge(p.id);
          return (
          <div key={p.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
            <span>
              {p.credential_prefix} {p.full_name} — {p.qualification_level}
              {p.primary_practice_city ? `, ${p.primary_practice_city}` : ""}
              {p.primary_state ? `, ${p.primary_state}` : ""}
              {badge && (
                <span className="tag" style={{ marginLeft: "0.5rem" }} title={`Community score: ${badge.score}`}>
                  {badge.label}
                </span>
              )}
            </span>
            <span>
              <form action={sendConnectionRequest} style={{ display: "inline" }}>
                <input type="hidden" name="addressee_id" value={p.id} />
                <input type="hidden" name="tier" value="partner" />
                <button type="submit">Connect (Partner)</button>
              </form>{" "}
              <form action={sendConnectionRequest} style={{ display: "inline" }}>
                <input type="hidden" name="addressee_id" value={p.id} />
                <input type="hidden" name="tier" value="bench" />
                <button type="submit" className="secondary">Add to Bench</button>
              </form>
            </span>
          </div>
          );
        })}
        {recommended.length === 0 && (
          <p className="muted">No matches yet — verified colleagues with overlapping specialisms will show up here.</p>
        )}
      </div>

      <div className="card">
        <h2>Full verified directory ({people.size})</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>City / state</th>
              <th>Specialisms</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {Array.from(people.values()).map((p) => (
              <tr key={p.id}>
                <td>{p.credential_prefix} {p.full_name}</td>
                <td>{p.primary_practice_city || "—"}{p.primary_state ? `, ${p.primary_state}` : ""}</td>
                <td>{[...p.specialisms].slice(0, 3).map((s) => <span key={s} className="tag">{s}</span>)}</td>
                <td>
                  {connectionByOtherId.has(p.id) ? (
                    <span className="muted">{connectionByOtherId.get(p.id).status}</span>
                  ) : (
                    <form action={sendConnectionRequest} style={{ display: "inline" }}>
                      <input type="hidden" name="addressee_id" value={p.id} />
                      <input type="hidden" name="tier" value="partner" />
                      <button type="submit" className="secondary">Connect</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {people.size === 0 && (
              <tr>
                <td colSpan={4} className="muted">No verified colleagues yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
