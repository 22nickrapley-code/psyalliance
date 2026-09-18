import { createClient } from "@/lib/supabase/server";
import { computeRankedCandidates } from "@/lib/server-matching";

export default async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .maybeSingle();

  const { count: caseCount } = await supabase
    .from("caseload_clients")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user!.id)
    .eq("is_active", true);

  const { count: docCount } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user!.id);

  const { count: pendingConnectionCount } = await supabase
    .from("connections")
    .select("id", { count: "exact", head: true })
    .eq("addressee_id", user!.id)
    .eq("status", "pending");

  const { data: myOpenRequests } = await supabase
    .from("referral_requests")
    .select("id, referral_responses(status)")
    .eq("requesting_profile_id", user!.id)
    .eq("status", "open");

  const offersAwaitingDecision = (myOpenRequests || []).reduce(
    (sum, r: any) => sum + (r.referral_responses || []).filter((resp: any) => resp.status === "offered").length,
    0
  );

  const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { count: expiringLicenseCount } = await supabase
    .from("licenses")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user!.id)
    .lte("expiration_date", sixtyDaysFromNow)
    .not("expiration_date", "is", null);

  const { count: expiringPanelCount } = await supabase
    .from("insurance_panels")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user!.id)
    .lte("renewal_date", sixtyDaysFromNow)
    .not("renewal_date", "is", null);

  const { count: plannerOfferCount } = await supabase
    .from("planner_offers")
    .select("id", { count: "exact", head: true })
    .eq("candidate_profile_id", user!.id)
    .eq("status", "offered");

  const { data: myConversationRows } = await supabase
    .from("conversation_participants")
    .select("last_read_at, conversation:conversation_id(last_message_at)")
    .eq("profile_id", user!.id);
  const unreadMessageCount = (myConversationRows || []).filter((r: any) => {
    if (!r.conversation) return false;
    return new Date(r.conversation.last_message_at) > new Date(r.last_read_at);
  }).length;

  // "My Caseload Distribution" + "Recommended Caseload Matches" from the
  // original Dashboard.txt mockup - a snapshot of your most recent active
  // cases with the top-ranked colleague match for each one's primary need,
  // right on the Overview page rather than requiring a trip to Referrals.
  const { data: recentCases } = await supabase
    .from("caseload_clients")
    .select("id, city, state, session_type, insurance, primary_need, secondary_need, tertiary_need")
    .eq("profile_id", user!.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5);

  const caseloadSnapshot = await Promise.all(
    (recentCases || []).map(async (c) => {
      let topMatch: string | null = null;
      let topMatchPsypact = false;
      if (c.primary_need) {
        const ranked = await computeRankedCandidates(supabase, user!.id, {
          specialismValue: c.primary_need,
          city: c.city,
          state: c.state,
          sessionType: c.session_type,
        });
        topMatch = ranked[0]?.fullName || null;
        topMatchPsypact = ranked[0]?.psypactParticipating ?? false;
      }
      return { ...c, topMatch, topMatchPsypact };
    })
  );

  const hasAttentionItems =
    (pendingConnectionCount ?? 0) > 0 ||
    offersAwaitingDecision > 0 ||
    (expiringLicenseCount ?? 0) > 0 ||
    (expiringPanelCount ?? 0) > 0 ||
    (plannerOfferCount ?? 0) > 0 ||
    unreadMessageCount > 0;

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
          {(expiringLicenseCount ?? 0) > 0 && (
            <p>
              <a href="/dashboard/credentials">
                {expiringLicenseCount} license{expiringLicenseCount === 1 ? "" : "s"}
              </a>{" "}
              expiring within 60 days.
            </p>
          )}
          {(expiringPanelCount ?? 0) > 0 && (
            <p>
              <a href="/dashboard/credentials">
                {expiringPanelCount} insurance panel{expiringPanelCount === 1 ? "" : "s"}
              </a>{" "}
              up for renewal within 60 days.
            </p>
          )}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{caseCount ?? 0}</div>
          <div className="label">Active cases</div>
        </div>
        <div className="stat">
          <div className="value">{docCount ?? 0}</div>
          <div className="label">Documents on file</div>
        </div>
        <div className="stat">
          <div className="value">{profile?.verification_status ?? "—"}</div>
          <div className="label">Credential status</div>
        </div>
        <div className="stat">
          <div className="value">{profile?.accepting_referrals ? "Yes" : "No"}</div>
          <div className="label">Accepting referrals</div>
        </div>
      </div>

      {caseloadSnapshot.length > 0 && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h2>My caseload</h2>
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>State</th>
                <th>Session type</th>
                <th>Insurance</th>
                <th>Primary need</th>
                <th>Recommended match</th>
              </tr>
            </thead>
            <tbody>
              {caseloadSnapshot.map((c) => (
                <tr key={c.id}>
                  <td>Case #{c.id}</td>
                  <td>{c.state || "—"}</td>
                  <td>{c.session_type || "—"}</td>
                  <td>{c.insurance || "—"}</td>
                  <td>{c.primary_need || "—"}</td>
                  <td>
                    {c.topMatch ? (
                      <>
                        <span className="tag">{c.topMatch}</span>
                        {c.topMatchPsypact && (
                          <span className="tag" style={{ marginLeft: "0.3rem" }} title="Holds PSYPACT Authority to Practice Interjurisdictional Telepsychology">
                            PSYPACT
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            <a href="/dashboard/caseload">Manage full caseload</a> · <a href="/dashboard/referrals">post a referral request</a>
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Quick links</h2>
        <p>
          <a href="/dashboard/caseload">Manage your caseload</a> · track active clients by case
          number, rate, and session frequency.
        </p>
        <p>
          <a href="/dashboard/income">Income &amp; revenue</a> · see projected monthly gross and
          net across your books of business.
        </p>
        <p>
          <a href="/dashboard/capacity">Capacity &amp; overhead</a> · set weekly targets and track
          recurring practice expenses.
        </p>
        <p>
          <a href="/dashboard/documents">Documents</a> · store personal files or share into the
          shared practice library.
        </p>
        <p>
          <a href="/dashboard/credentials">Credentials &amp; compliance</a> · track licenses,
          continuing education, and insurance panels with expiration reminders.
        </p>
        <p>
          <a href="/dashboard/messages">Messages</a> · private, threaded conversations with your
          verified colleagues.
        </p>
        <p>
          <a href="/dashboard/town-hall">Town Hall</a> · join the open community discussion,
          organized by specialism.
        </p>
        <p>
          <a href="/dashboard/planner">Planner</a> · going on leave? Get your caseload covered
          automatically, ranked by fit.
        </p>
        <p>
          <a href="/dashboard/supervision">Supervision</a> · find a colleague offering private
          supervision, or offer yours to someone looking.
        </p>
      </div>
    </div>
  );
}
