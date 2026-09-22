import { createClient } from "@/lib/supabase/server";
import ToggleBox from "@/components/toggle-box";
import UsStateDatalist from "@/components/us-state-datalist";
import { suggestCliniciansForCase } from "@/lib/coverage";
import { startConversation } from "../messages/actions";
import {
  createCoveragePlanAction,
  addCoveragePlanCaseAction,
  sendCoverageRequestAction,
  respondToCoverageRequestAction,
  createReferralRequestAction,
  respondToReferralRequestAction,
  establishProfessionalConnectionAction,
  closeReferralRequestAction,
} from "./actions";

// The new REQUESTS hub (Master Brief's primary nav: Home / Requests /
// Network / Consult / Messages) - Coverage and Referrals share one
// destination because both answer the same underlying question ("I need
// help with a case/gap - who can take this?"), just on different
// timelines. This is deliberately an MVP first pass: create a plan/case,
// see suggested clinicians, send/respond to requests. Plan-level detail
// pages, sequential auto-advance on decline, and the full Coverage Plan UX
// mockup (progress bars, "9 confirmed / 2 awaiting / 1 needs cover") are
// later Coverage-specific UI passes, not this navigation-shell batch.
//
// The OLD bulletin-board Referrals page (/dashboard/referrals) still
// works and is reachable from the Legacy nav group for now - it isn't
// touched here. This page is the new primary way in, built on the Phase 4
// referrals-v2 service layer (audience choice, the new lifecycle states).
// Referrals rebuild is scheduled to fully replace it and be removed at
// Phase 18, not before.

