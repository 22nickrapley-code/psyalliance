import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdminOrRedirectPath } from "@/lib/admin";

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);

  const [
    { count: totalCount },
    { count: verifiedCount },
    { count: pendingCount },
    { count: flaggedCount },
    { count: rejectedCount },
    { data: byState },
    { data: recentSignups },
    { count: unmatchedCredentialCount },
    { count: pendingInsuranceRequestCount },
    { count: pendingChannelRequestCount },
    { count: pendingProviderCount },
    { count: openReportCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_demo", false),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "verified").eq("is_demo", false),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "pending").eq("is_demo", false),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "flagged").eq("is_demo", false),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "rejected").eq("is_demo", false),
    supabase.from("profiles").select("primary_state").eq("is_demo", false),
    supabase
      .from("profiles")
      .select("id, full_name, credential_prefix, qualification_level, verification_status, created_at")
      .eq("is_demo", false)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("credential_verifications").select("*", { count: "exact", head: true }).eq("matched", false),
    supabase.from("insurance_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("channel_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("referring_providers").select("*", { count: "exact", head: true }).eq("approval_status", "pending"),
    supabase.from("reports").select("*", { count: "exact", head: true }).in("status", ["open", "reviewing"]),
  ]);

  const stateCounts = new Map<string, number>();
  for (const row of byState || []) {
    const s = row.primary_state || "-";
    stateCounts.set(s, (stateCounts.get(s) || 0) + 1);
  }
  const topStates = Array.from(stateCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div>
      <h1>Admin</h1>
      <p className="muted">
        Platform-wide stats and quick links for running admin tasks. Credential review lives in{" "}
        <a href="/dashboard/admin/verifications">Verification queue</a>, requests to add a new
        insurance provider are under{" "}
        <a href="/dashboard/admin/insurance-requests">Insurance requests</a>, requests for a new
        Town Hall channel are under{" "}
        <a href="/dashboard/admin/channel-requests">Channel requests</a>, the full member
        list (search, verify, flag, promote to admin) is under{" "}
        <a href="/dashboard/admin/members">All members</a>, physician/GP referral-portal
        registrations are under{" "}
        <a href="/dashboard/admin/referring-providers">Referring providers</a>, liquidity
        metrics (response rates, supply gaps, Northeast/Texas density) are under{" "}
        <a href="/dashboard/admin/network-health">Network health</a>, member-filed reports on a
        profile, consultation, message, or Library document are under{" "}
        <a href="/dashboard/admin/moderation">Moderation queue</a>, and Practice Library
        publication sign-off is under <a href="/dashboard/admin/library">Library governance</a>.
      </p>

      <div className="card">
        <h2>Members</h2>
        <div className="stat-grid">
          <div className="stat">
            <div className="value">{totalCount ?? 0}</div>
            <div className="label">Total profiles</div>
          </div>
          <div className="stat">
            <div className="value">{verifiedCount ?? 0}</div>
            <div className="label">Verified</div>
          </div>
          <div className="stat">
            <div className="value">{pendingCount ?? 0}</div>
            <div className="label">Pending review</div>
          </div>
          <div className="stat">
            <div className="value">{flaggedCount ?? 0}</div>
            <div className="label">Flagged</div>
          </div>
          <div className="stat">
            <div className="value">{rejectedCount ?? 0}</div>
            <div className="label">Rejected</div>
          </div>
          <div className="stat">
            <div className="value">{unmatchedCredentialCount ?? 0}</div>
            <div className="label">Unreviewed credential submissions</div>
          </div>
          <div className="stat">
            <div className="value">{pendingInsuranceRequestCount ?? 0}</div>
            <div className="label">Pending insurance requests</div>
          </div>
          <div className="stat">
            <div className="value">{pendingChannelRequestCount ?? 0}</div>
            <div className="label">Pending channel requests</div>
          </div>
          <div className="stat">
            <div className="value">{pendingProviderCount ?? 0}</div>
            <div className="label">Pending referring providers</div>
          </div>
          <div className="stat">
            <div className="value">{openReportCount ?? 0}</div>
            <div className="label">Open moderation reports</div>
          </div>
        </div>
        {(pendingCount ?? 0) > 0 && (
          <p style={{ marginTop: "0.75rem" }}>
            <a href="/dashboard/admin/verifications" className="btn">
              Review {pendingCount} pending profile{pendingCount === 1 ? "" : "s"}
            </a>
          </p>
        )}
        {(pendingInsuranceRequestCount ?? 0) > 0 && (
          <p style={{ marginTop: "0.5rem" }}>
            <a href="/dashboard/admin/insurance-requests" className="btn secondary">
              Review {pendingInsuranceRequestCount} insurance request{pendingInsuranceRequestCount === 1 ? "" : "s"}
            </a>
          </p>
        )}
        {(pendingChannelRequestCount ?? 0) > 0 && (
          <p style={{ marginTop: "0.5rem" }}>
            <a href="/dashboard/admin/channel-requests" className="btn secondary">
              Review {pendingChannelRequestCount} channel request{pendingChannelRequestCount === 1 ? "" : "s"}
            </a>
          </p>
        )}
        {(pendingProviderCount ?? 0) > 0 && (
          <p style={{ marginTop: "0.5rem" }}>
            <a href="/dashboard/admin/referring-providers" className="btn secondary">
              Review {pendingProviderCount} referring provider{pendingProviderCount === 1 ? "" : "s"}
            </a>
          </p>
        )}
        {(openReportCount ?? 0) > 0 && (
          <p style={{ marginTop: "0.5rem" }}>
            <a href="/dashboard/admin/moderation" className="btn danger">
              Review {openReportCount} open report{openReportCount === 1 ? "" : "s"}
            </a>
          </p>
        )}
      </div>

      <div className="card">
        <h2>By state</h2>
        {topStates.length === 0 && <p className="muted">No profiles yet.</p>}
        {topStates.map(([state, count]) => (
          <span key={state} className="tag" style={{ marginRight: "0.35rem" }}>
            {state} · {count}
          </span>
        ))}
      </div>

      <div className="card">
        <h2>Recent signups</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Qualification</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {(recentSignups || []).map((p: any) => (
              <tr key={p.id}>
                <td>{p.credential_prefix} {p.full_name}</td>
                <td>{p.qualification_level}</td>
                <td><span className="tag">{p.verification_status}</span></td>
                <td>{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(recentSignups || []).length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No signups yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
