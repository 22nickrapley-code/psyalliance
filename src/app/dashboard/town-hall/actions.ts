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
  revalidatePath("/dashboard/town-hall");
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
  revalidatePath("/dashboard/town-hall");
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
  revalidatePath("/dashboard/town-hall");
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
  revalidatePath("/dashboard/town-hall");
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

// A single message plus its replies, fully plain and serializable - what
// getChannelSnapshot below returns for the inline (no-navigation) channel
// view, matching the same shape the dedicated /dashboard/town-hall/[id]
// page already builds from these same three queries.
export type ChannelMessageNode = {
  id: number;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  reactions: { thumbs_up: number; heart: number; thumbs_down: number; mine: string | null };
  replies: ChannelMessageNode[];
};

export type ChannelSnapshot = {
  channel: { id: number; name: string; description: string | null };
  topLevel: ChannelMessageNode[];
};

// Fetches one channel's full conversation as plain data and marks it read
// for the caller (resets their unread badge) - called directly from the
// Town Hall client component when a pill is clicked, instead of navigating
// to /dashboard/town-hall/[id]. This is what makes "click a channel, see
// the conversation appear below" possible without a page reload: the
// client component calls this as a plain async function, not a form
// submission, and swaps the result into local state.
export async function getChannelSnapshot(channelId: number): Promise<{
  channel?: ChannelSnapshot["channel"];
  topLevel?: ChannelMessageNode[];
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const myself = user.id;

  const [{ data: channel }, { data: messages }, { data: reactions }] = await Promise.all([
    supabase.from("town_hall_channels").select("id, name, description").eq("id", channelId).maybeSingle(),
    supabase
      .from("town_hall_messages")
      .select("*, author:author_id(full_name, credential_prefix)")
      .eq("channel_id", channelId)
      .order("created_at"),
    supabase.from("town_hall_reactions").select("message_id, reactor_id, reaction"),
  ]);
  if (!channel) return { error: "Channel not found" };

  const reactionsByMessage = new Map<number, { thumbs_up: number; heart: number; thumbs_down: number; mine: string | null }>();
  for (const r of reactions || []) {
    if (!reactionsByMessage.has(r.message_id)) {
      reactionsByMessage.set(r.message_id, { thumbs_up: 0, heart: 0, thumbs_down: 0, mine: null });
    }
    const entry = reactionsByMessage.get(r.message_id)!;
    entry[r.reaction as "thumbs_up" | "heart" | "thumbs_down"]++;
    if (r.reactor_id === myself) entry.mine = r.reaction;
  }

  const authorNameOf = (m: any) =>
    m.deleted_at ? "-" : `${m.author?.credential_prefix || ""} ${m.author?.full_name || "Unknown"}`.trim();

  const repliesByParent = new Map<number, any[]>();
  for (const m of messages || []) {
    if (m.parent_message_id) {
      repliesByParent.set(m.parent_message_id, [...(repliesByParent.get(m.parent_message_id) || []), m]);
    }
  }

  const toNode = (m: any): ChannelMessageNode => ({
    id: m.id,
    authorId: m.author_id,
    authorName: authorNameOf(m),
    body: m.body,
    createdAt: m.created_at,
    editedAt: m.edited_at,
    deletedAt: m.deleted_at,
    reactions: reactionsByMessage.get(m.id) || { thumbs_up: 0, heart: 0, thumbs_down: 0, mine: null },
    replies: (repliesByParent.get(m.id) || []).map(toNode),
  });

  const topLevel = (messages || [])
    .filter((m) => !m.parent_message_id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(toNode);

  // Best-effort: opening a channel inline marks it read, same as visiting
  // its dedicated page would. Never blocks the response on failure.
  await supabase
    .from("town_hall_memberships")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("profile_id", myself);

  return {
    channel: { id: channel.id, name: channel.name, description: channel.description },
    topLevel,
  };
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
