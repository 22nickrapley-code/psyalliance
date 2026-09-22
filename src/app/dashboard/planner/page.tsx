import { createClient } from "@/lib/supabase/server";
import { computeGridRankedCandidates } from "@/lib/server-matching";
import { assignColleagueToClient, markSentToPatient } from "../people/actions";
import { startConversation } from "../messages/actions";
import SinglePatientReferral from "../single-patient-referral";
import {
  rejectCandidate,
  unassignReferral,
  rateAssignmentSatisfaction,
  bulkSendAssignedMessages,
} from "./actions";

type Tier = "partner" | "trusted_colleague" | "bench" | "recommended" | "none";

function TierTag({ tier }: { tier: Tier }) {
  if (tier === "none") return <span className="tag tier-none">Not yet connected</span>;
  const label = tier === "partner" || tier === "trusted_colleague" ? "Trusted Colleague" : tier === "bench" ? "Bench" : "Recommended";
  return <span className={`tag tier-${tier}`}>{label}</span>;
}

const OUT_OF_POCKET_RE = /^out.?of.?pocket$/i;

export default async function PlannerPage(
  props: { searchParams: Promise<{ error?: string; insurance?: string; mix_yes?: string; spr?: string }> }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const insuranceMode = searchParams.insurance === "yes" || searchParams.insurance === "mix" ? searchParams.insurance : "no";
  const mixYesIds = new Set((searchParams.mix_yes || "").split(",").filter(Boolean).map(Number));

  const [{ data: activeClients }, { data: assignments }, { data: rejections }] = await Promise.all([
    supabase
      .from("caseload_clients")
      .select("id, private_label, primary_need, state, session_type, insurance, book_of_business_id, books_of_business(name)")
      .eq("profile_id", myself)
      .eq("is_active", true)
      .order("book_of_business_id")
      .order("private_label"),
    supabase
      .from("referral_assignments")
      .select("*, assigned:assigned_profile_id(full_name, credential_prefix)")
      .eq("profile_id", myself)
      .eq("status", "assigned")
      .order("created_at", { ascending: false }),
    supabase.from("referral_rejections").select("caseload_client_id, candidate_profile_id").eq("profile_id", myself),
  ]);

  // Only the most recent assignment per client counts as "currently
  // assigned" - a client can accumulate history (unassigned/cancelled rows)
  // but only ever has one active assignment at a time.
  const currentAssignmentByClient = new Map<number, any>();
  for (const a of assignments || []) {
    if (!currentAssignmentByClient.has(a.caseload_client_id)) {
      currentAssignmentByClient.set(a.caseload_client_id, a);
    }
  }

  const rejectedByClient = new Map<number, string[]>();
  for (const r of rejections || []) {
    const list = rejectedByClient.get(r.caseload_client_id) || [];
    list.push(r.candidate_profile_id);
    rejectedByClient.set(r.caseload_client_id, list);
  }

  const rows = await Promise.all(
    (activeClients || []).map(async (c: any) => {
      const assigned = currentAssignmentByClient.get(c.id) || null;
      const excludeIds = [...(rejectedByClient.get(c.id) || [])];
      if (assigned) excludeIds.push(assigned.assigned_profile_id);

      const insuranceIsOutOfPocket = !c.insurance || OUT_OF_POCKET_RE.test(c.insurance);
      const applyInsurance =
        !insuranceIsOutOfPocket && (insuranceMode === "yes" || (insuranceMode === "mix" && mixYesIds.has(c.id)));

      const ranked = await computeGridRankedCandidates(
        supabase,
        myself,
        {
          specialismValue: c.primary_need,
          state: c.state,
          sessionType: c.session_type,
          insuranceValue: applyInsurance ? c.insurance : null,
        },
        excludeIds
      );
      const filtered = applyInsurance ? ranked.filter((r) => r.acceptsInsurance !== false) : ranked;

      return { client: c, assigned, recommended: filtered.slice(0, 3), insuranceApplied: applyInsurance };
    })
  );

  // Planner (Team) - every colleague currently carrying at least one
  // assigned referral, with their relationship tier, load, and the most
  // recent satisfaction rating recorded against them.
  const { data: myConnections } = await supabase
    .from("connections")
    .select("requester_id, addressee_id, tier")
    .eq("status", "accepted")
    .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`);
  const tierByColleague = new Map<string, Tier>();
  for (const c of myConnections || []) {
    const otherId = c.requester_id === myself ? c.addressee_id : c.requester_id;
    tierByColleague.set(otherId, c.tier as Tier);
  }

  type TeamEntry = { name: string; tier: Tier; clientLabels: string[]; latestRating: string | null; latestId: number };
  const teamByColleague = new Map<string, TeamEntry>();
  const clientLabelById = new Map<number, string>(
    (activeClients || []).map((c: any) => [c.id as number, c.private_label as string])
  );
  for (const a of assignments || []) {
    const key = a.assigned_profile_id;
    const entry: TeamEntry = teamByColleague.get(key) || {
      name: `${a.assigned?.credential_prefix ? a.assigned.credential_prefix + " " : ""}${a.assigned?.full_name || "Colleague"}`,
      tier: (tierByColleague.get(key) || "recommended") as Tier,
      clientLabels: [],
      latestRating: null,
      latestId: a.id,
    };
    entry.clientLabels.push(clientLabelById.get(a.caseload_client_id) || "-");
    if (a.id === entry.latestId && a.satisfaction_rating) entry.latestRating = a.satisfaction_rating as string;
    teamByColleague.set(key, entry);
  }
  const teamRows = Array.from(teamByColleague.entries()).map(([id, v]) => ({ id, ...v }));

  const insuranceHref = (mode: string) => {
    const p = new URLSearchParams();
    p.set("insurance", mode);
    return `/dashboard/planner?${p.toString()}`;
  };
  const mixToggleHref = (clientId: number) => {
    const next = new Set(mixYesIds);
    if (next.has(clientId)) next.delete(clientId);
    else next.add(clientId);
    const p = new URLSearchParams();
    p.set("insurance", "mix");
    if (next.size > 0) p.set("mix_yes", [...next].join(","));
    return `/dashboard/planner?${p.toString()}`;
  };

  return (
    <div>
      <h1>Planner</h1>
      <p className="muted">
        PsyAlliance's ranked recommendations for every active client on your caseload, refreshed on
        every load. Assign a colleague, message them, and mark when the patient's been given their
        details - all from this table. Managing a planned leave/coverage window instead? Use{" "}
        <a href="/dashboard/planner/coverage-plans">Coverage plans</a>.
      </p>

      {searchParams.error && <div className="error-banner">{searchParams.error}</div>}

      <SinglePatientReferral supabase={supabase} myself={myself} query={searchParams.spr || ""} paramName="spr" />

      <div className="panel-card">
        <div className="panel-card-header">
          <h2>Recommended by PsyAlliance</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: "0.85rem" }}>Match insurance:</span>
            <div className="match-toggle-group" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
              {(["yes", "no", "mix"] as const).map((mode) => (
                <a
                  key={mode}
                  href={insuranceHref(mode)}
                  className={insuranceMode === mode ? "active" : ""}
                  style={{ color: insuranceMode === mode ? undefined : "var(--text)" }}
                >
                  {mode === "yes" ? "Yes" : mode === "no" ? "No" : "Mix"}
                </a>
              ))}
            </div>
            <form action={bulkSendAssignedMessages}>
              <button type="submit" className="secondary">Send</button>
            </form>
          </div>
        </div>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Yes only shows colleagues on the client's insurance panel. Mix lets you flip it per client
          below. Out-of-pocket clients always match everyone.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table className="caseload-table">
            <thead>
              <tr>
                <th className="caseload-col-narrow">No.</th>
                <th>Client identifier</th>
                <th>Recommended #1</th>
                <th>Recommended #2</th>
                <th>Recommended #3</th>
                <th className="caseload-col-divide">Assigned</th>
                <th>Message</th>
                <th>Send Practitioner Details to Patient</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.client.id}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{row.client.private_label}</strong>
                    {row.client.books_of_business?.name && (
                      <div className="muted" style={{ fontSize: "0.75rem" }}>{row.client.books_of_business.name}</div>
                    )}
                    {insuranceMode === "mix" && (
                      <a href={mixToggleHref(row.client.id)} style={{ fontSize: "0.72rem" }}>
                        Insurance match: {row.insuranceApplied ? "On" : "Off"}
                      </a>
                    )}
                  </td>
                  {[0, 1, 2].map((slot) => {
                    const cand = row.recommended[slot];
                    if (!cand) {
                      return <td key={slot} className="muted">-</td>;
                    }
                    return (
                      <td key={slot}>
                        <a href={`/dashboard/people/${cand.profileId}`} className={`person-link tier-${cand.connectionTier}`}>
                          {cand.fullName}
                        </a>
                        <div className="muted" style={{ fontSize: "0.72rem" }}>score {cand.gridScore}</div>
                        <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.2rem" }}>
                          <form action={assignColleagueToClient}>
                            <input type="hidden" name="assigned_profile_id" value={cand.profileId} />
                            <input type="hidden" name="caseload_client_id" value={row.client.id} />
                            <button type="submit" className="icon-btn-assign" title="Assign">+</button>
                          </form>
                          <form action={rejectCandidate}>
                            <input type="hidden" name="candidate_profile_id" value={cand.profileId} />
                            <input type="hidden" name="caseload_client_id" value={row.client.id} />
                            <button type="submit" className="icon-btn-reject" title="Reject">&minus;</button>
                          </form>
                        </div>
                      </td>
                    );
                  })}
                  <td className="caseload-col-divide">
                    {row.assigned ? (
                      <>
                        <a href={`/dashboard/people/${row.assigned.assigned_profile_id}`}>
                          {row.assigned.assigned?.credential_prefix} {row.assigned.assigned?.full_name}
                        </a>
                        <form action={unassignReferral}>
                          <input type="hidden" name="id" value={row.assigned.id} />
                          <button type="submit" className="secondary" style={{ padding: "0.1rem 0.4rem", fontSize: "0.72rem", marginTop: "0.2rem" }}>
                            Unassign
                          </button>
                        </form>
                      </>
                    ) : (
                      <span className="muted">Not yet assigned</span>
                    )}
                  </td>
                  <td>
                    {row.assigned ? (
                      <form action={startConversation}>
                        <input type="hidden" name="participant_ids" value={row.assigned.assigned_profile_id} />
                        <input type="hidden" name="title" value={row.assigned.assigned?.full_name} />
                        <input
                          type="hidden"
                          name="body"
                          value={`Hi ${row.assigned.assigned?.full_name || ""}, following up on the referral for client ${row.client.private_label}${row.client.primary_need ? ` (${row.client.primary_need})` : ""}.`}
                        />
                        <button type="submit" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                          Message
                        </button>
                      </form>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td>
                    {row.assigned ? (
                      row.assigned.sent_to_patient ? (
                        <span className="tag">Sent</span>
                      ) : (
                        <form action={markSentToPatient}>
                          <input type="hidden" name="id" value={row.assigned.id} />
                          <input type="hidden" name="assigned_profile_id" value={row.assigned.assigned_profile_id} />
                          <button type="submit" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                            Send
                          </button>
                        </form>
                      )
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    No active clients yet - add one on <a href="/dashboard/caseload">Caseload</a> first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card-header">
          <h2>Planner (Team)</h2>
        </div>
        <p className="muted">Every colleague currently carrying at least one assigned referral from you.</p>
        <table className="caseload-table">
          <thead>
            <tr>
              <th className="caseload-col-narrow">Relationship</th>
              <th>Team psychologist</th>
              <th className="caseload-col-narrow">Total no. patients</th>
              <th>Clients</th>
              <th className="caseload-col-divide">Assignment completed satisfactorily</th>
            </tr>
          </thead>
          <tbody>
            {teamRows.map((t) => (
              <tr key={t.id}>
                <td><TierTag tier={t.tier} /></td>
                <td><a href={`/dashboard/people/${t.id}`}>{t.name}</a></td>
                <td>{t.clientLabels.length}</td>
                <td>
                  {t.clientLabels.slice(0, 5).map((label, idx) => (
                    <span key={idx} className="tag" style={{ marginRight: "0.25rem" }}>{label}</span>
                  ))}
                  {t.clientLabels.length > 5 && <span className="muted">+{t.clientLabels.length - 5} more</span>}
                </td>
                <td className="caseload-col-divide">
                  <form action={rateAssignmentSatisfaction} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={t.latestId} />
                    <input type="hidden" name="rating" value="down" />
                    <button type="submit" className={`icon-btn-rating${t.latestRating === "down" ? " active" : ""}`} title="Not satisfactory">👎</button>
                  </form>
                  <form action={rateAssignmentSatisfaction} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={t.latestId} />
                    <input type="hidden" name="rating" value="up" />
                    <button type="submit" className={`icon-btn-rating${t.latestRating === "up" ? " active" : ""}`} title="Satisfactory">👍</button>
                  </form>
                  <form action={rateAssignmentSatisfaction} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={t.latestId} />
                    <input type="hidden" name="rating" value="heart" />
                    <button type="submit" className={`icon-btn-rating${t.latestRating === "heart" ? " active" : ""}`} title="Excellent">❤️</button>
                  </form>
                </td>
              </tr>
            ))}
            {teamRows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No assigned referrals yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
