"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page (channel-specific where relevant) with an inline banner rather
// than taking the page down.
function townHallError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function postMessage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const channelId = Number(formData.get("channel_id"));
  const body = String(formData.get("body") || "").trim();
  const parentRaw = formData.get("parent_message_id");
  const parentMessageId = parentRaw ? Number(parentRaw) : null;
  if (!body) townHallError(`/dashboard/town-hall/${channelId}`, "Message can't be empty");

  const { error } = await supabase.from("town_hall_messages").insert({
    channel_id: channelId,
    author_id: user.id,
    parent_message_id: parentMessageId,
    body,
  });
  if (error) townHallError(`/dashboard/town-hall/${channelId}`, error.message);

  revalidatePath(`/dashboard/town-hall/${channelId}`);
}

export async function editMessage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const messageId = Number(formData.get("message_id"));
  const channelId = Number(formData.get("channel_id"));
  const body = String(formData.get("body") || "").trim();
  if (!body) townHallError(`/dashboard/town-hall/${channelId}`, "Message can't be empty");

  // Explicit ownership check alongside RLS: a mismatch here should surface
  // as a clear error rather than a silent no-op update.
  const { error } = await supabase
    .from("town_hall_messages")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("author_id", user.id);
  if (error) townHallError(`/dashboard/town-hall/${channelId}`, error.message);

  revalidatePath(`/dashboard/town-hall/${channelId}`);
}

export async function deleteMessage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const messageId = Number(formData.get("message_id"));
  const channelId = Number(formData.get("channel_id"));

  const { error } = await supabase
    .from("town_hall_messages")
    .update({ deleted_at: new Date().toISOString(), body: "[deleted]" })
    .eq("id", messageId)
    .eq("author_id", user.id);
  if (error) townHallError(`/dashboard/town-hall/${channelId}`, error.message);

  revalidatePath(`/dashboard/town-hall/${channelId}`);
}

const REACTION_VALUES = ["thumbs_up", "heart", "thumbs_down"] as const;

export async function reactToMessage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const messageId = Number(formData.get("message_id"));
  const channelId = Number(formData.get("channel_id"));
  const reaction = String(formData.get("reaction") || "");
  if (!REACTION_VALUES.includes(reaction as any)) townHallError(`/dashboard/town-hall/${channelId}`, "Invalid reaction");

  const { data: existing } = await supabase
    .from("town_hall_reactions")
    .select("id, reaction")
    .eq("message_id", messageId)
    .eq("reactor_id", user.id)
    .maybeSingle();

  if (existing && existing.reaction === reaction) {
    // Clicking the same reaction again removes it (toggle off).
    const { error } = await supabase.from("town_hall_reactions").delete().eq("id", existing.id);
    if (error) townHallError(`/dashboard/town-hall/${channelId}`, error.message);
  } else if (existing) {
    const { error } = await supabase.from("town_hall_reactions").update({ reaction }).eq("id", existing.id);
    if (error) townHallError(`/dashboard/town-hall/${channelId}`, error.message);
  } else {
    const { error } = await supabase
      .from("town_hall_reactions")
      .insert({ message_id: messageId, reactor_id: user.id, reaction });
    if (error) townHallError(`/dashboard/town-hall/${channelId}`, error.message);
  }

  revalidatePath(`/dashboard/town-hall/${channelId}`);
}

export async function joinChannel(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const channelId = Number(formData.get("channel_id"));
  const { error } = await supabase
    .from("town_hall_memberships")
    .upsert({ channel_id: channelId, profile_id: user.id, is_auto: false });
  if (error) townHallError("/dashboard/town-hall", error.message);

  revalidatePath("/dashboard/town-hall");
}

// Self-service "request a new channel" - same reviewed-request pattern as
// requestNewInsurance on Caseload. Goes to admin review rather than
// auto-creating, so the channel list stays curated.
export async function requestNewChannel(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const channelName = String(formData.get("channel_name") || "").trim();
  const reason = String(formData.get("reason") || "").trim() || null;
  if (!channelName) townHallError("/dashboard/town-hall", "Enter a name for the channel you'd like to see.");
  if (channelName.length > 80) townHallError("/dashboard/town-hall", "That channel name is too long.");

  const { error } = await supabase.from("channel_requests").insert({
    requested_by: user.id,
    channel_name: channelName,
    reason,
  });
  if (error) townHallError("/dashboard/town-hall", error.message);

  revalidatePath("/dashboard/town-hall");
  redirect("/dashboard/town-hall?channel_requested=1");
}

export async function leaveChannel(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const channelId = Number(formData.get("channel_id"));
  const { error } = await supabase
    .from("town_hall_memberships")
    .delete()
    .eq("channel_id", channelId)
    .eq("profile_id", user.id);
  if (error) townHallError("/dashboard/town-hall", error.message);

  revalidatePath("/dashboard/town-hall");
}
