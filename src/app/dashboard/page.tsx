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
