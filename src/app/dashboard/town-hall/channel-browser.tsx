"use client";

import { useState, useTransition } from "react";
import type { ChannelSnapshot, ChannelMessageNode } from "./actions";
import Avatar from "../avatar";

type Tier = "partner" | "bench" | "recommended" | "none";

export type ChannelPill = {
  id: number;
  name: string;
  joined: boolean;
  unread: number;
};

const REACTIONS: { key: "thumbs_up" | "heart" | "thumbs_down"; label: string }[] = [
  { key: "thumbs_up", label: "\u{1F44D}" },
  { key: "heart", label: "❤️" },
  { key: "thumbs_down", label: "\u{1F44E}" },
];

// The Town Hall home page, redesigned around pill/bubble channel tabs -
// click a channel and its conversation appears below with no page
// navigation. Both fetching a channel's messages (getChannelSnapshot) and
// posting/reacting/editing/deleting (the existing town-hall actions, which
// already don't redirect on success) are called as plain async functions
// from here, then the result is folded into local state, so nothing about
// this ever triggers a hard page reload.
export default function ChannelBrowser({
  yourChannels,
  generalChannels,
  specialismChannels,
  tierByAuthorId,
  myself,
  getChannelSnapshot,
  joinChannel,
  leaveChannel,
  postMessage,
  reactToMessage,
  editMessage,
  deleteMessage,
}: {
  yourChannels: ChannelPill[];
  generalChannels: ChannelPill[];
  specialismChannels: ChannelPill[];
  tierByAuthorId: Record<string, Tier>;
  myself: string;
  getChannelSnapshot: (channelId: number) => Promise<{ channel?: ChannelSnapshot["channel"]; topLevel?: ChannelMessageNode[]; error?: string }>;
  joinChannel: (formData: FormData) => Promise<void>;
  leaveChannel: (formData: FormData) => Promise<void>;
  postMessage: (formData: FormData) => Promise<void>;
  reactToMessage: (formData: FormData) => Promise<void>;
  editMessage: (formData: FormData) => Promise<void>;
  deleteMessage: (formData: FormData) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<ChannelSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [readOverrides, setReadOverrides] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();

  function openChannel(id: number) {
    setSelectedId(id);
    setSnapshotError(null);
    startTransition(async () => {
      const result = await getChannelSnapshot(id);
      if (result.error || !result.channel || !result.topLevel) {
        setSnapshotError(result.error || "Couldn't load that channel.");
        setSnapshot(null);
        return;
      }
      setSnapshot({ channel: result.channel, topLevel: result.topLevel });
      setReadOverrides((prev) => new Set(prev).add(id));
    });
  }

  function refresh() {
    if (selectedId == null) return;
    startTransition(async () => {
      const result = await getChannelSnapshot(selectedId);
      if (result.channel && result.topLevel) {
        setSnapshot({ channel: result.channel, topLevel: result.topLevel });
      }
    });
  }

  async function handlePost(formData: FormData) {
    await postMessage(formData);
    refresh();
  }
  async function handleReact(formData: FormData) {
    await reactToMessage(formData);
    refresh();
  }
  async function handleEdit(formData: FormData) {
    await editMessage(formData);
    refresh();
  }
  async function handleDelete(formData: FormData) {
    await deleteMessage(formData);
    refresh();
  }

  function Pill({ c }: { c: ChannelPill }) {
    const unread = readOverrides.has(c.id) ? 0 : c.unread;
    return (
      <button
        type="button"
        className={`th-pill${selectedId === c.id ? " th-pill-active" : ""}`}
        onClick={() => openChannel(c.id)}
      >
        {c.name}
        {unread > 0 && <span className="th-pill-badge">{unread}</span>}
      </button>
    );
  }

  function AuthorName({ id, name, avatarUrl }: { id: string | null; name: string; avatarUrl: string | null }) {
    const tier = id ? tierByAuthorId[id] : undefined;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
        <Avatar url={avatarUrl} name={name} size={24} ring={tier} />
        {!tier || tier === "none" ? <strong>{name}</strong> : <strong className={`person-link-inline tier-${tier}`}>{name}</strong>}
      </span>
    );
  }

  function ReactionBar({ m, channelId }: { m: ChannelMessageNode; channelId: number }) {
    return (
      <span style={{ display: "inline-flex", gap: "0.4rem", marginLeft: "0.75rem" }}>
        {REACTIONS.map((rx) => (
          <form action={handleReact} key={rx.key} style={{ display: "inline" }}>
            <input type="hidden" name="message_id" value={m.id} />
            <input type="hidden" name="channel_id" value={channelId} />
            <input type="hidden" name="reaction" value={rx.key} />
            <button
              type="submit"
              className="secondary"
              style={{
                padding: "0.1rem 0.4rem",
                fontSize: "0.8rem",
                borderColor: m.reactions.mine === rx.key ? "var(--accent, #6366f1)" : undefined,
              }}
            >
              {rx.label} {m.reactions[rx.key] || ""}
            </button>
          </form>
        ))}
      </span>
    );
  }

  function MessageBlock({ m, channelId, myselfActions }: { m: ChannelMessageNode; channelId: number; myselfActions: boolean }) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.4rem" }}>
          <AuthorName id={m.authorId} name={m.authorName} avatarUrl={m.authorAvatarUrl} />
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {new Date(m.createdAt).toLocaleString()}
            {m.editedAt && !m.deletedAt ? " (edited)" : ""}
          </span>
        </div>
        <p>{m.body}</p>
        {!m.deletedAt && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <ReactionBar m={m} channelId={channelId} />
            {myselfActions && (
              <>
                <details style={{ marginLeft: "0.75rem" }}>
                  <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--muted)", display: "inline" }}>
                    Edit
                  </summary>
                  <form action={handleEdit} style={{ marginTop: "0.5rem" }}>
                    <input type="hidden" name="message_id" value={m.id} />
                    <input type="hidden" name="channel_id" value={channelId} />
                    <textarea name="body" rows={2} defaultValue={m.body} required style={{ width: "100%" }} />
                    <button type="submit" className="secondary" style={{ marginTop: "0.35rem" }}>
                      Save edit
                    </button>
                  </form>
                </details>
                <form action={handleDelete} style={{ marginLeft: "0.75rem" }}>
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
      </div>
    );
  }

  const selectedPill =
    selectedId != null
      ? yourChannels.find((c) => c.id === selectedId) ||
        generalChannels.find((c) => c.id === selectedId) ||
        specialismChannels.find((c) => c.id === selectedId)
      : null;

  return (
    <div>
      <div className="th-pill-group">
        <h3>Your channels</h3>
        <div className="th-pill-row">
          {yourChannels.map((c) => <Pill key={c.id} c={c} />)}
          {yourChannels.length === 0 && <p className="muted" style={{ margin: 0 }}>You're not in any channels yet.</p>}
        </div>
      </div>
      <div className="th-pill-group">
        <h3>General channels</h3>
        <div className="th-pill-row">
          {generalChannels.map((c) => <Pill key={c.id} c={c} />)}
        </div>
      </div>
      <div className="th-pill-group">
        <label htmlFor="th-specialism-select" style={{ display: "block", fontWeight: 700, marginBottom: "0.4rem" }}>
          Browse a specialism channel
        </label>
        <select
          id="th-specialism-select"
          className="th-specialism-select"
          value={specialismChannels.some((c) => c.id === selectedId) ? String(selectedId) : ""}
          onChange={(e) => {
            if (e.target.value) openChannel(Number(e.target.value));
          }}
        >
          <option value="">Choose a specialism channel…</option>
          {specialismChannels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.unread > 0 && !readOverrides.has(c.id) ? ` (${c.unread} unread)` : ""}
            </option>
          ))}
        </select>
      </div>

      {selectedId != null && (
        <div className="th-conversation">
          {isPending && !snapshot && <p className="muted">Loading conversation…</p>}
          {snapshotError && <div className="error-banner">{snapshotError}</div>}
          {snapshot && (
            <>
              <div className="widget-header">
                <h2 style={{ margin: 0 }}>{snapshot.channel.name}</h2>
                {selectedPill && (
                  selectedPill.joined ? (
                    <form action={leaveChannel}>
                      <input type="hidden" name="channel_id" value={selectedId} />
                      <button type="submit" className="secondary th-join-leave-btn">
                        Leave channel
                      </button>
                    </form>
                  ) : (
                    <form action={joinChannel}>
                      <input type="hidden" name="channel_id" value={selectedId} />
                      <button type="submit" className="th-join-leave-btn">
                        Join channel
                      </button>
                    </form>
                  )
                )}
              </div>
              {snapshot.channel.description && <p className="muted">{snapshot.channel.description}</p>}

              <div className="card">
                <h3 style={{ marginTop: 0 }}>Post a message</h3>
                <form action={handlePost}>
                  <input type="hidden" name="channel_id" value={selectedId} />
                  <div className="field">
                    <textarea name="body" rows={3} required placeholder="Share something with the channel…" />
                  </div>
                  <button type="submit">Post</button>
                </form>
              </div>

              {snapshot.topLevel.map((m) => (
                <div className="card" key={m.id}>
                  <MessageBlock m={m} channelId={selectedId} myselfActions={m.authorId === myself} />
                  <div style={{ marginLeft: "1.5rem", marginTop: "0.75rem", borderLeft: "2px solid var(--border, #e5e7eb)", paddingLeft: "0.75rem" }}>
                    {m.replies.map((reply) => (
                      <div key={reply.id} style={{ marginBottom: "0.75rem" }}>
                        <MessageBlock m={reply} channelId={selectedId} myselfActions={reply.authorId === myself} />
                      </div>
                    ))}
                    <form action={handlePost}>
                      <input type="hidden" name="channel_id" value={selectedId} />
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
              {snapshot.topLevel.length === 0 && <p className="muted">No messages yet, be the first to post in this channel.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
