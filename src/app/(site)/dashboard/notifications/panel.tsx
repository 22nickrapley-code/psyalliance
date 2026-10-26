import { clinicianName } from "@/lib/profession";
import { getUnreadNotificationCount, type NotificationEventType } from "@/lib/notifications-v2";
import { createClient } from "@/lib/supabase/server";
import { markNotificationReadAction, openNotificationAction, markAllNotificationsReadAction } from "./actions";
import { setNotificationReadState } from "../messages/actions";

// Every notification in one list, housed in Messages beside the
// conversations (the bell opens the same list): replies and requests from
// Cover, Refer and Consult, colleagues adding you, license reviews, and
// notices from PsyAlliance. New ones are highlighted until read.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const NOTIFICATIONS_HREF = "/dashboard/messages?tab=notifications";

const LABELS: Record<NotificationEventType, string> = {
  coverage_request: "Cover",
  coverage_response: "Cover",
  coverage_confirmed: "Cover",
  referral_sent: "Refer",
  referral_response: "Refer",
  referral_connected: "Refer",
  consultation_response: "Consult",
  consultation_invite: "Consult",
  trusted_invitation_sent: "Network",
  trusted_invitation_accepted: "Network",
  credential_reminder: "Credentials",
  availability_reminder: "Availability",
  message_received: "Messages",
  system_notice: "PsyAlliance",
  weekly_digest: "Digest",
};

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

// New notifications, for the Notifications tab in Messages.
export async function countNewNotifications(supabase: Supabase, myself: string) {
  const [pipeline, { count: notices }] = await Promise.all([
    getUnreadNotificationCount(supabase, myself),
    supabase.from("system_notifications").select("id", { count: "exact", head: true }).eq("profile_id", myself).is("read_at", null),
  ]);
  return pipeline + (notices || 0);
}

export type NotificationItem = {
  key: string;
  at: string;
  unread: boolean;
  label: string;
  title: string;
  body: string | null;
  // Open goes to what it's about and marks it read; otherwise Mark read.
  open?: { deliveryId: number; href: string };
  markRead?: { kind: "delivery" | "notice"; id: number };
};

export async function NotificationsPanel({ supabase, myself }: { supabase: Supabase; myself: string }) {
  const [{ data: deliveries }, { data: notices }] = await Promise.all([
    supabase
      .from("notification_deliveries")
      .select("id, read_at, created_at, notification_events(summary, deep_link, event_type, actor:actor_profile_id(full_name, credential_prefix, qualification_level))")
      .eq("recipient_profile_id", myself)
      .eq("channel", "in_app")
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("system_notifications").select("id, title, body, created_at, read_at").eq("profile_id", myself).order("created_at", { ascending: false }).limit(20),
  ]);

  const items: NotificationItem[] = [
    ...(deliveries || [])
      .filter((d: any) => d.notification_events)
      .map((d: any): NotificationItem => {
        const e = d.notification_events;
        const actor = e.actor?.full_name ? clinicianName(e.actor.full_name, e.actor.qualification_level, e.actor.credential_prefix) : null;
        const unread = !d.read_at;
        return {
          key: `d${d.id}`,
          at: d.created_at,
          unread,
          label: LABELS[e.event_type as NotificationEventType] || "PsyAlliance",
          title: actor ? `${actor} ${e.summary}` : e.summary,
          body: null,
          open: e.deep_link ? { deliveryId: d.id, href: e.deep_link } : undefined,
          markRead: !e.deep_link && unread ? { kind: "delivery", id: d.id } : undefined,
        };
      }),
    ...(notices || []).map(
      (n: any): NotificationItem => ({
        key: `n${n.id}`,
        at: n.created_at,
        unread: !n.read_at,
        label: "PsyAlliance",
        title: n.title,
        body: n.body,
        markRead: !n.read_at ? { kind: "notice", id: n.id } : undefined,
      })
    ),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return <NotificationsView items={items} />;
}

function Action({ i }: { i: NotificationItem }) {
  if (i.open) {
    return (
      <form action={openNotificationAction}>
        <input type="hidden" name="delivery_id" value={i.open.deliveryId} />
        <input type="hidden" name="deep_link" value={i.open.href} />
        <button type="submit" className="btn secondary small-btn">Open</button>
      </form>
    );
  }
  if (i.markRead?.kind === "delivery") {
    return (
      <form action={markNotificationReadAction}>
        <input type="hidden" name="delivery_id" value={i.markRead.id} />
        <button type="submit" className="plain-button small">Mark read</button>
      </form>
    );
  }
  if (i.markRead?.kind === "notice") {
    return (
      <form action={setNotificationReadState}>
        <input type="hidden" name="id" value={i.markRead.id} />
        <input type="hidden" name="state" value="read" />
        <button type="submit" className="plain-button small">Mark read</button>
      </form>
    );
  }
  return null;
}

export function NotificationsView({ items }: { items: NotificationItem[] }) {
  const fresh = items.filter((i) => i.unread).length;
  return (
    <section className="card notif-panel" aria-label="Notifications">
      <div className="card-title">
        <h3>{fresh > 0 ? `${fresh} new notification${fresh === 1 ? "" : "s"}` : "You're up to date"}</h3>
        {fresh > 0 && (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="btn secondary small-btn">Mark all read</button>
          </form>
        )}
      </div>
      <p className="small" style={{ marginTop: 0 }}>
        Replies and requests from Cover, Refer and Consult, colleagues who add you, license reviews and notices from PsyAlliance. The bell opens this list
        too.
      </p>
      {items.length === 0 ? (
        <p className="small notif-empty">Nothing yet. Notifications appear here as they happen.</p>
      ) : (
        <ul className="notif-list">
          {items.map((i) => (
            <li key={i.key} className={`notif-item${i.unread ? " unread" : ""}`}>
              <span className="notif-tag">{i.label}</span>
              <div className="notif-body">
                <b>
                  {i.unread && <span className="new-dot" aria-label="New" />}
                  {i.title}
                </b>
                {i.body && <p>{i.body}</p>}
                <small>{timeAgo(i.at)}</small>
              </div>
              <div className="notif-act">
                <Action i={i} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
