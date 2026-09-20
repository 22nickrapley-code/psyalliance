import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "../auth/actions";
import { redirect } from "next/navigation";
import SidebarNav from "./sidebar-nav";
import { buildNavGroups } from "./nav-groups";
import { resolveAvatarUrl } from "@/lib/avatars";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, verification_status, is_admin, avatar_path")
    .eq("id", user.id)
    .maybeSingle();
  const avatarUrl = await resolveAvatarUrl(supabase, profile?.avatar_path);

  // Cheap presence signal used only for match tie-breaking ("last login") -
  // not awaited-critical, but kept simple and correct rather than clever.
  supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", user.id).then(() => {});

  const [{ data: myConversationRows }, { count: unreadNotificationCount }] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select("last_read_at, conversation:conversation_id(last_message_at)")
      .eq("profile_id", user.id),
    supabase
      .from("system_notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .is("read_at", null),
  ]);
  const unreadConversationCount = (myConversationRows || []).filter((r: any) => {
    if (!r.conversation) return false;
    return new Date(r.conversation.last_message_at) > new Date(r.last_read_at);
  }).length;
  // The Messages nav badge now covers the whole inbox - real conversations
  // plus company/admin notices - since a notice shows up in that same inbox.
  const unreadMessageCount = unreadConversationCount + (unreadNotificationCount || 0);

  const displayName = profile?.full_name || user.email || "";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join("") || "U";

  const groups = buildNavGroups(!!profile?.is_admin, unreadMessageCount);

  return (
    <div className="app-shell">
      <SidebarNav
        groups={groups}
        displayName={displayName}
        initials={initials}
        avatarUrl={avatarUrl}
        verificationStatus={profile?.verification_status ?? null}
        signOutAction={signOutAction}
      />
      <main className="app-main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
