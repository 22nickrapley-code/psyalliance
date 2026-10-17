"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { identifierError } from "@/lib/deidentify";
import { answerCoverAction } from "./actions";

// One client on an incoming cover request. Accept, Decline and "+ Ask a
// question first" answer it in place, without reloading (Nick, 13 Oct):
// - Accepted or declined, the client folds into a short line with what
//   happened, and stays on screen.
// - A question opens a box under the client; once sent it turns into a
//   "Sent" note and stays, so the member can move on to the next client.
// - If someone else took the client first, the database says so and the
//   card shows it (release review N16-02).

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
  children,
}: {
  requestId: number;
  label: string;
  focus: string;
  details: [string, string][];
  ownerId: string;
  ownerName: string;
  threadTitle: string;
  initialStatus: CaseStatus;
  // The conversation so far, when a question was asked earlier.
  children?: ReactNode;
}) {
  const ownerFirst = ownerName.replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0];
  const [status, setStatus] = useState<CaseStatus>(initialStatus);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<null | "accepted" | "declined" | "discussing">(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // A refresh brings news (for example, someone else took the client).
  useEffect(() => {
    if (!touched) setStatus(initialStatus);
  }, [initialStatus, touched]);

  useEffect(() => {
    if (asking) box.current?.focus();
  }, [asking]);

  const answer = async (response: "accepted" | "declined" | "discussing") => {
    if (busy) return;
    setError(null);
    if (response === "discussing") {
      const q = question.trim();
      if (!q) return setError("Write your question first.");
      const idErr = identifierError(q);
      if (idErr) return setError(`${idErr} Everything else you wrote is still here.`);
    }
    setBusy(response);
    const res = await answerCoverAction({ requestId, response, question: response === "discussing" ? question : undefined, threadTitle });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      // The request closed meanwhile: show it as closed.
      if (/already taken on|closed|ended/i.test(res.error)) {
        setTouched(true);
        setStatus("expired");
      }
      return;
    }
    setTouched(true);
    if (res.note) setNote(res.note);
    if (response === "discussing") {
      setSent(question.trim());
      setAsking(false);
      setQuestion("");
      setStatus("discussing");
    } else {
      setStatus(response);
    }
    // The save itself brings the page's new counts back with it (the action
    // revalidates /dashboard/cover); a second refresh on top of it raced
    // and sometimes left the screen waiting (release testing NAV-01).
  };

  const facts = details.map(([, v]) => v).filter((v) => v && v !== "Not stated");

  if (status === "accepted" || status === "declined" || status === "expired") {
    const text =
      status === "accepted"
        ? `Accepted. ${ownerFirst} will be in touch about the handoff.`
        : status === "declined"
          ? `Declined. Thanks for letting ${ownerFirst} know.`
          : error || "Closed: another colleague has taken on this client, or the plan has ended. Nothing more is needed from you.";
    return (
      <div id={`request-${requestId}`} className={`incoming-case is-answered is-${status}`} role="status">
        <span className="answered-mark" aria-hidden="true">{status === "accepted" ? "✓" : status === "declined" ? "–" : "·"}</span>
        <div className="answered-body">
          <div className="answered-top">
            <strong>
              {label} &middot; {focus}
            </strong>
            <span className={`status ${status === "accepted" ? "" : "neutral"}`}>{status === "accepted" ? "Accepted" : status === "declined" ? "Declined" : "Closed"}</span>
          </div>
          <p className="answered-text">{text}</p>
          {facts.length > 0 && <p className="answered-facts">{facts.join(" · ")}</p>}
          {note && <p className="micro-note">{note}</p>}
          {status === "accepted" && (
            <a className="text-arrow small" href={`/dashboard/messages?to=${ownerId}`}>
              Message {ownerFirst} &rarr;
            </a>
          )}
        </div>
      </div>
    );
  }

  const discussing = status === "discussing";
  return (
    <div id={`request-${requestId}`} className={`incoming-case${discussing ? " is-discussing" : ""}`}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <strong>
          {label} &middot; {focus}
        </strong>
        {discussing && <span className="status warn">In discussion</span>}
      </div>
      <dl className="case-facts">
        {details.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {discussing && !sent && children}

      {sent && (
        <div className="ask-box is-sent" role="status">
          <span className="ask-sent-tag">&#10003; Sent</span>
          <p className="ask-sent-text">&ldquo;{sent}&rdquo;</p>
          <small>
            Sent to {ownerName}. Their reply appears here, under {label}, and in Messages. You can still accept or decline whenever you&rsquo;re ready.
          </small>
        </div>
      )}

      <div className="cover-reply-row" role="group" aria-label={`Your answer for ${label}`}>
        <button type="button" data-acts="" className="btn small-btn resp-accept" disabled={!!busy} aria-busy={busy === "accepted"} onClick={() => answer("accepted")}>
          {busy === "accepted" ? "Accepting…" : `Accept ${label}`}
        </button>
        <button type="button" data-acts="" className="btn small-btn resp-decline" disabled={!!busy} aria-busy={busy === "declined"} onClick={() => answer("declined")}>
          {busy === "declined" ? "Declining…" : "Decline"}
        </button>
        {!discussing && !sent && !asking && (
          <button type="button" className="btn small-btn resp-discuss" disabled={!!busy} aria-expanded={false} onClick={() => setAsking(true)}>
            + Ask a question first
          </button>
        )}
      </div>

      {asking && (
        <div className="ask-box">
          <label className="field" htmlFor={`q-${requestId}`}>
            Your question for {ownerFirst}
          </label>
          <textarea
            ref={box}
            id={`q-${requestId}`}
            rows={3}
            maxLength={600}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`e.g. Could we talk through the schedule for ${label} and how you'd like the handoff to work?`}
          />
          <small>No client-identifying details. {ownerFirst}&rsquo;s reply appears here, under {label}.</small>
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            <button type="button" data-acts="" className="btn small-btn" disabled={!!busy} aria-busy={busy === "discussing"} onClick={() => answer("discussing")}>
              {busy === "discussing" ? "Sending…" : "Send question"}
            </button>
            <button type="button" className="btn ghost small-btn" disabled={!!busy} onClick={() => { setAsking(false); setError(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="deid-error" role="alert">
          {error}
        </p>
      )}
      {note && <p className="micro-note">{note}</p>}
    </div>
  );
}
