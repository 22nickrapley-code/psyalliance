"use client";

import { useState, type ReactNode } from "react";

// Client-side tab toggle for "two views of the same box" UI (Inbox/Sent,
// Incoming/Sent requests, etc.) - both tabs' content is already rendered
// server-side and handed in as `content`, so switching tabs is instant and
// never re-fetches or reloads the page, per Nick's "don't reload the whole
// page just to flip a toggle" note.
export default function ToggleBox({
  tabs,
  defaultTab,
}: {
  tabs: { key: string; label: string; content: ReactNode }[];
  defaultTab?: string;
}) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) || tabs[0];
  return (
    <div>
      <div className="ov-box-toggle" style={{ marginBottom: "0.6rem" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={active === t.key ? "active" : ""}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current?.content}
    </div>
  );
}
