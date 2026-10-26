"use server";

import { createClient } from "@/lib/supabase/server";
import { identifierError } from "@/lib/deidentify";
import { friendly } from "@/lib/friendly-error";
import { raiseNotification, markConversationNotificationsRead } from "@/lib/notifications-v2";
import { chatWhen, findThread, loadChatMessages, postToThread, type ThreadMessage } from "@/lib/threads";

// The chat box on every messaging surface (Nick, 18 Oct): Messages, the
// conversation under a client on a cover request, and on a referral. Each
// call answers with data, never a redirect, so sending, editing, removing
// and new replies appear in place without the page reloading.

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function sendChatAction(input: {
  conversationId?: number | null;
  otherIds?: string[];
  title?: string | null;
  link?: string | null;
  body: string;
}): Promise<{ ok: true; message: ThreadMessage; conversationId: number } | Fail> {
  const { supabase, user } = await me();
  if (!user) return fail("You're signed out. Sign in again to send.");
  const body = String(input.body || "").trim().slice(0, 4000);
  if (!body) return fail("Write a message first.");
  const idErr = identifierError(body);
  if (idErr) return fail(idErr);

  let conversationId = input.conversationId ? Number(input.conversationId) : null;
  let insertedId: number | null = null;
  let at = new Date().toISOString();

  if (conversationId) {
    // A reply in a known conversation (Messages): you must be in it.
    const { data: participants, error: pErr } = await supabase
      .from("conversation_participants")
      .select("profile_id, profile:profile_id(id, full_name)")
      .eq("conversation_id", conversationId);
    if (pErr || !(participants || []).some((p: any) => p.profile_id === user.id)) return fail("That conversation isn't available.");
    const others = (participants || []).map((p: any) => p.profile).filter((p: any) => p && p.id !== user.id);
    const lower = body.toLowerCase();
    const mentioned = others.filter((p: any) => p.full_name && lower.includes(`@${String(p.full_name).toLowerCase()}`)).map((p: any) => p.id);
    const { data: row, error } = await supabase
      .from("conversation_messages")
      .insert({ conversation_id: conversationId, author_id: user.id, body, mentioned_profile_ids: mentioned })
      .select("id, created_at")
      .single();
    if (error || !row) return fail(friendly(error, "Your message didn't send. Try again."));
    insertedId = Number(row.id);
    at = row.created_at;
    await supabase.from("conversations").update({ last_message_at: at }).eq("id", conversationId);
    await supabase.from("conversation_participants").update({ last_read_at: at }).eq("conversation_id", conversationId).eq("profile_id", user.id);
    await raiseNotification(supabase, {
      eventType: "message_received",
      recipientProfileIds: others.map((p: any) => p.id),
      actorProfileId: user.id,
      actorType: "member_web",
      summary: "sent you a message",
      deepLink: input.link && input.link.startsWith("/dashboard") ? input.link : `/dashboard/messages/${conversationId}`,
      dedupKey: `message:${conversationId}`,
      metadata: { conversationId },
    });
  } else {
    // The thread about one thing (a client on a cover request, a referral),
    // started on its first message.
    const others = (input.otherIds || []).map(String).filter(Boolean);
    const title = input.title ? String(input.title).slice(0, 200) : null;
    const res = await postToThread(supabase, user.id, others, title, body, input.link && input.link.startsWith("/dashboard") ? input.link : undefined);
    if (res.error || !res.conversationId) return fail(friendly({ message: res.error || "", code: res.errorCode }, "Your message didn't send. Try again."));
    conversationId = res.conversationId;
    const { data: row } = await supabase
      .from("conversation_messages")
      .select("id, created_at")
      .eq("conversation_id", conversationId)
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    insertedId = row ? Number(row.id) : Date.now();
    at = row?.created_at || at;
  }

  return {
    ok: true,
    conversationId: conversationId!,
    message: { id: insertedId!, mine: true, author: "You", authorId: user.id, body, at, atLabel: chatWhen(at), edited: false, removed: "", reactions: { counts: {}, names: {}, mine: null } },
  };
}

// Edit within 15 minutes of sending (migration 0116 enforces it too).
export async function editChatAction(messageId: number, raw: string): Promise<{ ok: true; body: string } | Fail> {
  const { supabase, user } = await me();
  if (!user) return fail("You're signed out.");
  const body = String(raw || "").trim().slice(0, 4000);
  if (!body) return fail("A message can't be empty. Remove it instead.");
  const idErr = identifierError(body);
  if (idErr) return fail(idErr);
  const { data: m } = await supabase.from("conversation_messages").select("id, author_id, created_at, deleted_at").eq("id", messageId).maybeSingle();
  if (!m || m.author_id !== user.id || m.deleted_at) return fail("That message can't be edited.");
  if (Date.now() - new Date(m.created_at).getTime() > 15 * 60_000) return fail("Messages can be edited for 15 minutes after sending. You can still remove it.");
  const { error } = await supabase.from("conversation_messages").update({ body, edited_at: new Date().toISOString() }).eq("id", messageId).eq("author_id", user.id);
  if (error) return fail(friendly(error, "That edit didn't save. Try again."));
  return { ok: true, body };
}

// Remove your own message at any time: the text is cleared, not hidden.
export async function removeChatAction(messageId: number): Promise<{ ok: true } | Fail> {
  const { supabase, user } = await me();
  if (!user) return fail("You're signed out.");
  const { error, data } = await supabase
    .from("conversation_messages")
    .update({ body: "", deleted_at: new Date().toISOString(), mentioned_profile_ids: [] })
    .eq("id", messageId)
    .eq("author_id", user.id)
    .select("id");
  if (error || !(data || []).length) return fail(error ? friendly(error, "That didn't work. Try again.") : "That message can't be removed.");
  return { ok: true };
}

// New replies while the page is open. Reading them counts as read.
export async function pollChatAction(input: { conversationId?: number | null; otherIds?: string[]; title?: string | null }): Promise<{ ok: true; conversationId: number | null; messages: ThreadMessage[] } | Fail> {
  const { supabase, user } = await me();
  if (!user) return fail("signed out");
  let conversationId = input.conversationId ? Number(input.conversationId) : null;
  if (!conversationId && input.otherIds?.length) conversationId = await findThread(supabase, user.id, input.otherIds.map(String), input.title ?? null);
  if (!conversationId) return { ok: true, conversationId: null, messages: [] };
  const messages = await loadChatMessages(supabase, user.id, conversationId);
  const lastTheirs = [...messages].reverse().find((m) => !m.mine);
  if (lastTheirs) {
    const { data: part } = await supabase.from("conversation_participants").select("last_read_at").eq("conversation_id", conversationId).eq("profile_id", user.id).maybeSingle();
    if (part && (!part.last_read_at || new Date(part.last_read_at) < new Date(lastTheirs.at))) {
      await supabase.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("profile_id", user.id);
      await markConversationNotificationsRead(supabase, user.id, conversationId);
    }
  }
  return { ok: true, conversationId, messages };
}
