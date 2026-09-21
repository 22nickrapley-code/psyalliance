"use client";

import { useState } from "react";

// Shared "show top N, expand for the rest" behavior - same toggle style
// already used on Caseload's Active Clients list. Items are rendered
// server-side (each already carries its own React key) and just handed to
// this client component to decide how many are currently visible.
export default function ExpandableList({
  items,
  max = 3,
  moreLabel,
  fewerLabel = "Show fewer",
}: {
  items: React.ReactNode[];
  max?: number;
  moreLabel?: (remaining: number) => string;
  fewerLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, max);
  const remaining = items.length - visible.length;

  return (
    <>
      {visible}
      {items.length > max && (
        <button type="button" className="case-list-toggle" onClick={() => setExpanded((v) => !v)}>
          <span className="case-list-toggle-arrow" style={{ transform: expanded ? "rotate(90deg)" : "none" }}>
            &#9656;
          </span>
          {expanded ? fewerLabel : moreLabel ? moreLabel(remaining) : `Show ${remaining} more`}
        </button>
      )}
    </>
  );
}
