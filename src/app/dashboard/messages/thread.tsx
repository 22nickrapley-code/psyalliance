import { createClient } from "@/lib/supabase/server";
import { clinicianName } from "@/lib/profession";
import { splitContext } from "./data";
import { HANDOFF_RULE } from "../_components/ui";
import { ChatThread } from "../_components/chat-thread";
import { loadChatMessages } from "@/lib/threads";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const nameOf = (p: any) => (p ? clinicianName(p.full_name, p.qualification_level, p.credential_prefix) : "Colleague");

// Where "View context" goes: the referral or cover plan this thread is
// about, found from the people in it.
async function contextHref(supabase: Supabase, myself: string, other: string | null, context: string | null, detail: string | null) {
  if (context === "Referral") {
    const { data: mine } = await supabase
      .from("referral_requests")
      .select("id, referral_responses!inner(responding_profile_id)")
      .eq("requesting_profile_id", myself)
      .eq("referral_responses.responding_profile_id", other || "")
      .order("created_at", { ascending: false })
      .limit(1);
    if (mine?.[0]) return `/dashboard/refer/${mine[0].id}`;
    if (other) {
      const { data: theirs } = await supabase.from("referral_requests").select("id").eq("requesting_profile_id", other).order("created_at", { ascending: false }).limit(1);
      if (theirs?.[0]) return `/dashboard/refer/${theirs[0].id}`;
    }
    return "/dashboard/refer";
  }
  if (context === "Cover") {
    const planTitle = (detail || "").split(" · ")[0];
    const { data: plan } = await supabase.from("coverage_plans").select("id").eq("profile_id", myself).eq("title", planTitle).limit(1);
    if (plan?.[0]) return `/dashboard/cover/${plan[0].id}?step=track`;
    return "/dashboard/cover";
  }
  if (context === "Consult" || context === "Supervision") return "/dashboard/consult";
  return null;
}

// One conversation: who it's with, what it's about, the thread and the
// reply box. Used by the thread page and as the default Messages view.
export async function ThreadPanel({ id, myself, error, draft }: { id: number; myself: string; error?: string; draft?: string }) {
  const supabase = await createClient();
  const [{ data: conversation }, { data: participants }, messages] = await Promise.all([
    supabase.from("conversations").select("id, title").eq("id", id).maybeSingle(),
    supabase.from("conversation_participants").select("profile_id, profile:profile_id(id, full_name, credential_prefix, qualification_level)").eq("conversation_id", id),
    loadChatMessages(supabase, myself, id),
  ]);
  if (!conversation) return null;
  const others = (participants || []).filter((p: any) => p.profile_id !== myself);
  const { context, detail } = splitContext(conversation.title);
  const heading = others.map((p: any) => nameOf(p.profile)).join(", ") || detail || "Conversation";
  const group = others.length > 1;
  const href = await contextHref(supabase, myself, others[0]?.profile_id || null, context, detail);

  return (
    <section className="card message-area">
      <div className="context-head">
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{heading}</h3>
          <span className="micro-note">
            {context ? `${context} · ${detail}` : group && detail ? detail : "Direct message"}
            {others.length === 1 && (
              <>
                {" · "}
                <a href={`/dashboard/people/${others[0].profile_id}`} style={{ color: "inherit" }}>View profile</a>
              </>
            )}
          </span>
        </div>
        {href && <a className="btn secondary small-btn" href={href}>View context</a>}
      </div>
      {error && <div className="banner error">{error}</div>}
      {/* The same chat as everywhere else (Nick, 18 Oct): send, edit for 15
          minutes, remove, react; replies arrive without reloading. */}
      <ChatThread
        messages={messages}
        conversationId={id}
        showMessagesLink={false}
        returnTo={`/dashboard/messages/${id}`}
        emptyText="No messages yet. Say hello."
        placeholder="Write a professional message…"
        draft={messages.length === 0 ? draft || "" : ""}
        className="in-messages"
      />
      {draft && messages.length === 0 && <p className="micro-note" style={{ marginTop: 8 }}>A suggested opening. Edit it before you send; nothing is sent until you do.</p>}
      <p className="micro-note" style={{ marginTop: 8 }}>{HANDOFF_RULE}</p>
    </section>
  );
}
