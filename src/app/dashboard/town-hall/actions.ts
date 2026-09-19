"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
  if (!body) throw new Error("Message can't be empty");

  const { error } = await supabase.from("town_hall_messages").insert({
    channel_id: channelId,
    author_id: user.id,
    parent_message_id: parentMessageId,
    body,
  });
  if (error) throw new Error(error.message);

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
  if (!body) throw new Error("Message can't be empty");

  // Explicit ownership check alongside RLS: a mismatch here should surface
  // as a clear error rather than a silent no-op update.
  const { error } = await supabase
    .from("town_hall_messages")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("author_id", user.id);
  if (error) throw new Error(error.message);

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
  if (error) throw new Error(error.message);

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
  if (!REACTION_VALUES.includes(reaction as any)) throw new Error("Invalid reaction");

  const { data: existing } = await supabase
    .from("town_hall_reactions")
    .select("id, reaction")
    .eq("message_id", messageId)
    .eq("reactor_id", user.id)
    .maybeSingle();

  if (existing && existing.reaction === reaction) {
    // Clicking the same reaction again removes it (toggle off).
    const { error } = await supabase.from("town_hall_reactions").delete().eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else if (existing) {
    const { error } = await supabase.from("town_hall_reactions").update({ reaction }).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("town_hall_reactions")
      .insert({ message_id: messageId, reactor_id: user.id, reaction });
    if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/town-hall");
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
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/town-hall");
}
