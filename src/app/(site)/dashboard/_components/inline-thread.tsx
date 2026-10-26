import type { ThreadMessage } from "@/lib/threads";
import { ChatThread } from "./chat-thread";

// A conversation shown where it belongs: under the client on a cover
// request, or on a referral. Both people see the same messages here and in
// Messages, and it works like a chat (Nick, 18 Oct): the box stays put and
// what you send appears above it, without the page reloading.
export function InlineThread({
  messages,
  otherIds,
  title,
  returnTo,
  anchor,
  link,
  conversationId,
  heading,
  placeholder,
  autoFocus,
  emptyText,
}: {
  messages: ThreadMessage[];
  otherName?: string;
  otherIds: string[];
  title: string;
  returnTo: string;
  anchor?: string;
  // Where the other person lands from their notification.
  link?: string;
  conversationId?: number | null;
  heading?: string;
  placeholder?: string;
  autoFocus?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="inline-thread" id={anchor ? `${anchor}-chat` : undefined}>
      <ChatThread
        messages={messages}
        conversationId={conversationId ?? null}
        otherIds={otherIds}
        title={title}
        link={link || null}
        heading={heading}
        placeholder={placeholder || "Write a message…"}
        returnTo={returnTo}
        autoFocus={autoFocus}
        emptyText={emptyText}
      />
    </div>
  );
}
