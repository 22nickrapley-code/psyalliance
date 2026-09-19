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
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "verified"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "pending"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "flagged"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "rejected"),
    supabase.from("profiles").select("primary_state"),
    supabase
      .from("profiles")
      .select("id, full_name, credential_prefix, qualification_level, verification_status, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("credential_verifications").select("*", { count: "exact", head: true }).eq("matched", false),
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
        <a href="/dashboard/admin/verifications">Verification queue</a>, and the full member list
        (search, verify, flag, promote to admin) is under{" "}
        <a href="/dashboard/admin/members">All members</a>.
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
        </div>
        {(pendingCount ?? 0) > 0 && (
          <p style={{ marginTop: "0.75rem" }}>
            <a href="/dashboard/admin/verifications" className="btn">
              Review {pendingCount} pending profile{pendingCount === 1 ? "" : "s"}
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
