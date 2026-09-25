import { createClient } from "@/lib/supabase/server";
import { clinicianName } from "@/lib/profession";
import { sendMessage, removeMessageAction } from "./actions";
import { ReportContent } from "../_components/report-content";
import { splitContext } from "./data";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const nameOf = (p: any) => (p ? clinicianName(p.full_name, p.qualification_level, p.credential_prefix) : "Colleague");
const firstOf = (p: any) => String(p?.full_name || "").replace(/^(dr\.?)\s+/i, "").split(/\s+/)[0] || "Colleague";
const when = (d: string) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

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
    const { data: plan } = await supabase.from("coverage_plans").select("id").eq("profile_id", myself).eq("title", detail || "").limit(1);
    if (plan?.[0]) return `/dashboard/cover/${plan[0].id}?step=track`;
    return "/dashboard/cover";
  }
  if (context === "Consult" || context === "Supervision") return "/dashboard/consult";
  return null;
}

// One conversation: who it's with, what it's about, the thread and the
// reply box. Used by the thread page and as the default Messages view.
export async function ThreadPanel({ id, myself, error }: { id: number; myself: string; error?: string }) {
  const supabase = await createClient();
  const [{ data: conversation }, { data: participants }, { data: messages }] = await Promise.all([
    supabase.from("conversations").select("id, title").eq("id", id).maybeSingle(),
    supabase.from("conversation_participants").select("profile_id, profile:profile_id(id, full_name, credential_prefix, qualification_level)").eq("conversation_id", id),
    supabase
      .from("conversation_messages")
      .select("id, author_id, body, created_at, deleted_at, author:author_id(full_name, credential_prefix, qualification_level)")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
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
      <div className="message-scroll">
        {(messages || []).length === 0 && <p className="small">No messages yet. Say hello.</p>}
        {(messages || []).map((m: any) => {
          const mine = m.author_id === myself;
          return (
            <div key={m.id} className={`bubble${mine ? " me" : ""}`}>
              {m.deleted_at ? (
                <em>{m.body && m.body.startsWith("[Removed by PsyAlliance") ? "Removed by PsyAlliance: it contained patient information" : "Message removed"}</em>
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{m.body}</span>
              )}
              <small>
                {mine ? "You" : firstOf(m.author)} &middot; {when(m.created_at)}
                {!m.deleted_at && (
                  <span style={{ display: "inline-block", marginLeft: 8 }}>
                    {mine ? (
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
          );
        })}
      </div>
      <form action={sendMessage} className="message-compose">
        <input type="hidden" name="conversation_id" value={id} />
        <textarea name="body" required placeholder="Write a professional message..." aria-label="Message" />
        <button type="submit" className="btn lg">Send</button>
      </form>
      <p className="micro-note" style={{ marginTop: 8 }}>No patient-identifying details. Clinical handoffs happen through your own secure channel.</p>
    </section>
  );
}
