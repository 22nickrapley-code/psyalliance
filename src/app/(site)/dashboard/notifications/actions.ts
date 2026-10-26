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

  revalidatePath("/dashboard/messages");
  redirect("/dashboard/messages?tab=notifications");
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
  const raw = String(formData.get("deep_link") || "");
  // Only places inside the app; anything else returns to the list.
  const deepLink = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard/messages?tab=notifications";
  await markNotificationRead(supabase, user.id, deliveryId);

  revalidatePath("/dashboard/messages");
  redirect(deepLink);
}

export async function markAllNotificationsReadAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  await markAllNotificationsRead(supabase, user.id);
  // Notices from PsyAlliance are read along with everything else.
  await supabase.from("system_notifications").update({ read_at: new Date().toISOString() }).eq("profile_id", user.id).is("read_at", null);

  revalidatePath("/dashboard/messages");
  redirect("/dashboard/messages?tab=notifications");
}
