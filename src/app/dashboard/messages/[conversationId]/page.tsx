import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendMessage } from "../actions";
import { ReportContent } from "../../_components/report-content";
import { removeMessageAction } from "../actions";
import { loadConversations, splitContext } from "../data";
import { ConversationList, MessagesShell } from "../views";
import { Status } from "../../_components/ui";

const nameOf = (p: any) => (p ? `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}` : "Colleague");

export default async function ConversationPage(props: { params: Promise<{ conversationId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { conversationId } = await props.params;
  const { error } = await props.searchParams;
  const id = Number(conversationId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const { data: conversation } = await supabase.from("conversations").select("id, title").eq("id", id).maybeSingle();
  if (!conversation) redirect("/dashboard/messages");

  // Mark read before loading the list so this thread isn't shown as unread.
  await supabase.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", id).eq("profile_id", myself);

  const [items, { data: participants }, { data: messages }] = await Promise.all([
    loadConversations(supabase, myself),
    supabase.from("conversation_participants").select("profile_id, profile:profile_id(id, full_name, credential_prefix)").eq("conversation_id", id),
    supabase
      .from("conversation_messages")
      .select("id, author_id, body, created_at, deleted_at, author:author_id(full_name, credential_prefix)")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
  ]);
  const others = (participants || []).filter((p: any) => p.profile_id !== myself);
  const { context, detail } = splitContext(conversation.title);
  const heading = others.map((p: any) => nameOf(p.profile)).join(", ") || detail || "Conversation";
  const group = others.length > 1;

  return (
    <MessagesShell list={<ConversationList items={items} activeId={id} />}>
      <section className="card message-area">
        <div className="context-head">
          <div>
            <h3 style={{ margin: 0 }}>{heading}</h3>
            <span className="micro-note">{context ? `${context} · ${detail}` : group && detail ? detail : "Direct message"}</span>
          </div>
          {others.length === 1 && <a className="btn secondary small-btn" href={`/dashboard/people/${others[0].profile_id}`}>View profile</a>}
        </div>
        {error && <div className="banner error">{error}</div>}
        <div className="message-scroll">
          {(messages || []).length === 0 && <p className="small">No messages yet. Say hello.</p>}
          {(messages || []).map((m: any) => (
            <div key={m.id} className={`bubble${m.author_id === myself ? " me" : ""}`}>
              {group && m.author_id !== myself && <span className="author">{nameOf(m.author)}</span>}
              {m.deleted_at ? <em>{m.body && m.body.startsWith("[Removed by PsyAlliance") ? "Removed by PsyAlliance: it contained patient information" : "Message removed"}</em> : <span style={{ whiteSpace: "pre-wrap" }}>{m.body}</span>}
              <small>
                {new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {!m.deleted_at && (
                  <span style={{ display: "inline-block", marginLeft: 8 }}>
                    {m.author_id === myself ? (
                      <form action={removeMessageAction} className="inline">
                        <input type="hidden" name="message_id" value={m.id} />
                        <input type="hidden" name="conversation_id" value={id} />
                        <button type="submit" className="plain-button small">Remove</button>
                      </form>
                    ) : (
                      <ReportContent targetType="message" targetId={m.id} returnTo={`/dashboard/messages/${id}`} />
                    )}
                  </span>
                )}
              </small>
            </div>
          ))}
        </div>
        <form action={sendMessage} className="message-compose" style={{ marginTop: 12 }}>
          <input type="hidden" name="conversation_id" value={id} />
          <textarea name="body" required placeholder="Write a professional message." aria-label="Message" />
          <button type="submit" className="btn">Send</button>
        </form>
        <p className="micro-note" style={{ marginTop: 6 }}>No patient-identifying details. Clinical handoffs happen through your own secure channel.</p>
      </section>
      {others.length === 0 && <Status tone="neutral">Only you are in this conversation</Status>}
    </MessagesShell>
  );
}
