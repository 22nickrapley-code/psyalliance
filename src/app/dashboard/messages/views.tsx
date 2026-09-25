import type { ReactNode } from "react";
import { PersonAvatar, Status } from "../_components/ui";
import type { ConversationItem } from "./data";

export function ConversationList({ items, activeId, composing }: { items: ConversationItem[]; activeId?: number; composing?: boolean }) {
  return (
    <section className="card conversation-list" aria-label="Conversations">
      <div className="row between" style={{ padding: "6px 8px 10px" }}>
        <strong className="small">Conversations</strong>
        {composing ? <span className="status neutral">Writing</span> : <a className="btn small-btn" href="/dashboard/messages?compose=1">New</a>}
      </div>
      {items.length === 0 && <p className="small" style={{ padding: "0 8px" }}>No conversations yet.</p>}
      {items.map((c) => (
        <a key={c.id} href={`/dashboard/messages/${c.id}`} className={`conversation-entry${c.id === activeId ? " active" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
          <PersonAvatar name={c.avatarName} url={c.avatarUrl} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="row between">
              <b style={{ fontWeight: c.unread ? 750 : 600 }}>{c.title}</b>
              <small>{c.when}</small>
            </span>
            {c.context && <small className="thread-context">{c.context}</small>}
            <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.unread ? "● " : ""}{c.preview}
            </small>
          </span>
        </a>
      ))}
    </section>
  );
}

export function MessagesShell({ list, children }: { list: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your conversations</div>
          <h1>Messages with context.</h1>
          <p>Professional conversation, connected to the request or discussion that started it.</p>
        </div>
      </div>
      <div className="conversation-layout">
        {list}
        <div>{children}</div>
      </div>
    </>
  );
}

export { Status };
