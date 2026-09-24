import { createClient } from "@/lib/supabase/server";
import { markNotificationReadAction, openNotificationAction, markAllNotificationsReadAction } from "./actions";
import type { NotificationEventType } from "@/lib/notifications-v2";

const EVENT_TYPE_LABELS: Record<NotificationEventType, string> = {
  coverage_request: "Coverage",
  coverage_response: "Coverage",
  coverage_confirmed: "Coverage",
  referral_sent: "Referral",
  referral_response: "Referral",
  referral_connected: "Referral",
  consultation_response: "Consult",
  consultation_invite: "Consult",
  trusted_invitation_sent: "Network",
  trusted_invitation_accepted: "Network",
  credential_reminder: "Credentials",
  availability_reminder: "Availability",
  message_received: "Messages",
  system_notice: "System",
  weekly_digest: "Digest",
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Phase 16: the read side of the notification_events/notification_deliveries
// pipeline (Addendum A2, built in Phase 4 batch 6, wired up as the "Notification
// pipeline wired up" batch) - Coverage/Referrals/Consult have all been firing
// real events into it since; this is the first page that reads any of it.
// Deliberately a plain page rather than a header dropdown/toast, consistent
// with how the rest of this rebuild surfaces "needs you" items (a nav badge
// plus a full page) rather than introducing a new interaction pattern.
export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [
    { data: deliveries },
    { count: pendingConnectionCount },
    { data: myConversationRows },
    { data: pendingCoverageRequests },
    { data: myConsultationsWithReplies },
  ] = await Promise.all([
    supabase
      .from("notification_deliveries")
      .select(
        "id, read_at, created_at, notification_events(summary, deep_link, event_type, created_at, actor:actor_profile_id(full_name, credential_prefix))"
      )
      .eq("recipient_profile_id", myself)
      .eq("channel", "in_app")
      .order("created_at", { ascending: false })
      .limit(50),
    // Sept 23 audit finding: this page said "All caught up" while unread
    // messages and pending connection requests sat elsewhere in the app -
    // those live in entirely different tables (conversation_participants,
    // connections) from this page's notification_deliveries, so they never
    // showed up here. Same signals Home already computes, reused so "All
    // caught up" only appears when it's actually true across the app, not
    // just true of this one pipeline.
    supabase.from("connections").select("id", { count: "exact", head: true }).eq("addressee_id", myself).eq("status", "pending"),
    supabase
      .from("conversation_participants")
      .select("last_read_at, conversation:conversation_id(last_message_at)")
      .eq("profile_id", myself),
    supabase
      .from("coverage_requests")
      .select("id")
      .eq("requested_profile_id", myself)
      .eq("status", "sent"),
    supabase
      .from("consultations")
      .select("id")
      .eq("author_profile_id", myself)
      .eq("status", "responses_received"),
  ]);

  const unreadCount = (deliveries || []).filter((d: any) => !d.read_at).length;

  const unreadMessageCount = (myConversationRows || []).filter((r: any) => {
    if (!r.conversation) return false;
    return new Date(r.conversation.last_message_at) > new Date(r.last_read_at);
  }).length;
  const otherPendingItems = [
    unreadMessageCount > 0 && { count: unreadMessageCount, label: `unread conversation${unreadMessageCount === 1 ? "" : "s"}`, href: "/dashboard/messages" },
    (pendingConnectionCount ?? 0) > 0 && { count: pendingConnectionCount ?? 0, label: `pending connection${pendingConnectionCount === 1 ? "" : "s"}`, href: "/dashboard/network" },
    (pendingCoverageRequests || []).length > 0 && { count: (pendingCoverageRequests || []).length, label: `coverage request${(pendingCoverageRequests || []).length === 1 ? "" : "s"} waiting on you`, href: "/dashboard/requests" },
    (myConsultationsWithReplies || []).length > 0 && { count: (myConsultationsWithReplies || []).length, label: `consultation${(myConsultationsWithReplies || []).length === 1 ? "" : "s"} with new replies`, href: "/dashboard/consult" },
  ].filter(Boolean) as { count: number; label: string; href: string }[];

  return (
    <div>
      <h1>Notifications</h1>
      <p className="muted">Everything Coverage, Referrals, Consult, and the rest of PsyAlliance have flagged for you.</p>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}>
          <h2 style={{ margin: 0 }}>
            {unreadCount > 0
              ? `${unreadCount} unread`
              : otherPendingItems.length > 0
                ? "No new notifications"
                : "All caught up"}
          </h2>
          {unreadCount > 0 && (
            <form action={markAllNotificationsReadAction}>
              <button type="submit" className="secondary">Mark all read</button>
            </form>
          )}
        </div>

        {otherPendingItems.length > 0 && (
          <p className="muted" style={{ marginTop: "0.4rem" }}>
            Not tracked as notifications, but still waiting on you:{" "}
            {otherPendingItems.map((item, i) => (
              <span key={item.href}>
                {i > 0 && ", "}
                <a href={item.href}>{item.count} {item.label}</a>
              </span>
            ))}
            .
          </p>
        )}

        <div style={{ marginTop: "0.75rem" }}>
          {(deliveries || []).map((d: any) => {
            const event = d.notification_events;
            if (!event) return null;
            const unread = !d.read_at;
            const label = EVENT_TYPE_LABELS[event.event_type as NotificationEventType] || event.event_type;
            return (
              <div
                key={d.id}
                className="person-row"
                style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.6rem", marginBottom: "0.6rem" }}
              >
                <span className="person-row-info">
                  <span className="tag">{label}</span>{" "}
                  {unread && <span className="tag" style={{ marginLeft: "0.2rem" }}>Unread</span>}
                  <div style={{ fontWeight: unread ? 600 : 400, marginTop: "0.2rem" }}>
                    {event.actor?.full_name && (
                      <>
                        {event.actor.credential_prefix ? `${event.actor.credential_prefix} ` : ""}
                        {event.actor.full_name}{" "}
                      </>
                    )}
                    {event.summary}
                  </div>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>{timeAgo(d.created_at)}</span>
                </span>
                <span className="person-row-actions">
                  {event.deep_link ? (
                    <form action={openNotificationAction}>
                      <input type="hidden" name="delivery_id" value={d.id} />
                      <button type="submit" className="secondary">Open</button>
                    </form>
                  ) : unread ? (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="delivery_id" value={d.id} />
                      <button type="submit" className="secondary">Mark read</button>
                    </form>
                  ) : null}
                </span>
              </div>
            );
          })}
          {(deliveries || []).length === 0 && (
            <p className="muted">Nothing here yet - coverage requests, referral responses, and consultation replies will show up as they happen.</p>
          )}
        </div>
      </div>
    </div>
  );
}
