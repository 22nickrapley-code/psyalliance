import type { ReactNode } from "react";
import { PersonAvatar, Status } from "../_components/ui";
import { NavIcon } from "../icons";
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

// Messages has two areas: conversations with colleagues, and every
// notification (the bell opens the same list).
function MessagesTabs({ tab, newNotifications }: { tab: "conversations" | "notifications"; newNotifications: number }) {
  const tabs: [k: "conversations" | "notifications", label: string, href: string, hint: string, icon: string][] = [
    ["conversations", "Conversations", "/dashboard/messages?list=1", "With colleagues", "messages"],
    ["notifications", "Notifications", "/dashboard/messages?tab=notifications", "Everything flagged for you", "flag"],
  ];
  return (
    <nav className="section-tabs two messages-tabs" aria-label="Messages">
      {tabs.map(([k, label, href, hint, icon]) => (
        <a key={k} href={href} className={`section-tab${tab === k ? " active" : ""}`} aria-current={tab === k ? "page" : undefined}>
          <span className="st-icon" aria-hidden="true">
            <NavIcon name={icon} size={18} />
          </span>
          <span className="st-text">
            <b>
              {label}
              {k === "notifications" && newNotifications > 0 && <span className="new-pill">{newNotifications} new</span>}
            </b>
            <small>{hint}</small>
          </span>
        </a>
      ))}
    </nav>
  );
}

export function MessagesShell({
  list,
  children,
  view = "thread",
  tab = "conversations",
  newNotifications = 0,
}: {
  list: ReactNode;
  children: ReactNode;
  view?: "index" | "thread" | "compose";
  tab?: "conversations" | "notifications";
  newNotifications?: number;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your practice</div>
          <h1>Messages</h1>
          <p>Conversations with colleagues, connected to what started them, and every notification in one place.</p>
        </div>
      </div>
      <MessagesTabs tab={tab} newNotifications={newNotifications} />
      {tab === "notifications" ? (
        <div className="notif-area">{children}</div>
      ) : (
      /* Desktop: list and thread side by side. Phone: the list, or one
         thread with a way back to it. */
      <div className={`conversation-layout view-${view}`}>
        {list}
        <div className="conversation-main">
          {view !== "index" && (
            <a className="text-arrow back-to-list" href="/dashboard/messages?list=1">
              &larr; All messages
            </a>
          )}
          {children}
        </div>
      </div>
      )}
    </>
  );
}

export { Status };
