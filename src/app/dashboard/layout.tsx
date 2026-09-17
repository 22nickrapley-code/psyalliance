import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "../auth/actions";
import { redirect } from "next/navigation";
import SidebarNav, { buildNavGroups } from "./sidebar-nav";

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

  const displayName = profile?.full_name || user.email || "";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join("") || "U";

  const groups = buildNavGroups(!!profile?.is_admin);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/dashboard" className="brand">
          PsyAlliance
          <span>Practice network</span>
        </a>

        <SidebarNav groups={groups} />

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div className="who">
              <div className="name">{displayName}</div>
              {profile?.verification_status && (
                <div className="status">{profile.verification_status}</div>
              )}
            </div>
          </div>
          <form action={signOutAction}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="app-main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
