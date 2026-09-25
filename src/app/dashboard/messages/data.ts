import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { clinicianName } from "@/lib/profession";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ConversationItem = {
  id: number;
  title: string;
  context: string | null;
  preview: string;
  when: string;
  unread: boolean;
  avatarName: string;
  avatarUrl: string | null;
};

const nameOf = (p: any) => (p ? clinicianName(p.full_name, p.qualification_level, p.credential_prefix) : "Colleague");

// Titles like "Referral · Anxiety · Brooklyn, New York" or "Cover · October
// leave" mark a conversation that started from a request; the first part
// becomes the context tag and the rest its detail.
export function splitContext(title: string | null): { context: string | null; detail: string | null } {
  if (!title) return { context: null, detail: null };
  const parts = title.split(" · ");
  if (parts.length > 1 && ["Referral", "Cover", "Consult", "Supervision"].includes(parts[0])) {
    return { context: parts[0], detail: parts.slice(1).join(" · ") };
  }
  return { context: null, detail: title };
}

export async function loadConversations(supabase: Supabase, myself: string): Promise<ConversationItem[]> {
  const { data: mine } = await supabase.from("conversation_participants").select("conversation_id, last_read_at").eq("profile_id", myself);
  const ids = (mine || []).map((r: any) => r.conversation_id);
  if (!ids.length) return [];
  const lastRead = new Map((mine || []).map((r: any) => [r.conversation_id, r.last_read_at]));
  const [{ data: convs }, { data: parts }, { data: msgs }] = await Promise.all([
    supabase.from("conversations").select("id, title, last_message_at").in("id", ids).order("last_message_at", { ascending: false }),
    supabase.from("conversation_participants").select("conversation_id, profile_id, profile:profile_id(full_name, credential_prefix, qualification_level, avatar_path)").in("conversation_id", ids),
    supabase.from("conversation_messages").select("conversation_id, body, created_at").in("conversation_id", ids).is("deleted_at", null).order("created_at", { ascending: false }).limit(300),
  ]);
  const others = new Map<number, any[]>();
  for (const p of parts || []) {
    if (p.profile_id === myself) continue;
    others.set(p.conversation_id, [...(others.get(p.conversation_id) || []), p.profile]);
  }
  const lastMsg = new Map<number, any>();
  for (const m of msgs || []) if (!lastMsg.has(m.conversation_id)) lastMsg.set(m.conversation_id, m);
  const urls = await resolveAvatarUrls(supabase, Array.from(others.values()).flat().map((p: any) => p?.avatar_path));
  return (convs || []).map((c: any) => {
    const o = others.get(c.id) || [];
    const names = o.map(nameOf);
    const { context, detail } = splitContext(c.title);
    const lm = lastMsg.get(c.id);
    const d = new Date(c.last_message_at);
    return {
      id: c.id,
      title: names.length ? names.join(", ") : detail || "Conversation",
      context: context ? `${context}${detail ? ` · ${detail}` : ""}` : o.length > 1 && detail ? detail : null,
      preview: lm ? lm.body : "No messages yet",
      when:
        d.toLocaleDateString("en-US", { timeZone: "America/New_York" }) === new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })
          ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }),
      unread: !!lm && new Date(c.last_message_at) > new Date(lastRead.get(c.id)),
      avatarName: names[0] || "?",
      avatarUrl: o[0] ? urls.get(o[0].avatar_path || "") || null : null,
    };
  });
}
