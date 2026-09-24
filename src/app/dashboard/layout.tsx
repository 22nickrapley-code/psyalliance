import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "../auth/actions";
import { redirect } from "next/navigation";
import SidebarNav from "./sidebar-nav";
import { buildNavGroups } from "./nav-groups";
import { resolveAvatarUrl } from "@/lib/avatars";
import { getUnreadNotificationCount } from "@/lib/notifications-v2";

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

  // A referring provider (GP/physician portal account) has no `profiles`
  // row at all - that's what keeps them out of Network/Messages/Town Hall/
  // Caseload by construction. If one ever lands here (stale link, wrong
  // sign-in form), send them to their own portal instead of letting them
  // hit "you haven't set up your profile yet" and wander in.
  if (!profile) {
    const { data: provider } = await supabase
      .from("referring_providers")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (provider) redirect("/refer");
  }
  const avatarUrl = await resolveAvatarUrl(supabase, profile?.avatar_path);

  // Spec rule 2, "verified means reviewed" (re-audit R3): the badge only
  // says Verified when an admin has verified the member AND an active,
  // unexpired licence is on record. A verified account with no licence was
  // previously shown as "verified" while Credentials said "No licenses
  // added yet" - it now says what's actually missing instead.
  const today = new Date().toISOString().slice(0, 10);
  const { count: activeLicenceCount } = await supabase
    .from("licenses")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .eq("status", "active")
    .or(`expiration_date.is.null,expiration_date.gte.${today}`);
  const verificationLabel = !profile
    ? null
    : profile.verification_status === "verified"
      ? (activeLicenceCount || 0) > 0
        ? "Verified"
        : "Verified - add your licence"
      : profile.verification_status === "pending"
        ? "Verification pending"
        : profile.verification_status === "flagged"
          ? "Action required"
          : profile.verification_status === "rejected"
            ? "Not verified"
            : String(profile.verification_status);

  // Cheap presence signal used only for match tie-breaking ("last login") -
  // not awaited-critical, but kept simple and correct rather than clever.
  supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", user.id).then(() => {});

  const [
    { data: myConversationRows },
    { count: unreadNotificationCount },
    { count: pendingProviderReferralCount },
    { data: myOpenRequestsForBadge },
    { count: pendingCoverageRequestCount },
    notificationPipelineUnreadCount,
  ] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select("last_read_at, conversation:conversation_id(last_message_at)")
      .eq("profile_id", user.id),
    supabase
      .from("system_notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .is("read_at", null),
    supabase
      .from("provider_referrals")
      .select("id", { count: "exact", head: true })
      .eq("target_profile_id", user.id)
      .eq("status", "sent"),
    supabase
      .from("referral_requests")
      .select("id, referral_responses(status)")
      .eq("requesting_profile_id", user.id)
      .eq("status", "open"),
    // Requests nav badge (Phase 5): coverage requests sent to me and still
    // waiting on a response - the Requests hub's own "needs you" count.
    supabase
      .from("coverage_requests")
      .select("id", { count: "exact", head: true })
      .eq("requested_profile_id", user.id)
      .eq("status", "sent"),
    // Notifications nav badge (Phase 16): the new notification_events/
    // notification_deliveries pipeline, separate from the legacy
    // system_notifications count above (that one stays feeding the
    // Messages badge, unchanged - this is its own destination now).
    getUnreadNotificationCount(supabase, user.id),
  ]);
  const unreadConversationCount = (myConversationRows || []).filter((r: any) => {
    if (!r.conversation) return false;
    return new Date(r.conversation.last_message_at) > new Date(r.last_read_at);
  }).length;
  const pendingPeerOfferCount = (myOpenRequestsForBadge || []).reduce(
    (sum: number, r: any) => sum + (r.referral_responses || []).filter((resp: any) => resp.status === "offered").length,
    0
  );
  // The Messages nav badge now covers the whole inbox - real conversations,
  // company/admin notices, physician referrals sent to you, and colleagues'
  // offers to help on a request you posted - every kind of incoming "mail"
  // now surfaces as a Referral notice inside Messages, per Nick's call to
  // stop splitting incoming requests between Messages and Referrals.
  const unreadMessageCount =
    unreadConversationCount + (unreadNotificationCount || 0) + (pendingProviderReferralCount || 0) + pendingPeerOfferCount;

  const displayName = profile?.full_name || user.email || "";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join("") || "U";

  const groups = buildNavGroups(!!profile?.is_admin, unreadMessageCount, pendingCoverageRequestCount || 0, notificationPipelineUnreadCount || 0);

  return (
    <div className="app-shell">
      <SidebarNav
        groups={groups}
        displayName={displayName}
        initials={initials}
        avatarUrl={avatarUrl}
        verificationStatus={verificationLabel}
        signOutAction={signOutAction}
      />
      <main className="app-main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
