import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadConversations } from "../data";
import { ConversationList, MessagesShell } from "../views";
import { ThreadPanel } from "../thread";

export const metadata = { title: "Messages" };

export default async function ConversationPage(props: { params: Promise<{ conversationId: string }>; searchParams: Promise<{ error?: string; draft?: string }> }) {
  const { conversationId } = await props.params;
  const { error, draft } = await props.searchParams;
  const id = Number(conversationId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const { data: conversation } = await supabase.from("conversations").select("id").eq("id", id).maybeSingle();
  if (!conversation) redirect("/dashboard/messages");

  // Mark read before loading the list so this thread isn't shown as unread.
  await supabase.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", id).eq("profile_id", myself);
  const items = await loadConversations(supabase, myself);

  return (
    <MessagesShell list={<ConversationList items={items} activeId={id} />}>
      <ThreadPanel id={id} myself={myself} error={error} draft={draft} />
    </MessagesShell>
  );
}
