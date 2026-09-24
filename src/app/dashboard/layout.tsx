import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "../auth/actions";
import { redirect } from "next/navigation";
import PremiumShell from "./premium-shell";
import { buildNavGroups } from "./nav-groups";
import "../premium.css";
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
    .rpc("my_profile")
    .select("full_name, verification_status, is_admin, avatar_path, demo_view, account_kind")
    .maybeSingle<any>();

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

  // The badge says what's true. Admin-only (operator) logins make no
  // clinical claim. A clinician is "Verified" only when they are a network
  // member: verified, active and holding a reviewed, in-date licence.
  const { data: status } = await supabase.rpc("my_network_status").maybeSingle<any>();
  const { count: licenceCount } = await supabase.from("licenses").select("id", { count: "exact", head: true }).eq("profile_id", user.id);
  const isOperator = profile?.account_kind === "operator";
  const verificationLabel = !profile
    ? null
    : isOperator
      ? "Admin"
      : status?.is_member
        ? "Verified"
        : profile.verification_status === "flagged"
          ? "Action required"
          : profile.verification_status === "rejected"
            ? "Not verified"
            : (licenceCount || 0) === 0
              ? "Add your licence"
              : status?.has_reviewed_licence
                ? "Verification pending"
                : "Licence awaiting review";
  const gateNotice =
    !profile || isOperator || status?.is_member || profile.demo_view
      ? null
      : (licenceCount || 0) === 0
        ? "Add a licence to be reviewed. Referrals, cover, consults and messages open once you're verified."
        : "Your credentials are with us for review. Referrals, cover, consults and messages open once you're verified.";

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

  const groups = buildNavGroups({
    isAdmin: !!profile?.is_admin,
    unreadMessages: unreadConversationCount + (unreadNotificationCount || 0),
    pendingCoverRequests: pendingCoverageRequestCount || 0,
    pendingReferrals: (pendingProviderReferralCount || 0) + pendingPeerOfferCount,
  });

  return (
    <PremiumShell
      groups={groups}
      displayName={displayName}
      initials={initials}
      avatarUrl={avatarUrl}
      verificationLabel={verificationLabel}
      unreadNotifications={notificationPipelineUnreadCount || 0}
      signOutAction={signOutAction}
      demoView={!!profile?.demo_view}
      gateNotice={gateNotice}
    >
      {children}
    </PremiumShell>
  );
}
