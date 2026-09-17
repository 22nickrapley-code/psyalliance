import { createClient } from "@/lib/supabase/server";

export default async function DashboardHome() {
  const supabase = createClient();
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

  const hasAttentionItems = (pendingConnectionCount ?? 0) > 0 || offersAwaitingDecision > 0;

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
      </div>
    </div>
  );
}
