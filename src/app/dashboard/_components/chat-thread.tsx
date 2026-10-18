"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { identifierError } from "@/lib/deidentify";
import type { ThreadMessage } from "@/lib/threads";
import { sendChatAction, editChatAction, removeChatAction, pollChatAction } from "../chat-actions";
import { MessageReactions } from "../messages/reactions";
import { ReportContent } from "./report-content";

// One chat, the same on every surface (Nick, 18 Oct): Messages, the
// conversation under a client on a cover request, and on a referral. Like a
// text message: the box stays where it is, what you send appears above it
// straight away, nothing reloads, and replies arrive while you're here. Your
// own message can be edited for 15 minutes and removed at any time; the
// other person's can be reacted to or reported.

const EDIT_MS = 15 * 60_000;
const POLL_MS = 20_000;
const IDLE_MS = 30 * 60_000;

type Local = ThreadMessage & { pending?: boolean; failed?: boolean; tempId?: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export type ChatThreadProps = {
  messages: ThreadMessage[];
  conversationId?: number | null;
  // For a thread about one thing, started on its first message.
  otherIds?: string[];
  title?: string | null;
  // Where the other person lands from their notification.
  link?: string | null;
  heading?: string;
  placeholder?: string;
  // Show "Also in Messages" (off on the Messages page itself).
  showMessagesLink?: boolean;
  returnTo?: string;
  emptyText?: string;
  // Focus the box when shown (after "Ask a question").
  autoFocus?: boolean;
  draft?: string;
  canSend?: boolean;
  cannotSendText?: string;
  className?: string;
  // Sends the message some other way (the first question on a cover
  // request also records the answer). Must answer like sendChatAction.
  onSend?: (body: string) => Promise<{ ok: true; message: ThreadMessage; conversationId: number } | { ok: false; error: string }>;
};

export function ChatThread({
  messages: initial,
  conversationId: initialConversation = null,
  otherIds = [],
  title = null,
  link = null,
  heading,
  placeholder = "Write a message…",
  showMessagesLink = true,
  returnTo,
  emptyText = "No messages yet.",
  autoFocus = false,
  draft = "",
  canSend = true,
  cannotSendText,
  className = "",
  onSend,
}: ChatThreadProps) {
  const [list, setList] = useState<Local[]>(initial);
  const [conversationId, setConversationId] = useState<number | null>(initialConversation);
  const [text, setText] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);
  const [editing, setEditing] = useState<{ id: number; body: string; error?: string; saving?: boolean } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const lastActive = useRef(0);
  const polling = useRef(false);

  // Time-based controls (Edit) only after the page is on screen, so the
  // server's render and the browser's always match.
  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    lastActive.current = Date.now();
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (autoFocus) boxRef.current?.focus();
  }, [autoFocus]);

  const scrollDown = useCallback(() => {
    const el = listRef.current;
    if (el) window.requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }, []);
  useEffect(scrollDown, [scrollDown]);

  // Replies arrive while the page is open and in view.
  const poll = useCallback(async () => {
    if (!conversationId || polling.current || document.visibilityState !== "visible") return;
    if (Date.now() - lastActive.current > IDLE_MS) return;
    polling.current = true;
    try {
      const res = await pollChatAction({ conversationId });
      if (res.ok) {
        setList((cur) => {
          const local = cur.filter((m) => m.pending || m.failed);
          const before = cur.filter((m) => !m.pending && !m.failed).length;
          const next = [...res.messages, ...local];
          if (res.messages.length > before) {
            lastActive.current = Date.now();
            scrollDown();
          }
          return next;
        });
      }
    } catch {
      // A missed check is fine; the next one catches up.
    } finally {
      polling.current = false;
    }
  }, [conversationId, scrollDown]);
  useEffect(() => {
    if (!conversationId) return;
    const t = window.setInterval(poll, POLL_MS);
    const onFocus = () => {
      lastActive.current = Date.now();
      poll();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [conversationId, poll]);

  const deliver = async (temp: Local) => {
    const res = onSend ? await onSend(temp.body) : await sendChatAction({ conversationId, otherIds, title, link, body: temp.body });
    if (!res.ok) {
      setList((cur) => cur.map((m) => (m.tempId === temp.tempId ? { ...m, pending: false, failed: true } : m)));
      setError(res.error);
      return;
    }
    if (!conversationId) setConversationId(res.conversationId);
    setList((cur) => cur.map((m) => (m.tempId === temp.tempId ? { ...res.message } : m)));
    setNow(Date.now());
  };

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    const problem = identifierError(body);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    lastActive.current = Date.now();
    const at = new Date().toISOString();
    const temp: Local = { id: -Date.now(), tempId: `t${Date.now()}`, mine: true, author: "You", body, at, atLabel: when(at), pending: true, removed: "", reactions: { counts: {}, names: {}, mine: null } };
    setList((cur) => [...cur, temp]);
    setText("");
    scrollDown();
    boxRef.current?.focus();
    deliver(temp);
  };

  const retry = (m: Local) => {
    setError(null);
    setList((cur) => cur.map((x) => (x.tempId === m.tempId ? { ...x, failed: false, pending: true } : x)));
    deliver({ ...m, failed: false, pending: true });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends and Shift+Enter starts a new line, as in a chat app; on a
    // touch screen Enter is a new line and the Send button sends.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      send();
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body = editing.body.trim();
    const problem = identifierError(body);
    if (!body || problem) {
      setEditing({ ...editing, error: problem || "A message can't be empty. Remove it instead." });
      return;
    }
    setEditing({ ...editing, saving: true, error: undefined });
    const res = await editChatAction(editing.id, body);
    if (!res.ok) {
      setEditing({ ...editing, saving: false, error: res.error });
      return;
    }
    setList((cur) => cur.map((m) => (m.id === editing.id ? { ...m, body: res.body, edited: true } : m)));
    setEditing(null);
  };

  const remove = async (id: number) => {
    setConfirmRemove(null);
    const before = list;
    setList((cur) => cur.map((m) => (m.id === id ? { ...m, removed: "self", body: "" } : m)));
    const res = await removeChatAction(id);
    if (!res.ok) {
      setList(before);
      setError(res.error);
    }
  };

  return (
    <div className={`chat-thread ${className}`}>
      {(heading || (showMessagesLink && conversationId)) && (
        <div className="chat-head">
          {heading && <b>{heading}</b>}
          {showMessagesLink && conversationId && (
            <a className="chat-open" href={`/dashboard/messages/${conversationId}`}>
              Also in Messages
            </a>
          )}
        </div>
      )}
      <ol className="chat-list" ref={listRef} aria-live="polite">
        {list.length === 0 && <li className="chat-empty">{emptyText}</li>}
        {list.map((m) => {
          const canEdit = mounted && m.mine && !m.removed && !m.pending && !m.failed && m.id > 0 && now - new Date(m.at).getTime() < EDIT_MS;
          const isEditing = editing?.id === m.id;
          return (
            <li key={m.tempId || m.id} className={`chat-msg ${m.mine ? "mine" : "theirs"}${m.pending ? " pending" : ""}${m.failed ? " failed" : ""}${m.removed ? " removed" : ""}`}>
              {!m.mine && <span className="chat-author">{m.author}</span>}
              <div className="chat-bubble">
                {m.removed ? (
                  <em>{m.removed === "admin" ? "Removed by PsyAlliance: it contained client information" : "Message removed"}</em>
                ) : isEditing ? (
                  <div className="chat-edit">
                    <textarea
                      value={editing!.body}
                      onChange={(e) => setEditing({ ...editing!, body: e.target.value })}
                      rows={3}
                      maxLength={4000}
                      aria-label="Edit your message"
                      autoFocus
                    />
                    {editing!.error && <p className="chat-error" role="alert">{editing!.error}</p>}
                    <span className="chat-edit-actions">
                      <button type="button" className="btn small-btn" onClick={saveEdit} disabled={editing!.saving}>
                        {editing!.saving ? "Saving…" : "Save"}
                      </button>
                      <button type="button" className="btn ghost small-btn" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </span>
                  </div>
                ) : (
                  <p>{m.body}</p>
                )}
              </div>
              <div className="chat-meta">
                <span>
                  {m.mine ? "You" : m.author.split(",")[0]} &middot; {m.atLabel || when(m.at)}
                  {m.edited && !m.removed ? " · Edited" : ""}
                  {m.pending ? " · Sending…" : ""}
                </span>
                {m.failed && (
                  <span className="chat-failed">
                    Didn&rsquo;t send.{" "}
                    <button type="button" className="plain-button small" onClick={() => retry(m)}>
                      Try again
                    </button>
                  </span>
                )}
                {canEdit && !isEditing && (
                  <button type="button" className="plain-button small" onClick={() => setEditing({ id: m.id, body: m.body })}>
                    Edit
                  </button>
                )}
                {m.mine && !m.removed && !m.pending && !m.failed && m.id > 0 && !isEditing &&
                  (confirmRemove === m.id ? (
                    <span className="chat-confirm">
                      Remove this message?{" "}
                      <button type="button" className="plain-button small danger" onClick={() => remove(m.id)}>
                        Remove
                      </button>{" "}
                      <button type="button" className="plain-button small" onClick={() => setConfirmRemove(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="plain-button small" onClick={() => setConfirmRemove(m.id)}>
                      Remove
                    </button>
                  ))}
                {!m.mine && !m.removed && returnTo && <ReportContent targetType="message" targetId={m.id} returnTo={returnTo} />}
              </div>
              {!m.removed && !m.pending && !m.failed && m.id > 0 && (
                <MessageReactions
                  key={`${m.id}-${m.reactions?.mine || ""}-${JSON.stringify(m.reactions?.counts || {})}`}
                  messageId={m.id}
                  counts={m.reactions?.counts || {}}
                  names={m.reactions?.names || {}}
                  mine={m.reactions?.mine || null}
                  canReact={!m.mine}
                  refresh={false}
                />
              )}
            </li>
          );
        })}
      </ol>
      {canSend ? (
        <form className="chat-compose" onSubmit={send}>
          <label className="sr-only" htmlFor={`chat-${conversationId || title || "new"}`}>
            Your message
          </label>
          <textarea
            id={`chat-${conversationId || title || "new"}`}
            ref={boxRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            rows={2}
            maxLength={4000}
            placeholder={placeholder}
          />
          <button type="submit" className="btn" disabled={!text.trim()}>
            Send
          </button>
        </form>
      ) : (
        cannotSendText && <p className="small chat-cannot">{cannotSendText}</p>
      )}
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      <p className="micro-note">No names, dates or details that identify a client.</p>
    </div>
  );
}
