import type { createClient } from "@/lib/supabase/server";
import { computeGridRankedCandidates } from "@/lib/server-matching";
import { assignColleagueToClient } from "./people/actions";
import { startConversation } from "./messages/actions";

// Shared "quick search one client, get 3 ranked recommendations" tool -
// rendered on both the Caseload and Planner pages (per Nick's spec), each
// with its own query-param namespace so the two instances don't collide on
// the same page render. A plain server component (not a route) so both
// pages can just drop it in without an extra fetch round-trip.
export default async function SinglePatientReferral({
  supabase,
  myself,
  query,
  paramName,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  myself: string;
  query: string;
  paramName: string;
}) {
  const trimmed = query.trim();
  let matchedClient: any = null;

  if (trimmed) {
    const asNumber = Number(trimmed);
    let q = supabase
      .from("caseload_clients")
      .select("id, private_label, primary_need, state, session_type, insurance, is_active")
      .eq("profile_id", myself);
    q =
      Number.isFinite(asNumber) && String(asNumber) === trimmed
        ? q.eq("id", asNumber)
        : q.ilike("private_label", `%${trimmed}%`);
    const { data: rows } = await q.limit(1);
    matchedClient = rows && rows.length > 0 ? rows[0] : null;
  }

  let candidates: Awaited<ReturnType<typeof computeGridRankedCandidates>> = [];
  if (matchedClient) {
    const { data: rejections } = await supabase
      .from("referral_rejections")
      .select("candidate_profile_id")
      .eq("profile_id", myself)
      .eq("caseload_client_id", matchedClient.id);
    const ranked = await computeGridRankedCandidates(
      supabase,
      myself,
      {
        specialismValue: matchedClient.primary_need,
        state: matchedClient.state,
        sessionType: matchedClient.session_type,
      },
      (rejections || []).map((r: any) => r.candidate_profile_id)
    );
    candidates = ranked.slice(0, 3);
  }

  return (
    <div className="card">
      <h2>Single Patient Referral</h2>
      <p className="muted">
        Look up one client by its number or identifier and get PsyAlliance's top 3 ranked
        recommendations for them, without touching the full table below.
      </p>
      <form method="GET" className="field-row" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label htmlFor={`${paramName}_input`}>Client number or identifier</label>
          <input id={`${paramName}_input`} name={paramName} type="text" defaultValue={trimmed} placeholder="e.g. 14 or CL-1042" />
        </div>
        <div className="field" style={{ flex: "0 0 auto" }}>
          <button type="submit" className="secondary">Find matches</button>
        </div>
      </form>

      {trimmed && !matchedClient && (
        <p className="muted" style={{ marginTop: "0.75rem" }}>No client matches "{trimmed}".</p>
      )}

      {matchedClient && (
        <div style={{ marginTop: "0.9rem" }}>
          <p>
            Client <strong>{matchedClient.private_label}</strong>
            {matchedClient.primary_need ? <> · <span className="tag">{matchedClient.primary_need}</span></> : ""}
            {matchedClient.state ? ` · ${matchedClient.state}` : ""}
          </p>
          {candidates.length === 0 && <p className="muted">No qualifying colleagues found for this client yet.</p>}
          <div className="quick-match-list">
            {candidates.map((c, i) => (
              <div key={c.profileId} className="person-row">
                <span className="person-row-info">
                  <span className="quick-match-rank">#{i + 1}</span>
                  <a href={`/dashboard/people/${c.profileId}`} className={`person-link tier-${c.connectionTier}`}>
                    {c.fullName}
                  </a>
                  <span className="muted" style={{ marginLeft: "0.4rem" }}>
                    {c.city}{c.city && c.state ? ", " : ""}{c.state} · score {c.gridScore}
                  </span>
                </span>
                <span className="person-row-actions">
                  <form action={assignColleagueToClient}>
                    <input type="hidden" name="assigned_profile_id" value={c.profileId} />
                    <input type="hidden" name="caseload_client_id" value={matchedClient.id} />
                    <button type="submit" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>Assign</button>
                  </form>
                  <form action={startConversation}>
                    <input type="hidden" name="participant_ids" value={c.profileId} />
                    <input type="hidden" name="title" value={c.fullName} />
                    <input
                      type="hidden"
                      name="body"
                      value={`Hi ${c.fullName}, would you be able to take a referral for client ${matchedClient.private_label}${matchedClient.primary_need ? ` (${matchedClient.primary_need})` : ""}?`}
                    />
                    <button type="submit" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                      Message
                    </button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
