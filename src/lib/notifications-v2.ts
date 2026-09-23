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
// THE EMAIL PROVIDER SWAP POINT: deliverEmailStub() below is the only
// place a real provider (Resend or otherwise) plugs in. Per Nick's call -
// "build the email function and hook up later" - it currently only logs
// and marks the delivery sent; nothing else in this file, or in any
// caller, needs to change when a real provider is wired in.

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

  const preferenceColumn = PREFERENCE_COLUMN_BY_EVENT_TYPE[opts.eventType];
  const { data: preferences } = await supabase
    .from("notification_preferences")
    .select(preferenceColumn ? `profile_id, ${preferenceColumn}` : "profile_id")
    .in("profile_id", recipients);
  const emailEnabledFor = new Map((preferences || []).map((p: any) => [p.profile_id, preferenceColumn ? p[preferenceColumn] !== false : true]));

  let dedupedRecipients = new Set(recipients);
  if (opts.dedupKey) {
    const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("notification_deliveries")
      .select("recipient_profile_id, notification_events!inner(dedup_key)")
      .eq("notification_events.dedup_key", opts.dedupKey)
      .in("status", ["pending", "sent"])
      .gte("created_at", since)
      .in("recipient_profile_id", recipients);
    const alreadyNotified = new Set((recent || []).map((r: any) => r.recipient_profile_id));
    dedupedRecipients = new Set(recipients.filter((id) => !alreadyNotified.has(id)));
  }

  const deliveries: any[] = [];
  for (const recipientId of recipients) {
    const suppressed = !dedupedRecipients.has(recipientId);
    deliveries.push({
      notification_event_id: event.id,
      recipient_profile_id: recipientId,
      channel: "in_app",
      status: suppressed ? "suppressed_dedup" : "sent",
      delivered_at: suppressed ? null : new Date().toISOString(),
    });
    if (!suppressed && preferenceColumn && emailEnabledFor.get(recipientId) !== false) {
      deliveries.push({
        notification_event_id: event.id,
        recipient_profile_id: recipientId,
        channel: "email",
        status: "pending",
      });
    }
  }

  const { data: insertedDeliveries, error: deliveryError } = await supabase
    .from("notification_deliveries")
    .insert(deliveries)
    .select("id, channel, recipient_profile_id");
  if (deliveryError) {
    console.error("raiseNotification delivery insert failed:", deliveryError.message);
    return { eventId: event.id, error: deliveryError.message };
  }

  const emailDeliveries = (insertedDeliveries || []).filter((d: any) => d.channel === "email");
  await Promise.all(emailDeliveries.map((d: any) => deliverEmailStub(supabase, d.id, d.recipient_profile_id, opts.summary)));

  return { eventId: event.id, error: null };
}

// THE PROVIDER SWAP POINT (see file header). Replace this function's body
// with a real send (Resend, etc.) when a provider is chosen - every
// caller above stays the same.
async function deliverEmailStub(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deliveryId: number,
  recipientProfileId: string,
  summary: string
) {
  console.log(`[email stub] would send to ${recipientProfileId}: ${summary}`);
  await supabase
    .from("notification_deliveries")
    .update({ status: "sent", delivered_at: new Date().toISOString() })
    .eq("id", deliveryId);
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
