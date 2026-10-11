import type { createClient } from "@/lib/supabase/server";
import { raiseNotification } from "@/lib/notifications-v2";
import { clinicianName } from "@/lib/profession";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// A conversation about one thing (a client on a cover request, a referral)
// is the thread with exactly these people and this title: the same rule as
// starting a conversation from Messages. It shows in place on the cover
// request or referral, and in Messages.

export type ThreadMessage = { id: number; mine: boolean; author: string; body: string; at: string };

export async function findThread(supabase: Supabase, authorId: string, otherIds: string[], title: string | null): Promise<number | null> {
  const everyone = Array.from(new Set([authorId, ...otherIds.filter(Boolean)]));
  if (everyone.length < 2) return null;
  const { data: mine } = await supabase.from("conversation_participants").select("conversation_id").eq("profile_id", authorId);
  const ids = (mine || []).map((r: any) => r.conversation_id as number);
  if (!ids.length) return null;
  let q = supabase.from("conversations").select("id").in("id", ids);
  q = title ? q.eq("title", title) : q.is("title", null);
  const { data: titled } = await q;
  const candidates = (titled || []).map((c: any) => c.id as number);
  if (!candidates.length) return null;
  const { data: rows } = await supabase.from("conversation_participants").select("conversation_id, profile_id").in("conversation_id", candidates);
  const sets = new Map<number, Set<string>>();
  for (const r of rows || []) {
    const set = sets.get(r.conversation_id) || new Set<string>();
    set.add(r.profile_id);
    sets.set(r.conversation_id, set);
  }
  const want = new Set(everyone);
  return Array.from(sets.entries()).find(([, set]) => set.size === want.size && [...set].every((id) => want.has(id)))?.[0] ?? null;
}

// Find or start the thread and (optionally) post a message in it. The
// other person is told, and the notification opens `deepLink` (the cover
// request or referral) when given, otherwise the thread in Messages.
export async function postToThread(
  supabase: Supabase,
  authorId: string,
  otherIds: string[],
  title: string | null,
  body?: string,
  deepLink?: string
): Promise<{ conversationId: number | null; error: string | null }> {
  const everyone = Array.from(new Set([authorId, ...otherIds.filter(Boolean)]));
  if (everyone.length < 2) return { conversationId: null, error: "No one to message." };

  let conversationId = await findThread(supabase, authorId, otherIds, title);
  if (!conversationId) {
    const { data: created, error } = await supabase.from("conversations").insert({ created_by: authorId, title }).select("id").single();
    if (error || !created) return { conversationId: null, error: error?.message || "Couldn't start the conversation." };
    conversationId = created.id as number;
    const { error: pErr } = await supabase
      .from("conversation_participants")
      .insert(everyone.map((profile_id) => ({ conversation_id: conversationId, profile_id })));
    if (pErr) return { conversationId: null, error: pErr.message };
  }

  const text = (body || "").trim();
  if (text) {
    const { error } = await supabase.from("conversation_messages").insert({ conversation_id: conversationId, author_id: authorId, body: text, mentioned_profile_ids: [] });
    if (error) return { conversationId, error: error.message };
    const now = new Date().toISOString();
    await supabase.from("conversations").update({ last_message_at: now }).eq("id", conversationId);
    // The author has read their own message.
    await supabase.from("conversation_participants").update({ last_read_at: now }).eq("conversation_id", conversationId).eq("profile_id", authorId);
    await raiseNotification(supabase, {
      eventType: "message_received",
      recipientProfileIds: otherIds,
      actorProfileId: authorId,
      actorType: "member_web",
      summary: "sent you a message",
      deepLink: deepLink || `/dashboard/messages/${conversationId}`,
      dedupKey: `message:${conversationId}`,
      metadata: { conversationId },
    });
  }
  return { conversationId, error: null };
}

// The messages in a thread, oldest first, for showing in place. Opening it
// counts as reading it, as in Messages.
export async function loadThread(
  supabase: Supabase,
  me: string,
  otherIds: string[],
  title: string | null
): Promise<{ conversationId: number | null; messages: ThreadMessage[] }> {
  const conversationId = await findThread(supabase, me, otherIds, title);
  if (!conversationId) return { conversationId: null, messages: [] };
  const { data: rows } = await supabase
    .from("conversation_messages")
    .select("id, author_id, body, created_at, author:author_id(full_name, credential_prefix, qualification_level)")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  const messages: ThreadMessage[] = (rows || [])
    .filter((m: any) => (m.body || "").trim())
    .map((m: any) => ({
      id: m.id,
      mine: m.author_id === me,
      author: m.author_id === me ? "You" : m.author ? clinicianName(m.author.full_name, m.author.qualification_level, m.author.credential_prefix) : "Colleague",
      body: m.body,
      at: m.created_at,
    }));
  if (messages.some((m) => !m.mine)) {
    await supabase.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("profile_id", me);
  }
  return { conversationId, messages };
}
