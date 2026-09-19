import { createClient } from "@/lib/supabase/server";
import { postMessage, reactToMessage, deleteMessage, editMessage } from "../actions";
import Link from "next/link";
import { notFound } from "next/navigation";

const REACTIONS: { key: string; label: string }[] = [
  { key: "thumbs_up", label: "👍" },
  { key: "heart", label: "❤️" },
  { key: "thumbs_down", label: "👎" },
];

export default async function TownHallChannelPage(props: { params: Promise<{ channelId: string }> }) {
  const params = await props.params;
  const channelId = Number(params.channelId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: channel }, { data: messages }, { data: reactions }] = await Promise.all([
    supabase.from("town_hall_channels").select("*").eq("id", channelId).maybeSingle(),
    supabase
      .from("town_hall_messages")
      .select("*, author:author_id(full_name, credential_prefix)")
      .eq("channel_id", channelId)
      .order("created_at"),
    supabase
      .from("town_hall_reactions")
      .select("message_id, reactor_id, reaction"),
  ]);

  if (!channel) notFound();

  const reactionsByMessage = new Map<number, { thumbs_up: number; heart: number; thumbs_down: number; mine: string | null }>();
  for (const r of reactions || []) {
    if (!reactionsByMessage.has(r.message_id)) {
      reactionsByMessage.set(r.message_id, { thumbs_up: 0, heart: 0, thumbs_down: 0, mine: null });
    }
    const entry = reactionsByMessage.get(r.message_id)!;
    entry[r.reaction as "thumbs_up" | "heart" | "thumbs_down"]++;
    if (r.reactor_id === myself) entry.mine = r.reaction;
  }

  const topLevel = (messages || []).filter((m) => !m.parent_message_id);
  const repliesByParent = new Map<number, any[]>();
  for (const m of messages || []) {
    if (m.parent_message_id) {
      repliesByParent.set(m.parent_message_id, [...(repliesByParent.get(m.parent_message_id) || []), m]);
    }
  }

  const authorName = (m: any) => (m.deleted_at ? "—" : `${m.author?.credential_prefix || ""} ${m.author?.full_name || "Unknown"}`.trim());

  const ReactionBar = ({ m }: { m: any }) => {
    const r = reactionsByMessage.get(m.id) || { thumbs_up: 0, heart: 0, thumbs_down: 0, mine: null };
    return (
      <span style={{ display: "inline-flex", gap: "0.4rem", marginLeft: "0.75rem" }}>
        {REACTIONS.map((rx) => (
          <form action={reactToMessage} key={rx.key} style={{ display: "inline" }}>
            <input type="hidden" name="message_id" value={m.id} />
            <input type="hidden" name="channel_id" value={channelId} />
            <input type="hidden" name="reaction" value={rx.key} />
            <button
              type="submit"
              className="secondary"
              style={{
                padding: "0.1rem 0.4rem",
                fontSize: "0.8rem",
                borderColor: r.mine === rx.key ? "var(--accent, #6366f1)" : undefined,
              }}
            >
              {rx.label} {r[rx.key as "thumbs_up" | "heart" | "thumbs_down"] || ""}
            </button>
          </form>
        ))}
      </span>
    );
  };

  return (
    <div>
      <p>
        <Link href="/dashboard/town-hall">&larr; All channels</Link>
      </p>
      <h1>{channel.name}</h1>
      {channel.description && <p className="muted">{channel.description}</p>}

      <div className="card">
        <h2>Post a message</h2>
        <form action={postMessage}>
          <input type="hidden" name="channel_id" value={channelId} />
          <div className="field">
            <textarea name="body" rows={3} required placeholder="Share something with the channel…" />
          </div>
          <button type="submit">Post</button>
        </form>
      </div>

      {topLevel.map((m) => (
        <div className="card" key={m.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <strong>{authorName(m)}</strong>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              {new Date(m.created_at).toLocaleString()}
              {m.edited_at && !m.deleted_at ? " (edited)" : ""}
            </span>
          </div>
          <p>{m.body}</p>
          {!m.deleted_at && (
            <div style={{ display: "flex", alignItems: "center" }}>
              <ReactionBar m={m} />
              {m.author_id === myself && (
                <>
                  <details style={{ marginLeft: "0.75rem" }}>
                    <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--muted)", display: "inline" }}>
                      Edit
                    </summary>
                    <form action={editMessage} style={{ marginTop: "0.5rem" }}>
                      <input type="hidden" name="message_id" value={m.id} />
                      <input type="hidden" name="channel_id" value={channelId} />
                      <textarea name="body" rows={2} defaultValue={m.body} required style={{ width: "100%" }} />
                      <button type="submit" className="secondary" style={{ marginTop: "0.35rem" }}>
                        Save edit
                      </button>
                    </form>
                  </details>
                  <form action={deleteMessage} style={{ marginLeft: "0.75rem" }}>
                    <input type="hidden" name="message_id" value={m.id} />
                    <input type="hidden" name="channel_id" value={channelId} />
                    <button type="submit" className="secondary" style={{ padding: "0.1rem 0.4rem", fontSize: "0.8rem" }}>
                      Delete
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          <div style={{ marginLeft: "1.5rem", marginTop: "0.75rem", borderLeft: "2px solid var(--border, #e5e7eb)", paddingLeft: "0.75rem" }}>
            {(repliesByParent.get(m.id) || []).map((reply) => (
              <div key={reply.id} style={{ marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: "0.9rem" }}>{authorName(reply)}</strong>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>
                    {new Date(reply.created_at).toLocaleString()}
                  </span>
                </div>
                <p style={{ margin: "0.2rem 0" }}>{reply.body}</p>
                {!reply.deleted_at && (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <ReactionBar m={reply} />
                    {reply.author_id === myself && (
                      <>
                        <details style={{ marginLeft: "0.75rem" }}>
                          <summary style={{ cursor: "pointer", fontSize: "0.75rem", color: "var(--muted)", display: "inline" }}>
                            Edit
                          </summary>
                          <form action={editMessage} style={{ marginTop: "0.4rem" }}>
                            <input type="hidden" name="message_id" value={reply.id} />
                            <input type="hidden" name="channel_id" value={channelId} />
                            <textarea name="body" rows={2} defaultValue={reply.body} required style={{ width: "100%" }} />
                            <button type="submit" className="secondary" style={{ marginTop: "0.35rem" }}>
                              Save edit
                            </button>
                          </form>
                        </details>
                        <form action={deleteMessage} style={{ marginLeft: "0.75rem" }}>
                          <input type="hidden" name="message_id" value={reply.id} />
                          <input type="hidden" name="channel_id" value={channelId} />
                          <button type="submit" className="secondary" style={{ padding: "0.1rem 0.4rem", fontSize: "0.75rem" }}>
                            Delete
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <form action={postMessage}>
              <input type="hidden" name="channel_id" value={channelId} />
              <input type="hidden" name="parent_message_id" value={m.id} />
              <div className="field-row" style={{ alignItems: "flex-end" }}>
                <div className="field">
                  <input name="body" type="text" placeholder="Reply…" required />
                </div>
                <div className="field" style={{ flex: "0 0 auto" }}>
                  <button type="submit" className="secondary" style={{ padding: "0.3rem 0.6rem" }}>
                    Reply
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ))}
      {topLevel.length === 0 && <p className="muted">No messages yet — be the first to post in this channel.</p>}
    </div>
  );
}