export default async function RequestsPage(props: { searchParams: Promise<{ tab?: string; error?: string }> }) {
  const { tab, error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [
    { data: specialisms },
    { data: myPlans },
    { data: myPlanCases },
    { data: incomingCoverageRequests },
    { data: myReferralRequests },
    { data: visibleReferralRequests },
    { data: myReferralResponses },
  ] = await Promise.all([
    supabase.from("lookup_values").select("id, value").eq("category", "treatment_specialism").order("value"),
    supabase.from("coverage_plans").select("*").eq("profile_id", myself).order("created_at", { ascending: false }),
    supabase
      .from("coverage_plan_cases")
      .select("*, coverage_plans!inner(profile_id, title)")
      .eq("coverage_plans.profile_id", myself)
      .order("created_at", { ascending: false }),
    supabase
      .from("coverage_requests")
      .select("*, coverage_plan_cases(case_reference, coverage_plans(title))")
      .eq("requested_profile_id", myself)
      .eq("status", "sent")
      .order("sent_at", { ascending: false }),
    supabase
      .from("referral_requests")
      .select("*, lookup_values(value), referral_responses(*, profiles:responding_profile_id(full_name))")
      .eq("requesting_profile_id", myself)
      .order("created_at", { ascending: false }),
    supabase
      .from("referral_requests")
      .select("*, lookup_values(value)")
      .neq("requesting_profile_id", myself)
      .in("status", ["open", "sent"])
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("referral_responses")
      .select("referral_request_id")
      .eq("responding_profile_id", myself),
  ]);

  const casesByPlanId = new Map<number, any[]>();
  for (const c of myPlanCases || []) {
    if (!casesByPlanId.has(c.coverage_plan_id)) casesByPlanId.set(c.coverage_plan_id, []);
    casesByPlanId.get(c.coverage_plan_id)!.push(c);
  }

  // Suggested clinicians for every one of my own cases still needing cover
  // - fine at today's volume; worth paginating once plans get large.
  const needsCoverCases = (myPlanCases || []).filter((c: any) => c.status === "needs_cover");
  const suggestionsByCaseId = new Map<number, Awaited<ReturnType<typeof suggestCliniciansForCase>>>();
  for (const c of needsCoverCases) {
    suggestionsByCaseId.set(c.id, await suggestCliniciansForCase(supabase, c.id));
  }

  const alreadyRespondedReferralIds = new Set((myReferralResponses || []).map((r: any) => r.referral_request_id));

  const CASE_STATUS_LABEL: Record<string, string> = {
    confirmed: "Confirmed",
    awaiting_response: "Awaiting response",
    needs_cover: "Needs cover",
    declined_all: "Declined by all",
  };
  // Master Brief #20's worked example: "12 cases / 9 Confirmed / 2 Awaiting
  // response / 1 Needs cover" - a plan-level rollup so Nick can see a plan's
  // overall state without opening every case row.
  function casePlanSummary(cases: any[]) {
    if (cases.length === 0) return null;
    const counts: Record<string, number> = { confirmed: 0, awaiting_response: 0, needs_cover: 0, declined_all: 0 };
    for (const c of cases) counts[c.status] = (counts[c.status] || 0) + 1;
    const parts = ["confirmed", "awaiting_response", "needs_cover", "declined_all"]
      .filter((status) => counts[status] > 0)
      .map((status) => `${counts[status]} ${CASE_STATUS_LABEL[status]}`);
    return `${cases.length} case${cases.length === 1 ? "" : "s"} · ${parts.join(" · ")}`;
  }

  const coverageTab = (
    <div>
      <div className="card">
        <h2>Start a coverage plan</h2>
        <p className="muted">
          Leave, reciprocal cover, or an ad-hoc gap - one plan holds every case that needs cover, with
          suggested clinicians per case (Trusted colleague, worked together before, relevant specialty).
        </p>
        <form action={createCoveragePlanAction}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" type="text" placeholder="Maternity leave" required />
            </div>
            <div className="field">
              <label htmlFor="plan_type">Type</label>
              <select id="plan_type" name="plan_type" defaultValue="ad_hoc">
                <option value="ad_hoc">Ad hoc</option>
                <option value="extended_leave">Extended leave</option>
                <option value="reciprocal">Reciprocal</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="starts_on">Starts</label>
              <input id="starts_on" name="starts_on" type="date" />
            </div>
            <div className="field">
              <label htmlFor="ends_on">Ends</label>
              <input id="ends_on" name="ends_on" type="date" />
            </div>
          </div>
          <button type="submit">Create plan</button>
        </form>
      </div>

      <div className="card">
        <h2>My coverage plans ({(myPlans || []).length})</h2>
        {(myPlans || []).map((plan: any) => {
          const cases = casesByPlanId.get(plan.id) || [];
          return (
            <div key={plan.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.9rem", marginBottom: "0.9rem" }}>
              <div>
                <strong>{plan.title}</strong> <span className="tag">{plan.plan_type.replace("_", " ")}</span>{" "}
                <span className="tag">{plan.status}</span>
                {(plan.starts_on || plan.ends_on) && (
                  <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                    {plan.starts_on || "?"} - {plan.ends_on || "?"}
                  </span>
                )}
              </div>
              {casePlanSummary(cases) && (
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>{casePlanSummary(cases)}</p>
              )}

              <div style={{ marginTop: "0.5rem" }}>
                {cases.map((c: any) => (
                  <div key={c.id} style={{ padding: "0.5rem 0", borderTop: "1px solid var(--border)" }}>
                    <div>
                      {c.case_reference} <span className="tag">{c.status.replace("_", " ")}</span>
                    </div>
                    {c.status === "needs_cover" && (
                      <div style={{ marginTop: "0.35rem" }}>
                        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>Suggested clinicians:</p>
                        {(suggestionsByCaseId.get(c.id) || []).slice(0, 5).map((s) => (
                          <div key={s.profileId} className="person-row">
                            <span className="person-row-info">
                              <a href={`/dashboard/people/${s.profileId}`} className="person-link">
                                {s.credentialPrefix ? `${s.credentialPrefix} ` : ""}
                                {s.fullName}
                              </a>
                              {s.reasons.map((r) => (
                                <span key={r.code} className="tag" style={{ marginLeft: "0.3rem" }}>{r.label}</span>
                              ))}
                            </span>
                            <span className="person-row-actions">
                              <a href={`/dashboard/people/${s.profileId}`} className="btn secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }}>
                                View profile
                              </a>
                              <form action={startConversation}>
                                <input type="hidden" name="participant_ids" value={s.profileId} />
                                <input type="hidden" name="title" value={`${s.credentialPrefix || ""} ${s.fullName}`.trim()} />
                                <input type="hidden" name="body" value={`Hi ${s.fullName}, `} />
                                <button type="submit" className="secondary">Message</button>
                              </form>
                              <form action={sendCoverageRequestAction}>
                                <input type="hidden" name="coverage_plan_case_id" value={c.id} />
                                <input type="hidden" name="requested_profile_id" value={s.profileId} />
                                <button type="submit" className="secondary">Request coverage</button>
                              </form>
                            </span>
                          </div>
                        ))}
                        {(suggestionsByCaseId.get(c.id) || []).length === 0 && (
                          <p className="muted">No eligible colleagues found yet for this case.</p>
                        )}
                      </div>
                    )}
                    {c.status === "confirmed" && c.assigned_clinician_id && (
                      <p className="muted" style={{ fontSize: "0.85rem" }}>
                        Confirmed: <a href={`/dashboard/people/${c.assigned_clinician_id}`}>view clinician</a>
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <details style={{ marginTop: "0.5rem" }}>
                <summary className="muted" style={{ cursor: "pointer", fontSize: "0.85rem" }}>Add a case</summary>
                <form action={addCoveragePlanCaseAction} style={{ marginTop: "0.5rem" }}>
                  <input type="hidden" name="coverage_plan_id" value={plan.id} />
                  <div className="field-row">
                    <div className="field">
                      <label>Private reference</label>
                      <input name="case_reference" type="text" placeholder="Tuesday 4pm, adult anxiety" required />
                    </div>
                    <div className="field">
                      <label>Specialism</label>
                      <select name="specialism_lookup_id">
                        <option value="">-</option>
                        {(specialisms || []).map((s) => (
                          <option key={s.id} value={s.id}>{s.value}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Age band</label>
                      <input name="age_band" type="text" placeholder="Adult" />
                    </div>
                    <div className="field">
                      <label>Frequency</label>
                      <input name="frequency" type="text" placeholder="Weekly" />
                    </div>
                  </div>
                  <button type="submit" className="secondary">Add case</button>
                </form>
              </details>
            </div>
          );
        })}
        {(myPlans || []).length === 0 && <p className="muted">No coverage plans yet.</p>}
      </div>

      <div className="card">
        <h2>Coverage requests sent to me ({(incomingCoverageRequests || []).length})</h2>
        {(incomingCoverageRequests || []).map((r: any) => (
          <div key={r.id} className="person-row">
            <span className="person-row-info">
              <strong>{r.coverage_plan_cases?.coverage_plans?.title}</strong> - {r.coverage_plan_cases?.case_reference}
            </span>
            <span className="person-row-actions">
              <form action={respondToCoverageRequestAction}>
                <input type="hidden" name="coverage_request_id" value={r.id} />
                <input type="hidden" name="response" value="accepted" />
                <button type="submit">I can help</button>
              </form>
              <form action={respondToCoverageRequestAction}>
                <input type="hidden" name="coverage_request_id" value={r.id} />
                <input type="hidden" name="response" value="declined" />
                <button type="submit" className="secondary">Can't help</button>
              </form>
              <form action={respondToCoverageRequestAction}>
                <input type="hidden" name="coverage_request_id" value={r.id} />
                <input type="hidden" name="response" value="discussing" />
                <button type="submit" className="secondary">Discuss first</button>
              </form>
            </span>
          </div>
        ))}
        {(incomingCoverageRequests || []).length === 0 && <p className="muted">No coverage requests waiting on you.</p>}
      </div>
    </div>
  );

  const referralsTab = (
    <div>
      <div className="card">
        <h2>Post a referral need</h2>
        <form action={createReferralRequestAction}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="ref_specialism">Specialism needed</label>
              <select id="ref_specialism" name="specialism_lookup_id">
                <option value="">-</option>
                {(specialisms || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.value}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ref_city">City</label>
              <input id="ref_city" name="city" type="text" placeholder="Austin" />
            </div>
            <div className="field">
              <label htmlFor="ref_state">State</label>
              <input id="ref_state" name="state" type="text" maxLength={24} list="us-states-requests" autoComplete="off" />
              <UsStateDatalist id="us-states-requests" />
            </div>
            <div className="field">
              <label htmlFor="ref_audience">Who should see this?</label>
              <select id="ref_audience" name="audience_type" defaultValue="wider_network">
                <option value="wider_network">Verified network</option>
                <option value="trusted">Trusted colleagues only</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ref_notes">Notes (no patient names or identifying details)</label>
            <textarea id="ref_notes" name="notes" rows={2} />
          </div>
          <button type="submit">Post request</button>
        </form>
      </div>

      <div className="card">
        <h2>My requests</h2>
        {(myReferralRequests || []).map((r: any) => (
          <div key={r.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <strong>{r.lookup_values?.value || "Any specialism"}</strong>
              {r.state ? ` - ${r.state}` : ""} <span className="tag">{r.status}</span>{" "}
              <span className="tag">{r.audience_type.replace("_", " ")}</span>
            </div>
            {(r.referral_responses || []).length > 0 && (
              <div style={{ marginTop: "0.35rem" }}>
                {r.referral_responses.map((resp: any) => (
                  <div key={resp.id} className="person-row">
                    <span className="person-row-info">
                      {resp.profiles?.full_name} - <span className="tag">{resp.status}</span>
                    </span>
                    {resp.status === "interested" && r.status !== "connected" && (
                      <span className="person-row-actions">
                        <form action={establishProfessionalConnectionAction}>
                          <input type="hidden" name="referral_request_id" value={r.id} />
                          <input type="hidden" name="responding_profile_id" value={resp.responding_profile_id} />
                          <button type="submit">Connect</button>
                        </form>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!["closed", "connected", "handoff"].includes(r.status) && (
              <form action={closeReferralRequestAction} style={{ marginTop: "0.35rem" }}>
                <input type="hidden" name="referral_request_id" value={r.id} />
                <button type="submit" className="secondary">Close</button>
              </form>
            )}
          </div>
        ))}
        {(myReferralRequests || []).length === 0 && <p className="muted">You haven't posted any requests.</p>}
      </div>

      <div className="card">
        <h2>Open requests from colleagues</h2>
        {(visibleReferralRequests || []).map((r: any) => (
          <div key={r.id} className="person-row">
            <span className="person-row-info">
              <strong>{r.lookup_values?.value || "Any specialism"}</strong>
              {r.state ? ` - ${r.state}` : ""}
              {r.notes ? `, ${r.notes}` : ""}
            </span>
            {alreadyRespondedReferralIds.has(r.id) ? (
              <span className="muted">responded</span>
            ) : (
              <span className="person-row-actions">
                <form action={respondToReferralRequestAction}>
                  <input type="hidden" name="referral_request_id" value={r.id} />
                  <input type="hidden" name="response" value="interested" />
                  <button type="submit">Interested</button>
                </form>
                <form action={respondToReferralRequestAction}>
                  <input type="hidden" name="referral_request_id" value={r.id} />
                  <input type="hidden" name="response" value="unavailable" />
                  <button type="submit" className="secondary">Can't help</button>
                </form>
              </span>
            )}
          </div>
        ))}
        {(visibleReferralRequests || []).length === 0 && <p className="muted">No open requests right now.</p>}
      </div>
    </div>
  );

  return (
    <div>
      <h1>Requests</h1>
      <p className="muted">Coverage and referrals - anywhere you need another clinician's help, or someone needs yours.</p>
      {error && <div className="error-banner">{error}</div>}
      <ToggleBox
        defaultTab={tab === "referrals" ? "referrals" : "coverage"}
        tabs={[
          { key: "coverage", label: "Coverage", content: coverageTab },
          { key: "referrals", label: "Referrals", content: referralsTab },
        ]}
      />
    </div>
  );
}
