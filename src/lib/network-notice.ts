import { createClient } from "@/lib/supabase/server";

// Best-effort DM to the other party - reuses the same conversations/
// conversation_messages tables the "Message" button already writes to
// (system_notifications is admin-only by RLS, so it's not usable for a
// peer-to-peer notice like this). Deduplicated by an exact title +
// participant-set match, same pattern as startConversation, so repeat
// requests/reminders between the same two people land in one thread
// instead of spawning a new one every time.
export async function sendNetworkNotice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fromId: string,
  toId: string,
  title: string,
  body: string
) {
  try {
    const participantIds = [fromId, toId];
    let conversationId: number | null = null;

    const { data: myRows } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("profile_id", fromId);
    const myConversationIds = (myRows || []).map((r) => r.conversation_id);

    if (myConversationIds.length > 0) {
      const { data: titleMatches } = await supabase
        .from("conversations")
        .select("id")
        .in("id", myConversationIds)
        .eq("title", title);
      const candidateIds = (titleMatches || []).map((c) => c.id);

      if (candidateIds.length > 0) {
        const { data: allRows } = await supabase
          .from("conversation_participants")
          .select("conversation_id, profile_id")
          .in("conversation_id", candidateIds);
        const byConversation = new Map<number, Set<string>>();
        for (const row of allRows || []) {
          const set = byConversation.get(row.conversation_id) || new Set<string>();
          set.add(row.profile_id);
          byConversation.set(row.conversation_id, set);
        }
        const target = new Set(participantIds);
        const existing = Array.from(byConversation.entries()).find(
          ([, set]) => set.size === target.size && [...set].every((id) => target.has(id))
        )?.[0];
        if (existing) conversationId = existing;
      }
    }

    if (!conversationId) {
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({ created_by: fromId, title })
        .select("id")
        .single();
      if (convError || !conversation) return;
      conversationId = conversation.id;
      await supabase
        .from("conversation_participants")
        .insert(participantIds.map((profile_id) => ({ conversation_id: conversationId, profile_id })));
    }

    await supabase.from("conversation_messages").insert({
      conversation_id: conversationId,
      author_id: fromId,
      body,
      mentioned_profile_ids: [],
    });
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
  } catch {
    // Best-effort - never let a notification failure block the underlying
    // connection request/reminder action itself.
  }
}
