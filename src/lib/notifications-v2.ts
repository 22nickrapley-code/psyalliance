import { createClient } from "@/lib/supabase/server";
import type { ActorType } from "@/lib/professional-events";

// Canonical notification/event service layer (Addendum A2). Named
// notifications-v2 rather than replacing lib/notifications.ts outright -
// notifyProfile() there is still exactly right for a single admin-to-member
// system notice and is left alone; this file is for the broader,
// multi-recipient, multi-channel notification architecture the rebuild's
// other modules (Coverage, Referrals, Consult, credentials) raise events
// into.
//
// EMAIL: this file only queues email deliveries (status 'pending'). The
// database sends them (public.dispatch_email_outbox, run every minute by
// pg_cron, migration 0071) once an email API key is stored in Supabase
// Vault. It also applies each recipient's email switches at send time,
// skips demo accounts, and holds "new message" emails for an hour so
// they only go if the message is still unread.

export type NotificationEventType =
  | "coverage_request"
  | "coverage_response"
  | "coverage_confirmed"
  | "referral_sent"
  | "referral_response"
  | "referral_connected"
  | "consultation_response"
  | "consultation_invite"
  | "trusted_invitation_sent"
  | "trusted_invitation_accepted"
  | "credential_reminder"
  | "availability_reminder"
  | "message_received"
  | "mention"
  | "system_notice"
  | "weekly_digest";

// Which notification_preferences column gates the email channel for each
// event type. Categories with no entry (e.g. system_notice) are always
// in-app only - there's no opt-out of "you're approved" style notices.
const PREFERENCE_COLUMN_BY_EVENT_TYPE: Partial<Record<NotificationEventType, string>> = {
  coverage_request: "email_on_coverage_request",
  coverage_response: "email_on_coverage_response",
  coverage_confirmed: "email_on_coverage_response",
  referral_sent: "email_on_referral_request",
  referral_response: "email_on_referral_response",
  referral_connected: "email_on_referral_response",
  consultation_response: "email_on_consultation_response",
  consultation_invite: "email_on_consultation_invite",
  trusted_invitation_sent: "email_on_trusted_invitation",
  trusted_invitation_accepted: "email_on_trusted_invitation",
  credential_reminder: "email_on_credential_reminder",
  availability_reminder: "email_on_availability_reminder",
  message_received: "email_on_message",
};

// How long a (recipient, dedup_key) pair suppresses a repeat notification.
// A day is enough to stop "declined, resent, declined again" from
// spamming someone's inbox without silently swallowing a genuinely new
// occurrence days later.
const DEDUP_WINDOW_HOURS = 24;

// "New message" emails wait this long, and go only if still unread.
const MESSAGE_EMAIL_DELAY_MINUTES = 60;

export type RaiseNotificationOptions = {
  eventType: NotificationEventType;
  recipientProfileIds: string[];
  actorProfileId?: string | null;
  actorType?: ActorType | "system";
  summary: string;
  deepLink?: string;
  dedupKey?: string;
  metadata?: Record<string, unknown>;
};

