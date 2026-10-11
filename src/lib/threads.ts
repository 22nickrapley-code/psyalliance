import type { createClient } from "@/lib/supabase/server";
import { raiseNotification } from "@/lib/notifications-v2";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Find the conversation with exactly these people and this title, or start
// it, and (optionally) post a message in it. Used when a reply on a
// referral or cover request carries a question: the question lands in
// Messages, in the same thread "Go to messages" opens, so both sides see it
// there. Same matching rule as starting a conversation from Messages.
export async function postToThread(
  supabase: Supabase,
  authorId: string,
  otherIds: string[],
  title: string | null,
  body?: string
): Promise<{ conversationId: number | null; error: string | null }> {
  const everyone = Array.from(new Set([authorId, ...otherIds.filter(Boolean)]));
  if (everyone.length < 2) return { conversationId: null, error: "No one to message." };

  let conversationId: number | null = null;
  const { data: mine } = await supabase.from("conversation_participants").select("conversation_id").eq("profile_id", authorId);
  const ids = (mine || []).map((r: any) => r.conversation_id as number);
  if (ids.length) {
    let q = supabase.from("conversations").select("id").in("id", ids);
    q = title ? q.eq("title", title) : q.is("title", null);
    const { data: titled } = await q;
    const candidates = (titled || []).map((c: any) => c.id as number);
    if (candidates.length) {
      const { data: rows } = await supabase.from("conversation_participants").select("conversation_id, profile_id").in("conversation_id", candidates);
      const sets = new Map<number, Set<string>>();
      for (const r of rows || []) {
        const set = sets.get(r.conversation_id) || new Set<string>();
        set.add(r.profile_id);
        sets.set(r.conversation_id, set);
      }
      const want = new Set(everyone);
      conversationId = Array.from(sets.entries()).find(([, set]) => set.size === want.size && [...set].every((id) => want.has(id)))?.[0] ?? null;
    }
  }

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
      deepLink: `/dashboard/messages/${conversationId}`,
      dedupKey: `message:${conversationId}`,
      metadata: { conversationId },
    });
  }
  return { conversationId, error: null };
}
