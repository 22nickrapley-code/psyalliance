import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { sendMessage } from "../actions";

// Renders a message body, turning any "@Full Name" substring that matches a
// mentioned participant into a highlighted span - simple text-based
// rendering rather than a rich editor, matching how the message was parsed
// for mentions on the way in.
function renderBody(body: string, mentionedNames: string[]) {
  if (mentionedNames.length === 0) return body;
  const pattern = new RegExp(`(@(?:${mentionedNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "gi");
  const parts = body.split(pattern);
  return parts.map((part, i) =>
    mentionedNames.some((n) => part.toLowerCase() === `@${n.toLowerCase()}`) ? (
      <span key={i} className="tag gold">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default async function ConversationPage(
  props: {
    params: Promise<{ conversationId: string }>;
  }
) {
  const params = await props.params;
  const conversationId = Number(params.conversationId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, title")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    redirect("/dashboard/messages");
  }

  const [{ data: participants }, { data: messages }] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select("profile_id, profile:profile_id(id, full_name, credential_prefix)")
      .eq("conversation_id", conversationId),
    supabase
      .from("conversation_messages")
      .select("id, author_id, body, mentioned_profile_ids, created_at, edited_at, deleted_at, author:author_id(full_name, credential_prefix)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
  ]);

  const nameById = new Map<string, string>();
  for (const p of participants || []) {
    nameById.set(p.profile_id, (p.profile as any)?.full_name || "Colleague");
  }

  const others = (participants || []).filter((p) => p.profile_id !== myself);
  const title = conversation.title || others.map((o) => (o.profile as any)?.full_name).join(", ") || "Conversation";

  // Mark read on open. Previously fire-and-forget (a bare .then(() => {}))
  // which let the request race the page response on Cloudflare Workers'
  // request-scoped runtime and could get cancelled before it completed -
  // awaited here so it reliably lands before the page renders.
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("profile_id", myself);

  return (
    <div>
      <p><a href="/dashboard/messages">&larr; Back to messages</a></p>
      <h1>{title}</h1>
      <p className="muted">
        With: {others.map((o) => (o.profile as any)?.full_name).join(", ") || "—"}
      </p>

      <div className="card">
        {(messages || []).map((m: any) => {
          const mentionedNames = (m.mentioned_profile_ids || [])
            .map((id: string) => nameById.get(id))
            .filter(Boolean) as string[];
          return (
            <div key={m.id} style={{ marginBottom: "1.1rem", paddingBottom: "1.1rem", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>
                  {m.author?.credential_prefix ? `${m.author.credential_prefix} ` : ""}
                  {m.author?.full_name || "Colleague"}
                  {m.author_id === myself && <span className="tag" style={{ marginLeft: "0.4rem" }}>You</span>}
                </strong>
                <span className="muted">{new Date(m.created_at).toLocaleString()}</span>
              </div>
              <p style={{ margin: "0.35rem 0 0" }}>
                {m.deleted_at ? <em className="muted">Message deleted</em> : renderBody(m.body, mentionedNames)}
              </p>
            </div>
          );
        })}
        {(messages || []).length === 0 && <p className="muted">No messages yet.</p>}

        <form action={sendMessage} style={{ marginTop: "1rem" }}>
          <input type="hidden" name="conversation_id" value={conversationId} />
          <div className="field">
            <label htmlFor="body">
              Reply {others.length > 0 && <span className="muted">(type @{(others[0]?.profile as any)?.full_name} to mention someone)</span>}
            </label>
            <textarea id="body" name="body" rows={3} required />
          </div>
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}
