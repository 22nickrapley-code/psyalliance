"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notifications-v2";

// Phase 16: the read path for the notification_events/notification_deliveries
// pipeline Phase 4 batch 6 built and Coverage/Referrals/Consult have been
// firing into ever since. Thin wrappers, same shape as every other actions
// file in this rebuild.

export async function markNotificationReadAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const deliveryId = Number(formData.get("delivery_id"));
  await markNotificationRead(supabase, user.id, deliveryId);

  revalidatePath("/dashboard/notifications");
  redirect("/dashboard/notifications");
}

// Marks a notification read, then sends the member on to whatever it's
// actually about (the Coverage/Referral/Consult/Messages page the deep
// link points at) - so opening a notification behaves like opening an
// email: it's read, and you land where the news happened.
export async function openNotificationAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const deliveryId = Number(formData.get("delivery_id"));
  if (!Number.isSafeInteger(deliveryId) || deliveryId < 1) redirect("/dashboard/notifications");
  const { data: delivery } = await supabase.from("notification_deliveries")
    .select("notification_events(deep_link)")
    .eq("id", deliveryId).eq("recipient_profile_id", user.id).eq("channel", "in_app").maybeSingle();
  if (!delivery) redirect("/dashboard/notifications");
  const path = (delivery.notification_events as { deep_link?: string } | null)?.deep_link;
  const deepLink = path?.startsWith("/dashboard/") && !path.startsWith("//") && !/[\\\r\n]/.test(path)
    ? path : "/dashboard/notifications";
  await markNotificationRead(supabase, user.id, deliveryId);

  revalidatePath("/dashboard/notifications");
  redirect(deepLink);
}

export async function markAllNotificationsReadAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  await markAllNotificationsRead(supabase, user.id);

  revalidatePath("/dashboard/notifications");
  redirect("/dashboard/notifications");
}