export async function raiseNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: RaiseNotificationOptions
) {
  const recipients = Array.from(new Set(opts.recipientProfileIds)).filter((id) => id !== opts.actorProfileId);
  if (recipients.length === 0) return { eventId: null, error: null };

  const wantsEmail = !!PREFERENCE_COLUMN_BY_EVENT_TYPE[opts.eventType];

  // Other recipients' deliveries are hidden by RLS, so dedup asks the
  // database which of them were already told about this key recently.
  let alreadyNotified = new Set<string>();
  if (opts.dedupKey) {
    const { data: recent } = await supabase.rpc("recently_notified", {
      p_dedup_key: opts.dedupKey,
      p_recipients: recipients,
      p_hours: DEDUP_WINDOW_HOURS,
    });
    alreadyNotified = new Set((recent as string[] | null) || []);
  }

  // Every row carries every column. A bulk insert sends one column list for
  // all rows, so a row without send_after became NULL and the whole insert
  // failed (release review N16-03): no member was ever notified.
  const now = new Date().toISOString();
  const sendAfter =
    opts.eventType === "message_received" ? new Date(Date.now() + MESSAGE_EMAIL_DELAY_MINUTES * 60_000).toISOString() : now;
  const deliveries: { recipient: string; channel: "in_app" | "email"; status: string; delivered_at: string | null; send_after: string }[] = [];
  for (const recipientId of recipients) {
    const suppressed = alreadyNotified.has(recipientId);
    deliveries.push({
      recipient: recipientId,
      channel: "in_app",
      status: suppressed ? "suppressed_dedup" : "sent",
      delivered_at: suppressed ? null : now,
      send_after: now,
    });
    if (!suppressed && wantsEmail) {
      deliveries.push({ recipient: recipientId, channel: "email", status: "pending", delivered_at: null, send_after: sendAfter });
    }
  }

  // The event and its deliveries are written together (one transaction in
  // the database), so a failure leaves nothing half-done.
  const { data: eventId, error } = await supabase.rpc("raise_notification", {
    p_event_type: opts.eventType,
    p_summary: opts.summary,
    p_deep_link: opts.deepLink ?? null,
    p_dedup_key: opts.dedupKey ?? null,
    p_metadata: opts.metadata ?? {},
    p_actor_type: opts.actorType ?? "system",
    p_deliveries: deliveries,
  });
  if (!error) return { eventId: (eventId as number) ?? null, error: null };
  if (!/could not find the function|PGRST202/i.test(`${error.code} ${error.message}`)) {
    console.error("raiseNotification failed:", error.message);
    return { eventId: null, error: error.message };
  }

  // Before migration 0114 is applied: the same rows in two steps, and the
  // event is removed again if its deliveries can't be written.
  const { data: event, error: eventError } = await supabase
    .from("notification_events")
    .insert({
      event_type: opts.eventType,
      actor_profile_id: opts.actorProfileId ?? null,
      actor_type: opts.actorType ?? "system",
      dedup_key: opts.dedupKey ?? null,
      deep_link: opts.deepLink ?? null,
      summary: opts.summary,
      metadata: opts.metadata ?? {},
    })
    .select("id")
    .single();
  if (eventError) {
    console.error("raiseNotification failed:", eventError.message);
    return { eventId: null, error: eventError.message };
  }
  const { error: deliveryError } = await supabase.from("notification_deliveries").insert(
    deliveries.map((d) => ({
      notification_event_id: event.id,
      recipient_profile_id: d.recipient,
      channel: d.channel,
      status: d.status,
      delivered_at: d.delivered_at,
      send_after: d.send_after,
    }))
  );
  if (deliveryError) {
    console.error("raiseNotification delivery insert failed:", deliveryError.message);
    await supabase.from("notification_events").delete().eq("id", event.id);
    return { eventId: null, error: deliveryError.message };
  }
  return { eventId: event.id, error: null };
}

export async function getUnreadNotificationCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string
): Promise<number> {
  const { count } = await supabase
    .from("notification_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("recipient_profile_id", profileId)
    .eq("channel", "in_app")
    .eq("status", "sent")
    .is("read_at", null);
  return count ?? 0;
}

export async function markNotificationRead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  deliveryId: number
) {
  const { error } = await supabase
    .from("notification_deliveries")
    .update({ read_at: new Date().toISOString() })
    .eq("id", deliveryId)
    .eq("recipient_profile_id", profileId);
  return { error: error?.message ?? null };
}

export async function markAllNotificationsRead(supabase: Awaited<ReturnType<typeof createClient>>, profileId: string) {
  const { error } = await supabase
    .from("notification_deliveries")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_profile_id", profileId)
    .eq("channel", "in_app")
    .is("read_at", null);
  return { error: error?.message ?? null };
}

// Reading a conversation reads its notifications too (Nick, 13 Oct): the
// "new message" notices that point at this conversation are marked read for
// the person reading it. Only their own deliveries can change (RLS).
export async function markConversationNotificationsRead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  conversationId: number
) {
  if (!Number.isFinite(conversationId)) return;
  const { data: events } = await supabase
    .from("notification_events")
    .select("id")
    .or(`deep_link.eq./dashboard/messages/${conversationId},metadata->>conversationId.eq.${conversationId}`)
    .limit(200);
  const ids = (events || []).map((e: any) => e.id);
  if (!ids.length) return;
  await supabase
    .from("notification_deliveries")
    .update({ read_at: new Date().toISOString() })
    .in("notification_event_id", ids)
    .eq("recipient_profile_id", profileId)
    .eq("channel", "in_app")
    .is("read_at", null);
}
