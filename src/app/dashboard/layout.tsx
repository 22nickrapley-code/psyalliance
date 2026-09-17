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
    .select("full_name, verification_status")
    .eq("id", user.id)
    .maybeSingle();

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
