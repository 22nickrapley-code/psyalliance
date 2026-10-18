"use client";

import { useEffect, useState } from "react";
import type { ThreadMessage } from "@/lib/threads";
import { answerCoverAction } from "./actions";
import { ChatThread } from "../_components/chat-thread";

// One client on an incoming cover request (Nick, 18 Oct): the need, then
// three answers in the availability colours: Accept (green), Ask a question
// (amber) and Can't (red). Asking opens the chat with the colleague right
// here; it works like a text message and stays open, so you can talk it
// through and answer when you're ready. Nothing reloads.
// If someone else took the client first, the database says so and the card
// shows it (release review N16-02).

export type CaseStatus = "sent" | "discussing" | "accepted" | "declined" | "expired";

export function IncomingCase({
  requestId,
  label,
  focus,
  details,
  ownerId,
  ownerName,
  threadTitle,
  initialStatus,
  thread,
  link,
  returnTo,
}: {
  requestId: number;
  label: string;
  focus: string;
  details: [string, string][];
  ownerId: string;
  ownerName: string;
  threadTitle: string;
  initialStatus: CaseStatus;
  // The conversation so far about this client, if there is one.
  thread?: { conversationId: number | null; messages: ThreadMessage[] };
  // Where the colleague lands from their notification.
  link?: string;
  returnTo: string;
}) {
  const ownerFirst = ownerName.replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0];
  const [status, setStatus] = useState<CaseStatus>(initialStatus);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<null | "accepted" | "declined">(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  // A refresh brings news (for example, someone else took the client).
  useEffect(() => {
    if (!touched) setStatus(initialStatus);
  }, [initialStatus, touched]);

  const answer = async (response: "accepted" | "declined") => {
    if (busy) return;
    setError(null);
    setBusy(response);
    const res = await answerCoverAction({ requestId, response, threadTitle });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      if (/already taken on|closed|ended/i.test(res.error)) {
        setTouched(true);
        setStatus("expired");
      }
      return;
    }
    setTouched(true);
    if (res.note) setNote(res.note);
    setStatus(response);
  };

  // The first message also records "asked a question" on the request.
  const firstQuestion = async (body: string) => {
    const res = await answerCoverAction({ requestId, response: "discussing", question: body, threadTitle });
    if (!res.ok) return { ok: false as const, error: res.error };
    setTouched(true);
    setStatus("discussing");
    if (res.note) setNote(res.note);
    if (!res.conversationId || !res.message) return { ok: false as const, error: res.note || "Your question is saved, but it didn't reach the chat. Send it again." };
    return { ok: true as const, message: res.message, conversationId: res.conversationId };
  };

  const answered = status === "accepted" || status === "declined" || status === "expired";
  const hasChat = (thread?.messages.length || 0) > 0;
  const chatOpen = asking || status === "discussing" || hasChat;
  const tone = status === "accepted" ? "green" : status === "declined" ? "red" : status === "expired" ? "grey" : "amber";
  const chip =
    status === "accepted" ? "You accepted" : status === "declined" ? "You can't take this" : status === "expired" ? "Closed" : status === "discussing" ? "In discussion" : "Needs your answer";

  return (
    <section id={`request-${requestId}`} className={`card cover-need tone-${tone}${answered ? " is-answered" : ""}`}>
      <div className="cover-need-head">
        <div>
          <div className="eyebrow">The need &middot; {label}</div>
          <h3>{focus}</h3>
        </div>
        <span className={`hist-chip tone-${tone}`}>{chip}</span>
      </div>
      <dl className="need-rows">
        {details.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {answered && (
        <p className="answered-text" role="status">
          {status === "accepted"
            ? `Accepted. ${ownerFirst} will be in touch about the handoff.`
            : status === "declined"
              ? `You said you can't take ${label}. Thanks for letting ${ownerFirst} know.`
              : error || "Closed: another colleague has taken on this client, or the plan has ended. Nothing more is needed from you."}
        </p>
      )}

      {chatOpen && (
        <div className="inline-thread">
          <ChatThread
            messages={thread?.messages || []}
            conversationId={thread?.conversationId ?? null}
            otherIds={[ownerId]}
            title={threadTitle}
            link={link || null}
            heading={`Your conversation with ${ownerFirst} about ${label}`}
            placeholder={status === "sent" ? `Your question for ${ownerFirst}…` : "Write a message…"}
            returnTo={returnTo}
            autoFocus={asking && status === "sent"}
            emptyText={`Ask ${ownerFirst} anything about ${label} before you answer.`}
            onSend={status === "sent" ? firstQuestion : undefined}
            canSend={status !== "expired"}
          />
        </div>
      )}

      {!answered && (
        <div className="cover-answers" role="group" aria-label={`Your answer for ${label}`}>
          <button type="button" data-acts="" className="btn small-btn answer-btn answer-green" disabled={!!busy} aria-busy={busy === "accepted"} onClick={() => answer("accepted")}>
            {busy === "accepted" ? "Accepting…" : `Accept ${label}`}
          </button>
          {!chatOpen && (
            <button type="button" className="btn small-btn answer-btn answer-amber" disabled={!!busy} onClick={() => setAsking(true)}>
              Ask a question
            </button>
          )}
          <button type="button" data-acts="" className="btn small-btn answer-btn answer-red" disabled={!!busy} aria-busy={busy === "declined"} onClick={() => answer("declined")}>
            {busy === "declined" ? "Saving…" : "Can't take this"}
          </button>
        </div>
      )}
      {status === "accepted" && (
        <a className="text-arrow small" href={`/dashboard/messages?to=${ownerId}`}>
          Message {ownerFirst} &rarr;
        </a>
      )}

      {error && !answered && (
        <p className="deid-error" role="alert">
          {error}
        </p>
      )}
      {note && <p className="micro-note">{note}</p>}
    </section>
  );
}
