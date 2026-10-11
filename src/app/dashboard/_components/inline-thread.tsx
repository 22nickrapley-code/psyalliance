import type { ThreadMessage } from "@/lib/threads";
import { replyInThreadAction } from "../thread-actions";

// A conversation shown where it belongs: under the client on a cover
// request, or on a referral. Both people see the same messages here and in
// Messages, and can reply from either place.
const when = (d: string) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export function InlineThread({
  messages,
  otherName,
  otherIds,
  title,
  returnTo,
  anchor,
  link,
  conversationId,
  heading,
  placeholder,
}: {
  messages: ThreadMessage[];
  otherName: string;
  otherIds: string[];
  title: string;
  returnTo: string;
  anchor?: string;
  // Where the other person lands from their notification.
  link?: string;
  conversationId?: number | null;
  heading?: string;
  placeholder?: string;
}) {
  const first = otherName.replace(/^(Dr\.?)\s+/i, "").split(/[\s,]+/)[0];
  return (
    <div className="inline-thread">
      <div className="it-head">
        <b>{heading || `Conversation with ${otherName}`}</b>
        {conversationId && (
          <a className="it-open" href={`/dashboard/messages/${conversationId}`}>
            Also in Messages
          </a>
        )}
      </div>
      {messages.length > 0 ? (
        <ol className="it-list">
          {messages.map((m) => (
            <li key={m.id} className={m.mine ? "mine" : undefined}>
              <p>{m.body}</p>
              <small>
                {m.mine ? "You" : m.author} &middot; {when(m.at)}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="it-empty small">No messages yet.</p>
      )}
      <form action={replyInThreadAction} className="it-reply" data-deidentify="">
        {otherIds.map((id) => (
          <input key={id} type="hidden" name="other_ids" value={id} />
        ))}
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="return_to" value={returnTo} />
        {anchor && <input type="hidden" name="anchor" value={anchor} />}
        {link && <input type="hidden" name="link" value={link} />}
        <label className="sr-only" htmlFor={`reply-${anchor || title}`}>
          Reply to {first}
        </label>
        <textarea id={`reply-${anchor || title}`} name="body" rows={2} maxLength={2000} required placeholder={placeholder || `Reply to ${first}…`} />
        <button type="submit" className="btn small-btn">
          Send
        </button>
      </form>
      <p className="micro-note">No names, dates or details that identify a client.</p>
    </div>
  );
}
