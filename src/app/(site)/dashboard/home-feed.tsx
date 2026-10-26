"use client";

import { useState } from "react";
import { PersonAvatar } from "./_components/relationship";
import { setConsultOpenAction } from "./availability/actions";

// Home's consultation feed (Nick, 18 Oct): the discussions most relevant to
// this member, six at a time. Each card opens the discussion to reply.

export type HomeFeedItem = {
  id: number;
  question: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  when: string;
  replies: number;
  open: boolean;
  mine: boolean;
  reason: string;
  trustedJoined: { id: string; name: string }[];
};

const first = (name: string) => name.replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0];

function joined(list: { name: string }[]) {
  const names = list.map((p) => first(p.name));
  if (names.length === 1) return `${names[0]} replied`;
  if (names.length === 2) return `${names[0]} and ${names[1]} replied`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more replied`;
}

export function ConsultFeed({ items, quiet }: { items: HomeFeedItem[]; quiet: boolean }) {
  const [shown, setShown] = useState(6);
  if (quiet) {
    return (
      <section className="card home-feed quiet" aria-labelledby="feed-title">
        <div className="home-card-head">
          <div>
            <div className="eyebrow">Consultation</div>
            <h3 id="feed-title">Your consult feed is quiet</h3>
          </div>
        </div>
        <p className="small">
          You&rsquo;ve set consult to <b>Not now</b>, so colleagues don&rsquo;t send you consult questions and discussions aren&rsquo;t shown here. You can still ask
          your own questions in Consult.
        </p>
        <form action={setConsultOpenAction} className="home-card-actions">
          <input type="hidden" name="return_to" value="/dashboard" />
          <button type="submit" className="btn small-btn">Open to consult</button>
          <a className="btn ghost small-btn" href="/dashboard/consult">Go to Consult &rarr;</a>
        </form>
      </section>
    );
  }
  return (
    <section className="card home-feed" aria-labelledby="feed-title">
      <div className="home-card-head">
        <div>
          <div className="eyebrow">Consultation</div>
          <h3 id="feed-title">Discussions for you</h3>
        </div>
        <a className="btn ghost small-btn" href="/dashboard/consult">All discussions &rarr;</a>
      </div>
      {items.length === 0 ? (
        <div className="feed-empty">
          <p className="small">
            No discussions for you yet. Questions from your trusted colleagues, replies to your own questions and anything in your specialties show up here.
          </p>
          <a className="btn small-btn" href="/dashboard/consult/new">Ask colleagues a question</a>
        </div>
      ) : (
        <>
          <ol className="feed-list">
            {items.slice(0, shown).map((f) => (
              <li key={f.id} className={`feed-card${f.mine ? " mine" : ""}`}>
                <PersonAvatar name={f.authorName} url={f.authorAvatarUrl} id={f.authorId} size={40} rel={f.mine ? "you" : undefined} />
                <div className="feed-body">
                  <div className="feed-meta">
                    {f.mine ? <b>You asked</b> : <a href={`/dashboard/people/${f.authorId}`}><b>{f.authorName}</b></a>}
                    <span>&middot; {f.when}</span>
                    <span className="feed-reason">{f.reason}</span>
                  </div>
                  <a className="feed-q" href={`/dashboard/consult/${f.id}`}>
                    {f.question}
                  </a>
                  <div className="feed-foot">
                    <span>{f.replies === 0 ? "No replies yet" : `${f.replies} repl${f.replies === 1 ? "y" : "ies"}`}</span>
                    {f.trustedJoined.length > 0 && (
                      <span className="feed-joined">
                        <span className="feed-faces" aria-hidden="true">
                          {f.trustedJoined.map((p) => (
                            <PersonAvatar key={p.id} name={p.name} id={p.id} size={22} />
                          ))}
                        </span>
                        {joined(f.trustedJoined)}
                      </span>
                    )}
                    <span className={`status ${f.open ? "warn" : "neutral"}`}>{f.open ? "Open" : "Answered"}</span>
                    <a className="feed-go" href={`/dashboard/consult/${f.id}`}>
                      {f.mine ? "See replies" : f.open ? "Join the discussion" : "Read"} &rarr;
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {items.length > shown && (
            <button type="button" className="btn ghost small-btn feed-more" onClick={() => setShown((n) => n + 6)}>
              Show more
            </button>
          )}
        </>
      )}
    </section>
  );
}
