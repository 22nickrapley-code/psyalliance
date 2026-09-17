import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "../auth/actions";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, verification_status, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  // Cheap presence signal used only for match tie-breaking ("last login") -
  // not awaited-critical, but kept simple and correct rather than clever.
  supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", user.id).then(() => {});

  return (
    <div>
      <nav className="topnav">
        <div style={{ fontWeight: 700 }}>PsyAlliance</div>
        <div className="links">
          <a href="/dashboard">Overview</a>
          <a href="/dashboard/profile">Profile</a>
          <a href="/dashboard/caseload">Caseload</a>
          <a href="/dashboard/income">Income</a>
          <a href="/dashboard/capacity">Capacity &amp; overhead</a>
          <a href="/dashboard/documents">Documents</a>
          <a href="/dashboard/network">Network</a>
          <a href="/dashboard/town-hall">Town Hall</a>
          <a href="/dashboard/referrals">Referrals</a>
          <a href="/dashboard/planner">Planner</a>
          <a href="/dashboard/settings">Settings</a>
          {profile?.is_admin && <a href="/dashboard/admin/verifications">Verification queue</a>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="muted">
            {profile?.full_name || user.email}
            {profile?.verification_status && (
              <span className="tag" style={{ marginLeft: "0.5rem" }}>
                {profile.verification_status}
              </span>
            )}
          </span>
          <form action={signOutAction}>
            <button type="submit" className="secondary">Sign out</button>
          </form>
        </div>
      </nav>
      <main className="container">{children}</main>
    </div>
  );
}
