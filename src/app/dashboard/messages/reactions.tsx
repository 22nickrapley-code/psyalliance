"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reactToMessageAction } from "./actions";

export type Reaction = "like" | "dislike" | "heart";
export const REACTIONS: { key: Reaction; glyph: string; label: string }[] = [
  { key: "like", glyph: "👍", label: "Thumbs up" },
  { key: "heart", glyph: "❤️", label: "Heart" },
  { key: "dislike", glyph: "👎", label: "Thumbs down" },
];

// Reactions under a message, and a small picker to add yours. A reaction is
// a quick "seen it": it doesn't notify or reorder the inbox.
export function MessageReactions({
  messageId,
  counts,
  mine,
  names,
  canReact,
}: {
  messageId: number;
  counts: Partial<Record<Reaction, number>>;
  mine: Reaction | null;
  names: Partial<Record<Reaction, string[]>>;
  canReact: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<Reaction | null>(mine);
  const [pending, start] = useTransition();
  const shown = { ...counts } as Record<Reaction, number>;
  // Reflect the change straight away; the server confirms on refresh.
  if (mine !== current) {
    if (mine) shown[mine] = Math.max(0, (shown[mine] || 0) - 1);
    if (current) shown[current] = (shown[current] || 0) + 1;
  }
  const pick = (r: Reaction) => {
    const next = current === r ? null : r;
    setCurrent(next);
    start(async () => {
      const res = await reactToMessageAction(messageId, r);
      if (!res.ok) setCurrent(mine);
      router.refresh();
    });
  };
  const chips = REACTIONS.filter((r) => (shown[r.key] || 0) > 0);
  return (
    <div className={`reactions${pending ? " pending" : ""}`}>
      {chips.map((r) => {
        const who = (names[r.key] || []).join(", ");
        return (
          <button
            key={r.key}
            type="button"
            className={`reaction-chip${current === r.key ? " mine" : ""}`}
            onClick={() => canReact && pick(r.key)}
            disabled={!canReact}
            title={who || r.label}
            aria-label={`${r.label}: ${shown[r.key]}${current === r.key ? ", including you" : ""}`}
          >
            <span aria-hidden="true">{r.glyph}</span>
            {shown[r.key] > 1 && <b>{shown[r.key]}</b>}
          </button>
        );
      })}
      {canReact && (
        <span className="reaction-picker" role="group" aria-label="React to this message">
          {REACTIONS.map((r) => (
            <button key={r.key} type="button" className={current === r.key ? "on" : ""} onClick={() => pick(r.key)} aria-pressed={current === r.key} title={r.label}>
              <span aria-hidden="true">{r.glyph}</span>
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
