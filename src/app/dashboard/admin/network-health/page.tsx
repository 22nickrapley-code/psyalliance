import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";

// PsyA2 #98/#102: the admin console "must exist from launch" and must
// include a Network-health dashboard - explicitly "important operationally
// ... the point is to manage liquidity, not vanity registrations." Every
// number below is a straight aggregation of data the rebuild already
// writes (profiles, referral_requests/responses, coverage_requests,
// profile_lookup_values) - no new schema, read-only.
//
// A few #102 line items aren't computed here and are labeled as such
// rather than faked: "invite conversion" (there's no cold-start invite
// tracking table yet - see the progress doc's Network cold-start note)
// and true growth-over-time for Northeast/Texas density (no historical
// snapshot table - this shows current counts, not a trend).
//
// NORTHEAST is #103's initial active acquisition cluster; TEXAS is called
// out separately as the founder-led organic market (#103).
const NORTHEAST_STATES = ["NY", "NJ", "CT", "RI", "MA", "VT"];

function pct(n: number, d: number): string {
  if (d === 0) return "-";
  return `${Math.round((n / d) * 100)}%`;
}

function avgHours(diffsMs: number[]): string {
  if (diffsMs.length === 0) return "-";
  const avgMs = diffsMs.reduce((a, b) => a + b, 0) / diffsMs.length;
  const hours = avgMs / (1000 * 60 * 60);
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default async function NetworkHealthPage() {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);

  const [
    { data: verifiedProfiles },
    { data: referralRequests },
    { data: referralResponses },
    { data: coverageCases },
    { data: coverageRequests },
    { data: specialismTags },
    { data: specialisms },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, primary_state, qualification_level, referral_availability, coverage_availability")
      .eq("verification_status", "verified"),
    supabase.from("referral_requests").select("id, created_at, specialism_lookup_id, status"),
    supabase.from("referral_responses").select("referral_request_id, created_at"),
    supabase.from("coverage_plan_cases").select("id, created_at, specialism_lookup_ids, status"),
    supabase.from("coverage_requests").select("id, coverage_plan_case_id, sent_at, responded_at, status"),
    supabase.from("profile_lookup_values").select("profile_id, lookup_value_id"),
    supabase.from("lookup_values").select("id, value").eq("category", "treatment_specialism"),
  ]);

  const verified = verifiedProfiles || [];
  const specialismLabel = new Map((specialisms || []).map((s: any) => [s.id, s.value as string]));

  // --- Members by state / profession -------------------------------------
  const byState = new Map<string, number>();
  const byProfession = new Map<string, number>();
  let referralYes = 0, referralLimited = 0, referralNo = 0;
  let coverageYes = 0, coverageAsk = 0, coverageNo = 0;
  for (const p of verified as any[]) {
    const s = p.primary_state || "Unknown";
    byState.set(s, (byState.get(s) || 0) + 1);
    const q = p.qualification_level || "Unspecified";
    byProfession.set(q, (byProfession.get(q) || 0) + 1);
    if (p.referral_availability === "yes") referralYes++;
    else if (p.referral_availability === "limited") referralLimited++;
    else if (p.referral_availability === "no") referralNo++;
    if (p.coverage_availability === "yes") coverageYes++;
    else if (p.coverage_availability === "ask_me") coverageAsk++;
    else if (p.coverage_availability === "no") coverageNo++;
  }
  const topStates = Array.from(byState.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topProfessions = Array.from(byProfession.entries()).sort((a, b) => b[1] - a[1]);

  const northeastCount = verified.filter((p: any) => NORTHEAST_STATES.includes(p.primary_state)).length;
  const texasCount = verified.filter((p: any) => p.primary_state === "TX").length;

  // --- Referrals: response rate, zero-match rate, avg time to first response
  const responsesByRequestId = new Map<number, any[]>();
  for (const r of referralResponses || []) {
    const arr = responsesByRequestId.get(r.referral_request_id) || [];
    arr.push(r);
    responsesByRequestId.set(r.referral_request_id, arr);
  }
  const totalReferralRequests = (referralRequests || []).length;
  const referralsWithResponse = (referralRequests || []).filter((r: any) => (responsesByRequestId.get(r.id) || []).length > 0);
  const referralResponseRate = pct(referralsWithResponse.length, totalReferralRequests);
  const referralZeroMatchRate = pct(totalReferralRequests - referralsWithResponse.length, totalReferralRequests);
  const referralFirstResponseDeltas: number[] = referralsWithResponse.map((r: any) => {
    const firstResp = (responsesByRequestId.get(r.id) || []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
    return new Date(firstResp.created_at).getTime() - new Date(r.created_at).getTime();
  });
  const referralAvgResponseTime = avgHours(referralFirstResponseDeltas);

  // --- Coverage: response rate, zero-match rate, avg time to response ----
  const totalCoverageRequests = (coverageRequests || []).length;
  const respondedCoverageRequests = (coverageRequests || []).filter((r: any) => r.responded_at);
  const coverageResponseRate = pct(respondedCoverageRequests.length, totalCoverageRequests);
  const coverageAvgResponseTime = avgHours(
    respondedCoverageRequests.map((r: any) => new Date(r.responded_at).getTime() - new Date(r.sent_at).getTime())
  );
  const casesWithAnyRequest = new Set((coverageRequests || []).map((r: any) => r.coverage_plan_case_id));
  const totalCoverageCases = (coverageCases || []).length;
  const casesNeverSent = (coverageCases || []).filter((c: any) => !casesWithAnyRequest.has(c.id)).length;
  const coverageZeroMatchRate = pct(casesNeverSent, totalCoverageCases);

  // --- High-demand specialties + supply gaps ------------------------------
  const demandBySpecialty = new Map<number, number>();
  for (const r of referralRequests || []) {
    if (r.specialism_lookup_id) demandBySpecialty.set(r.specialism_lookup_id, (demandBySpecialty.get(r.specialism_lookup_id) || 0) + 1);
  }
  for (const c of coverageCases || []) {
    for (const sid of (c as any).specialism_lookup_ids || []) {
      demandBySpecialty.set(sid, (demandBySpecialty.get(sid) || 0) + 1);
    }
  }
  const verifiedAvailableIds = new Set(
    verified.filter((p: any) => p.referral_availability !== "no" || p.coverage_availability !== "no").map((p: any) => p.id)
  );
  const supplyBySpecialty = new Map<number, number>();
  for (const t of specialismTags || []) {
    if (verifiedAvailableIds.has((t as any).profile_id)) {
      supplyBySpecialty.set((t as any).lookup_value_id, (supplyBySpecialty.get((t as any).lookup_value_id) || 0) + 1);
    }
  }
  const specialtyRows = Array.from(demandBySpecialty.entries())
    .map(([id, demand]) => ({
      id,
      label: specialismLabel.get(id) || `#${id}`,
      demand,
      supply: supplyBySpecialty.get(id) || 0,
    }))
    .sort((a, b) => b.demand - a.demand)
    .slice(0, 12);

  return (
    <div>
      <h1>Network health</h1>
      <p className="muted">
        Liquidity, not vanity registrations (PsyA2 #102) - how many verified members are actually
        available, how fast requests get answered, and where supply doesn&apos;t meet demand.
      </p>

      <div className="card">
        <h2>Members</h2>
        <div className="stat-grid">
          <div className="stat">
            <div className="value">{verified.length}</div>
            <div className="label">Verified members</div>
          </div>
          <div className="stat">
            <div className="value">{northeastCount}</div>
            <div className="label">Northeast (NY/NJ/CT/RI/MA/VT)</div>
          </div>
          <div className="stat">
            <div className="value">{texasCount}</div>
            <div className="label">Texas</div>
          </div>
        </div>
        <div className="field-row" style={{ marginTop: "1rem", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>By state (top 10)</p>
            {topStates.map(([state, count]) => (
              <div key={state} className="person-row">
                <span className="person-row-info">{state}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>By profession</p>
            {topProfessions.map(([q, count]) => (
              <div key={q} className="person-row">
                <span className="person-row-info">{q}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Availability signals</h2>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Self-reported tri-states from Availability, among verified members.
        </p>
        <div className="field-row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>Referral availability</p>
            <div className="person-row"><span className="person-row-info">Yes</span><span>{referralYes}</span></div>
            <div className="person-row"><span className="person-row-info">Limited</span><span>{referralLimited}</span></div>
            <div className="person-row"><span className="person-row-info">No</span><span>{referralNo}</span></div>
          </div>
          <div style={{ flex: 1 }}>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>Coverage availability</p>
            <div className="person-row"><span className="person-row-info">Yes</span><span>{coverageYes}</span></div>
            <div className="person-row"><span className="person-row-info">Ask me</span><span>{coverageAsk}</span></div>
            <div className="person-row"><span className="person-row-info">No</span><span>{coverageNo}</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Referrals</h2>
        <div className="stat-grid">
          <div className="stat">
            <div className="value">{totalReferralRequests}</div>
            <div className="label">Total requests</div>
          </div>
          <div className="stat">
            <div className="value">{referralResponseRate}</div>
            <div className="label">Got at least one response</div>
          </div>
          <div className="stat">
            <div className="value">{referralZeroMatchRate}</div>
            <div className="label">Zero-match rate (no response at all)</div>
          </div>
          <div className="stat">
            <div className="value">{referralAvgResponseTime}</div>
            <div className="label">Avg time to first response</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Coverage</h2>
        <div className="stat-grid">
          <div className="stat">
            <div className="value">{totalCoverageCases}</div>
            <div className="label">Total cases</div>
          </div>
          <div className="stat">
            <div className="value">{totalCoverageRequests}</div>
            <div className="label">Requests sent</div>
          </div>
          <div className="stat">
            <div className="value">{coverageResponseRate}</div>
            <div className="label">Requests responded to</div>
          </div>
          <div className="stat">
            <div className="value">{coverageZeroMatchRate}</div>
            <div className="label">Cases never sent to anyone</div>
          </div>
          <div className="stat">
            <div className="value">{coverageAvgResponseTime}</div>
            <div className="label">Avg time to response</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>High-demand specialties &amp; supply gaps</h2>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Demand = referral requests + coverage cases naming this specialty. Supply = verified members
          with this specialty who haven&apos;t turned off referral and coverage availability entirely.
          A gap (demand higher than supply) is where the network is thin.
        </p>
        {specialtyRows.length === 0 && <p className="muted">Not enough requests yet to show a pattern.</p>}
        {specialtyRows.map((row) => (
          <div key={row.id} className="person-row">
            <span className="person-row-info">
              {row.label}
              {row.demand > row.supply && <span className="tag" style={{ marginLeft: "0.4rem" }}>Supply gap</span>}
            </span>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {row.demand} demand / {row.supply} supply
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Not yet tracked</h2>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Two #102 line items aren&apos;t shown above because there&apos;s nothing to compute them from yet,
          rather than showing a made-up number: invite conversion (no cold-start invite tracking exists -
          see the progress doc), and Northeast/Texas density as a trend over time (no historical snapshot
          table - the counts above are current, not a growth curve).
        </p>
      </div>
    </div>
  );
}
