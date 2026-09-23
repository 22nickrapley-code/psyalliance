import { createClient } from "@/lib/supabase/server";
import ToggleBox from "@/components/toggle-box";
import UsStateDatalist from "@/components/us-state-datalist";
import ReferralAudienceField from "@/components/referral-audience-field";
import { suggestCliniciansForCase } from "@/lib/coverage";
import { suggestCliniciansForReferral } from "@/lib/referrals-v2";
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
  addReferralAudienceProfilesAction,
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
    { data: languages },
    { data: sessionTypes },
    { data: modalities },
    { data: insuranceNames },
    { count: trustedColleagueCount },
    { count: verifiedNetworkCount },
    { data: myPlans },
    { data: myPlanCases },
    { data: incomingCoverageRequests },
    { data: myCoverageRequestHistory },
    { data: myReferralRequests },
    { data: visibleReferralRequests },
    { data: myReferralResponses },
  ] = await Promise.all([
    supabase.from("lookup_values").select("id, value").eq("category", "treatment_specialism").order("value"),
    // Structured Referrals criteria (Sept 23 audit) - all reuse taxonomies
    // that already exist for profile self-disclosure/matching rather than
    // inventing new ones (see src/lib/server-matching.ts for the same
    // session_type usage).
    supabase.from("lookup_values").select("id, value").eq("category", "language").order("value"),
    supabase.from("lookup_values").select("id, value").eq("category", "session_type").order("value"),
    supabase.from("lookup_values").select("id, value").eq("category", "treatment_modality").order("value"),
    supabase.from("lookup_values").select("id, value").eq("category", "insurance").order("value"),
    // Audience-size preview for the "review recipients before send" gate
    // (ReferralAudienceField) - how many people "Trusted colleagues only"
    // and "Verified network" would actually reach.
    supabase
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("status", "accepted")
      .eq("tier", "trusted_colleague")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`),
    supabase.from("public_directory").select("id", { count: "exact", head: true }),
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
    // Task #132 (Sept 23 audit): outreach history for MY OWN cases - who
    // I've already asked and how they responded. Never queried before, so
    // the owner had no visibility into their own past requests per case,
    // and suggestions could re-offer someone who'd already declined.
    // Filtered via the FK chain (case -> plan -> profile_id) rather than an
    // id list, since myPlanCases isn't available yet inside this same
    // Promise.all - same pattern as the coverage_plan_cases query above.
    supabase
      .from("coverage_requests")
      .select(
        "coverage_plan_case_id, requested_profile_id, status, sent_at, requested:requested_profile_id(full_name, credential_prefix), coverage_plan_cases!inner(coverage_plans!inner(profile_id))"
      )
      .eq("coverage_plan_cases.coverage_plans.profile_id", myself)
      .order("sent_at", { ascending: false }),
    supabase
      .from("referral_requests")
      .select(
        "*, lookup_values(value), language:lookup_values!referral_requests_language_lookup_id_fkey(value), session_type:lookup_values!referral_requests_session_type_lookup_id_fkey(value), referral_responses(*, profiles:responding_profile_id(full_name))"
      )
      .eq("requesting_profile_id", myself)
      .order("created_at", { ascending: false }),
    supabase
      .from("referral_requests")
      .select(
        "*, lookup_values(value), language:lookup_values!referral_requests_language_lookup_id_fkey(value), session_type:lookup_values!referral_requests_session_type_lookup_id_fkey(value)"
      )
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

  // Task #132 (Sept 23 audit): who's already been asked for each of my own
  // cases, and how they responded - feeds both the exclusion list below
  // (don't re-suggest someone who already declined) and the "Already
  // asked" history shown under each case.
  const requestHistoryByCaseId = new Map<number, any[]>();
  for (const r of myCoverageRequestHistory || []) {
    const list = requestHistoryByCaseId.get(r.coverage_plan_case_id) || [];
    list.push(r);
    requestHistoryByCaseId.set(r.coverage_plan_case_id, list);
  }

  // Suggested clinicians for every one of my own cases still needing cover
  // - fine at today's volume; worth paginating once plans get large.
  // declined_all is included too so a fully-exhausted case can confirm
  // (rather than just claim) that nobody eligible is left.
  const needsCoverCases = (myPlanCases || []).filter((c: any) => c.status === "needs_cover" || c.status === "declined_all");
  const suggestionsByCaseId = new Map<number, Awaited<ReturnType<typeof suggestCliniciansForCase>>>();
  for (const c of needsCoverCases) {
    const askedIds = (requestHistoryByCaseId.get(c.id) || []).map((r: any) => r.requested_profile_id);
    suggestionsByCaseId.set(c.id, await suggestCliniciansForCase(supabase, c.id, askedIds));
  }

  const alreadyRespondedReferralIds = new Set((myReferralResponses || []).map((r: any) => r.referral_request_id));

  // Master Brief #24's "Matches found" step - only meaningful while a
  // request is still active, same reasoning as needsCoverCases above.
  const openReferralRequests = (myReferralRequests || []).filter(
    (r: any) => !["closed", "connected", "handoff"].includes(r.status)
  );
  const referralSuggestionsByRequestId = new Map<number, Awaited<ReturnType<typeof suggestCliniciansForReferral>>>();
  for (const r of openReferralRequests) {
    referralSuggestionsByRequestId.set(r.id, await suggestCliniciansForReferral(supabase, r.id));
  }

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

  const TIMEFRAME_LABEL: Record<string, string> = {
    urgent: "Urgent (this week)",
    within_month: "Within a month",
    flexible: "Flexible",
  };
  // Sept 23 audit: renders the structured criteria (age band, modality,
  // insurance, language, session type, timeframe) that used to only exist
  // in free-text notes, as tags on both "My requests" and "Open requests
  // from colleagues" - so a criterion filled in during posting is actually
  // visible to whoever's deciding whether to respond.
  function referralCriteriaTags(r: any) {
    const tags: string[] = [];
    if (r.age_band) tags.push(r.age_band);
    if (r.modality) tags.push(r.modality);
    if (r.insurance) tags.push(r.insurance);
    if (r.language?.value) tags.push(r.language.value);
    if (r.session_type?.value) tags.push(r.session_type.value);
    if (r.timeframe && TIMEFRAME_LABEL[r.timeframe]) tags.push(TIMEFRAME_LABEL[r.timeframe]);
    if (tags.length === 0) return null;
    return (
      <>
        {tags.map((t) => (
          <span key={t} className="tag" style={{ marginLeft: "0.3rem" }}>{t}</span>
        ))}
      </>
    );
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
                {cases.map((c: any) => {
                  const history = requestHistoryByCaseId.get(c.id) || [];
                  return (
                  <div key={c.id} style={{ padding: "0.5rem 0", borderTop: "1px solid var(--border)" }}>
                    <div>
                      {c.case_reference} <span className="tag">{c.status.replace("_", " ")}</span>
                    </div>
                    {history.length > 0 && (
                      // Task #132: visibility into a case's own outreach history
                      // didn't exist anywhere before - the owner had no way to
                      // see who they'd already asked, or that a decline was
                      // even final rather than just silently stuck.
                      <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>
                        Already asked: {history.map((r: any, i: number) => (
                          <span key={r.requested_profile_id + r.sent_at}>
                            {i > 0 ? ", " : ""}
                            {r.requested?.credential_prefix ? `${r.requested.credential_prefix} ` : ""}
                            {r.requested?.full_name || "someone"} ({r.status === "sent" ? "awaiting response" : r.status})
                          </span>
                        ))}
                      </p>
                    )}
                    {c.status === "declined_all" && (
                      <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>
                        Everyone eligible has declined. Add a Trusted Colleague or Bench connection, or broaden the
                        case's specialty/state, then check back here - the suggested list recomputes automatically.
                      </p>
                    )}
                    {(c.status === "needs_cover" || c.status === "declined_all") && (suggestionsByCaseId.get(c.id) || []).length > 0 && (
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
                      </div>
                    )}
                    {c.status === "needs_cover" && (suggestionsByCaseId.get(c.id) || []).length === 0 && (
                      <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>No eligible colleagues found yet for this case.</p>
                    )}
                    {c.status === "confirmed" && c.assigned_clinician_id && (
                      <p className="muted" style={{ fontSize: "0.85rem" }}>
                        Confirmed: <a href={`/dashboard/people/${c.assigned_clinician_id}`}>view clinician</a>
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>

              <details style={{ marginTop: "0.5rem" }}>
                <summary className="muted" style={{ cursor: "pointer", fontSize: "0.85rem" }}>Add a case</summary>
                <form action={addCoveragePlanCaseAction} style={{ marginTop: "0.5rem" }}>
                  <input type="hidden" name="coverage_plan_id" value={plan.id} />
                  <div className="field-row">
                    <div className="field">
                      <label>Private reference (no patient name)</label>
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
              <label htmlFor="ref_age_band">Age band</label>
              <input id="ref_age_band" name="age_band" type="text" placeholder="Adult" />
            </div>
          </div>
          {/* Sept 23 audit: insurance/age band/modality were already read by
              createReferralRequestAction and stored, but this form never
              rendered inputs for them, so every request pushed that context
              into free-text notes instead. Language, session type, and
              timeframe are new columns added for the same reason (see
              migration 0057) - language and session type reuse the
              lookup_values taxonomies already used for profile
              self-disclosure/matching rather than inventing new ones. */}
          <div className="field-row">
            <div className="field">
              <label htmlFor="ref_insurance">Insurance</label>
              <input id="ref_insurance" name="insurance" type="text" placeholder="e.g. Aetna" list="insurance-names-requests" autoComplete="off" />
              <datalist id="insurance-names-requests">
                {(insuranceNames || []).map((i) => (
                  <option key={i.id} value={i.value} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="ref_modality">Modality</label>
              <select id="ref_modality" name="modality" defaultValue="">
                <option value="">Any</option>
                {(modalities || []).map((m) => (
                  <option key={m.id} value={m.value}>{m.value}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ref_language">Language needed</label>
              <select id="ref_language" name="language_lookup_id" defaultValue="">
                <option value="">Any</option>
                {(languages || []).map((l) => (
                  <option key={l.id} value={l.id}>{l.value}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ref_session_type">Session type</label>
              <select id="ref_session_type" name="session_type_lookup_id" defaultValue="">
                <option value="">Any</option>
                {(sessionTypes || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.value}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ref_timeframe">How soon?</label>
              <select id="ref_timeframe" name="timeframe" defaultValue="">
                <option value="">Not specified</option>
                <option value="urgent">Urgent (this week)</option>
                <option value="within_month">Within a month</option>
                <option value="flexible">Flexible</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <ReferralAudienceField
              trustedCount={trustedColleagueCount || 0}
              networkCount={Math.max(0, (verifiedNetworkCount || 0) - 1)}
            />
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
              {referralCriteriaTags(r)}
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
              <>
                {(referralSuggestionsByRequestId.get(r.id) || []).length > 0 && (() => {
                  const suggestions = referralSuggestionsByRequestId.get(r.id) || [];
                  const isSelected = r.audience_type === "selected";
                  const sentIds: string[] = r.audience_profile_ids || [];
                  const unsentCount = isSelected ? suggestions.filter((s) => !sentIds.includes(s.profileId)).length : 0;
                  const formId = `send-selected-${r.id}`;
                  return (
                    <div style={{ marginTop: "0.5rem" }}>
                      <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                        Matches found:
                        {isSelected && " check who should receive this referral, then send."}
                      </p>
                      {isSelected && (
                        <form id={formId} action={addReferralAudienceProfilesAction}>
                          <input type="hidden" name="referral_request_id" value={r.id} />
                        </form>
                      )}
                      {suggestions.map((s) => {
                        const alreadySent = isSelected && sentIds.includes(s.profileId);
                        return (
                          <div key={s.profileId} className="person-row">
                            <span className="person-row-info">
                              {isSelected && !alreadySent && (
                                <input
                                  type="checkbox"
                                  name="profile_ids"
                                  value={s.profileId}
                                  form={formId}
                                  style={{ marginRight: "0.4rem" }}
                                />
                              )}
                              <a href={`/dashboard/people/${s.profileId}`} className="person-link">
                                {s.credentialPrefix ? `${s.credentialPrefix} ` : ""}
                                {s.fullName}
                              </a>
                              {alreadySent && <span className="tag" style={{ marginLeft: "0.3rem" }}>Sent</span>}
                              {s.reasons.map((reason) => (
                                <span key={reason.code} className="tag" style={{ marginLeft: "0.3rem" }}>{reason.label}</span>
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
                            </span>
                          </div>
                        );
                      })}
                      {isSelected && unsentCount > 0 && (
                        <button type="submit" form={formId} className="secondary" style={{ marginTop: "0.4rem" }}>
                          Send referral to checked clinicians
                        </button>
                      )}
                    </div>
                  );
                })()}
                <form action={closeReferralRequestAction} style={{ marginTop: "0.35rem" }}>
                  <input type="hidden" name="referral_request_id" value={r.id} />
                  <button type="submit" className="secondary">Close</button>
                </form>
              </>
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
              {referralCriteriaTags(r)}
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
