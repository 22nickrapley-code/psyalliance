"use client";

import { useState } from "react";
import CaseRow from "./case-row";

// Nick's Sept 20 feedback: the old <details>/<summary> accordion put the
// "Show N more" toggle BETWEEN the top-3 rows and the rest - so clicking it
// left the toggle line sitting awkwardly in the middle of what now reads as
// one continuous list, instead of at the end of it. This renders every
// currently-visible row first and puts the toggle after all of them, always
// at the bottom of whatever's showing - collapsed or expanded - the way a
// "show more" control reads on any list-based feed.
export default function ActiveClientsList({
  topCases,
  remainingCases,
  books,
  insuranceOptions,
  specialisms,
  updateCase,
  archiveCase,
}: {
  topCases: any[];
  remainingCases: any[];
  books: any[];
  insuranceOptions: any[];
  specialisms: any[];
  updateCase: (formData: FormData) => Promise<void>;
  archiveCase: (formData: FormData) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleCases = expanded ? [...topCases, ...remainingCases] : topCases;

  return (
    <>
      {visibleCases.map((c) => (
        <CaseRow
          key={c.id}
          c={c}
          books={books}
          insuranceOptions={insuranceOptions}
          specialisms={specialisms}
          updateCase={updateCase}
          archiveCase={archiveCase}
        />
      ))}
      {remainingCases.length > 0 && (
        <button type="button" className="case-list-toggle" onClick={() => setExpanded((v) => !v)}>
          <span className="case-list-toggle-arrow" style={{ transform: expanded ? "rotate(90deg)" : "none" }}>
            &#9656;
          </span>
          {expanded ? "Show fewer clients" : `Show ${remainingCases.length} more active client${remainingCases.length === 1 ? "" : "s"}`}
        </button>
      )}
    </>
  );
}
