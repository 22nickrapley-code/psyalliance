import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "../auth/actions";
import { redirect } from "next/navigation";

// A deliberately separate, minimal shell from the member dashboard's
// SidebarNav - a referring physician never sees Network/Messages/Town
// Hall/Caseload, so there's no reason to reuse that whole nav. Just two
// links and a sign-out.
export default async function ReferLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/refer-sign-in");

  // A member account (has a `profiles` row) never belongs in this portal,
  // whichever sign-in form they used to get here.
  const { data: memberProfile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (memberProfile) redirect("/dashboard");

  const { data: provider } = await supabase
    .from("referring_providers")
    .select("full_name, approval_status")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="refer-shell">
      <header className="refer-topbar">
        <a href="/refer" className="brand">psyalliance.org</a>
        {provider?.approval_status === "approved" && (
          <nav className="refer-topbar-nav">
            <a href="/refer">Find a specialist</a>
            <a href="/refer/referrals">My referrals</a>
          </nav>
        )}
        <div className="refer-topbar-account">
          {provider?.full_name && <span className="muted">{provider.full_name}</span>}
          <form action={signOutAction}>
            <button type="submit" className="secondary" style={{ padding: "0.3rem 0.7rem", fontSize: "0.85rem" }}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="refer-main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
