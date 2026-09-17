import { createClient } from "@/lib/supabase/server";
import { createReferralRequest, offerToHelp, acceptResponse, closeReferralRequest } from "./actions";
import { startConversation } from "../messages/actions";
import { rankCandidates, type MatchCandidate, type ConnectionTier } from "@/lib/matching";

export default async function ReferralsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [
    { data: specialisms },
    { data: myRequests },
    { data: openRequests },
    { data: myResponses },
    { data: directoryRows },
    { data: myConnections },
    { data: scores },
    { data: blocklist },
  ] = await Promise.all([
    supabase.from("lookup_values").select("id, value").eq("category", "treatment_specialism").order("value"),
    supabase
      .from("referral_requests")
      .select("*, lookup_values(value), referral_responses(*, profiles:responding_profile_id(full_name))")
      .eq("requesting_profile_id", myself)
      .order("created_at", { ascending: false }),
    supabase
      .from("referral_requests")
      .select("*, lookup_values(value)")
      .eq("status", "open")
      .neq("requesting_profile_id", myself)
      .order("created_at", { ascending: false }),
    supabase
      .from("referral_responses")
      .select("*, referral_requests(*, lookup_values(value))")
      .eq("responding_profile_id", myself)
      .order("created_at", { ascending: false }),
    supabase.from("public_directory").select("*"),
    supabase
      .from("connections")
      .select("requester_id, addressee_id, tier, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`),
    supabase.from("community_endorsement_scores").select("profile_id, score"),
    supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself),
  ]);

  const { data: myLookupValues } = await supabase
    .from("profile_lookup_values")
    .select("lookup_values(category, value)")
    .eq("profile_id", myself);
  const mySpecialismValues = new Set(
    (myLookupValues || [])
      .filter((l: any) => l.lookup_values?.category === "treatment_specialism")
      .map((l: any) => l.lookup_values.value as string)
  );

  const myOfferedIds = new Set((myResponses || []).map((r: any) => r.referral_request_id));

  // --- Matching engine inputs, built once and reused per open request ---
  const blockedIds = new Set((blocklist || []).map((b) => b.blocked_profile_id));
  const scoreById = new Map((scores || []).map((s) => [s.profile_id, s.score as number]));
  const tierByOtherId = new Map<string, ConnectionTier>();
  for (const c of myConnections || []) {
    const otherId = c.requester_id === myself ? c.addressee_id : c.requester_id;
    tierByOtherId.set(otherId, c.tier as ConnectionTier);
  }

  type DirectoryPersonForMatching = {
    id: string;
    full_name: string;
    credential_prefix: string | null;
    primary_practice_city: string | null;
    primary_state: string | null;
    last_active_at: string | null;
    psypact_participating: boolean;
    specialismRankById: Map<number, number>;
  };
  const peopleForMatching = new Map<string, DirectoryPersonForMatching>();
  for (const row of directoryRows || []) {
    if (row.id === myself || blockedIds.has(row.id)) continue;
    if (!peopleForMatching.has(row.id)) {
      peopleForMatching.set(row.id, {
        id: row.id,
        full_name: row.full_name,
        credential_prefix: row.credential_prefix,
        primary_practice_city: row.primary_practice_city,
        primary_state: row.primary_state,
        last_active_at: row.last_active_at,
        psypact_participating: row.psypact_participating,
        specialismRankById: new Map(),
      });
    }
    if (row.category === "treatment_specialism") {
      // lookup_value_id isn't in this row set directly, but we can key by
      // value -> we'll resolve rank per-request below via specialism value.
    }
  }
  // Build a value->rank map per person for treatment_specialism rows specifically.
  const specialismRankByPersonAndValue = new Map<string, Map<string, number>>();
  for (const row of directoryRows || []) {
    if (row.category !== "treatment_specialism") continue;
    if (!specialismRankByPersonAndValue.has(row.id)) specialismRankByPersonAndValue.set(row.id, new Map());
    if (row.rank != null) specialismRankByPersonAndValue.get(row.id)!.set(row.value, row.rank);
  }

  function suggestedMatchesFor(request: any) {
    const neededSpecialismValue: string | undefined = request.lookup_values?.value;
    const candidates: MatchCandidate[] = Array.from(peopleForMatching.values()).map((p) => ({
      profileId: p.id,
      fullName: `${p.credential_prefix || ""} ${p.full_name}`.trim(),
      city: p.primary_practice_city,
      state: p.primary_state,
      specialismRank: neededSpecialismValue
        ? specialismRankByPersonAndValue.get(p.id)?.get(neededSpecialismValue) ?? null
        : null,
      connectionTier:
        tierByOtherId.get(p.id) ??
        (Array.from(specialismRankByPersonAndValue.get(p.id)?.keys() || []).some((v) => mySpecialismValues.has(v))
          ? "recommended"
          : "none"),
      endorsementScore: scoreById.get(p.id) || 0,
      lastActiveAt: p.last_active_at,
      psypactParticipating: p.psypact_participating,
    }));
    return rankCandidates(candidates, { city: request.city, state: request.state }).slice(0, 5);
  }

  return (
    <div>
      <h1>Referrals &amp; coverage</h1>
      <p className="muted">
        Post a need — a client you can't take, a coverage gap — and see it here matched to the
        right specialism. Colleagues offer to help; you pick one.
      </p>

      <div className="card">
        <h2>Post a referral need</h2>
        <form action={createReferralRequest}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="specialism_lookup_id">Specialism needed</label>
              <select id="specialism_lookup_id" name="specialism_lookup_id">
                <option value="">—</option>
                {(specialisms || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.value}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="city">City</label>
              <input id="city" name="city" type="text" placeholder="Austin" />
            </div>
            <div className="field">
              <label htmlFor="state">State</label>
              <input id="state" name="state" type="text" maxLength={2} placeholder="TX" />
            </div>
            <div className="field">
              <label htmlFor="insurance">Insurance</label>
              <input id="insurance" name="insurance" type="text" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={2} />
          </div>
          <button type="submit">Post request</button>
        </form>
      </div>

      <div className="card">
        <h2>My requests</h2>
        {(myRequests || []).map((r: any) => (
          <div key={r.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <strong>{r.lookup_values?.value || "Any specialism"}</strong>
              {r.state ? ` · ${r.state}` : ""}{r.insurance ? ` · ${r.insurance}` : ""}{" "}
              <span className="tag">{r.status}</span>
            </div>
            {r.notes && <p className="muted">{r.notes}</p>}
            {(r.referral_responses || []).map((resp: any) => (
              <div key={resp.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
                <span>{resp.profiles?.full_name} — {resp.status}{resp.message ? `: "${resp.message}"` : ""}</span>
                <span>
                  <form action={startConversation} style={{ display: "inline" }}>
                    <input type="hidden" name="participant_ids" value={resp.responding_profile_id} />
                    <input type="hidden" name="title" value={`Re: ${r.lookup_values?.value || "referral"} request`} />
                    <input type="hidden" name="body" value={`Hi ${resp.profiles?.full_name || ""}, thanks for offering to help — could we discuss further?`} />
                    <button type="submit" className="secondary" style={{ marginRight: "0.4rem" }}>Discuss</button>
                  </form>
                  {resp.status === "offered" && r.status === "open" && (
                    <form action={acceptResponse} style={{ display: "inline" }}>
                      <input type="hidden" name="response_id" value={resp.id} />
                      <input type="hidden" name="referral_request_id" value={r.id} />
                      <button type="submit">Accept</button>
                    </form>
                  )}
                </span>
              </div>
            ))}
            {r.status === "open" && (
              <>
                <form action={closeReferralRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="secondary">Close without matching</button>
                </form>
                <div style={{ marginTop: "0.75rem" }}>
                  <p className="muted" style={{ marginBottom: "0.35rem" }}>
                    Suggested colleagues to reach out to (weighted by location, specialism rank, network
                    tier, and community engagement):
                  </p>
                  {suggestedMatchesFor(r).map((m) => (
                    <div key={m.profileId} className="checkbox-row" style={{ justifyContent: "space-between" }}>
                      <span>
                        {m.fullName}
                        {m.locationTier !== "national" ? ` · ${m.locationTier}` : ""}
                        {m.connectionTier !== "none" && <span className="tag" style={{ marginLeft: "0.4rem" }}>{m.connectionTier}</span>}
                        {m.psypactParticipating && (
                          <span className="tag" style={{ marginLeft: "0.4rem" }} title="Holds PSYPACT Authority to Practice Interjurisdictional Telepsychology — may be able to see this client by telehealth across state lines">
                            PSYPACT
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className="muted" style={{ fontSize: "0.8rem" }}>score {m.score}</span>
                        <form action={startConversation}>
                          <input type="hidden" name="participant_ids" value={m.profileId} />
                          <input type="hidden" name="title" value={`${r.lookup_values?.value || "Referral"} — coverage request`} />
                          <input
                            type="hidden"
                            name="body"
                            value={`Hi ${m.fullName}, I'm looking to refer a client${r.state ? ` in ${r.state}` : ""}${r.lookup_values?.value ? ` for ${r.lookup_values.value}` : ""}. Are you able to help?`}
                          />
                          <button type="submit" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                            Message
                          </button>
                        </form>
                      </span>
                    </div>
                  ))}
                  {suggestedMatchesFor(r).length === 0 && (
                    <p className="muted">No verified colleagues to suggest yet.</p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {(myRequests || []).length === 0 && <p className="muted">You haven't posted any requests.</p>}
      </div>

      <div className="card">
        <h2>Open requests from colleagues</h2>
        {(openRequests || []).map((r: any) => (
          <div key={r.id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
            <span>
              <strong>{r.lookup_values?.value || "Any specialism"}</strong>
              {r.state ? ` · ${r.state}` : ""}{r.insurance ? ` · ${r.insurance}` : ""}
              {r.notes ? ` — ${r.notes}` : ""}
            </span>
            {myOfferedIds.has(r.id) ? (
              <span className="muted">offered</span>
            ) : (
              <form action={offerToHelp}>
                <input type="hidden" name="referral_request_id" value={r.id} />
                <button type="submit">I can help</button>
              </form>
            )}
          </div>
        ))}
        {(openRequests || []).length === 0 && <p className="muted">No open requests right now.</p>}
      </div>
    </div>
  );
}
