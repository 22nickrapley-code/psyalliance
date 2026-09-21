"use client";

import { useState } from "react";

// Shared "show top N, expand for the rest" behavior - same toggle style
// already used on Caseload's Active Clients list. Items are rendered
// server-side (each already carries its own React key) and just handed to
// this client component to decide how many are currently visible.
export default function ExpandableList({
  items,
  max = 3,
  moreLabelSuffix = "",
  fewerLabel = "Show fewer",
}: {
  items: React.ReactNode[];
  max?: number;
  // Plain text appended after "Show N more" (e.g. " (up to 10)") - kept as a
  // string rather than a callback because this is a client component and a
  // function prop can't be passed to it from a server component (React
  // can't serialize a function across that boundary).
  moreLabelSuffix?: string;
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
          {expanded ? fewerLabel : `Show ${remaining} more${moreLabelSuffix}`}
        </button>
      )}
    </>
  );
}
