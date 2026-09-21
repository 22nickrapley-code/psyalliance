"use client";

import { useState } from "react";
import CaseTableRow from "./case-table-row";

type Org = { id: number; name: string };

// Order matches Nick's spec: identity/logistics columns first, treatment
// areas last, since those are the columns someone scans first when looking
// a client up, and the ones that need the least horizontal room come
// narrowest (Sessions/wk only ever holds up to two decimal places).
const COLUMNS = [
  "No.",
  "Client Identifier",
  "State",
  "Sesh Type",
  "Insurance",
  "Rate/session",
  "Sessions/wk",
  "Primary",
  "Secondary",
  "Tertiary",
  "",
];

const NARROW_COLUMNS = new Set(["No.", "State", "Sesh Type", "Rate/session", "Sessions/wk", ""]);

// A divider separates the identity/logistics columns from the clinical
// Primary/Secondary/Tertiary need columns - drawn as a left border on the
// Primary column only, so it reads as a single seam rather than three.
const DIVIDE_BEFORE = new Set(["Primary"]);

function OrgTable({
  title,
  cases,
  books,
  insuranceOptions,
  specialisms,
  updateCase,
  archiveCase,
  warn,
}: {
  title: string;
  cases: any[];
  books: Org[];
  insuranceOptions: any[];
  specialisms: any[];
  updateCase: (formData: FormData) => Promise<void>;
  archiveCase: (formData: FormData) => Promise<void>;
  warn?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? cases : cases.slice(0, 6);
  const remaining = cases.length - visible.length;

  return (
    <div className={`caseload-org-table${warn ? " caseload-org-table-warn" : ""}`}>
      <h3>
        {title} <span className="muted" style={{ fontWeight: 400 }}>({cases.length})</span>
      </h3>
      {warn && (
        <p className="error-banner" style={{ marginTop: 0 }}>
          These clients aren't assigned to a practice. Every active client needs one - edit each row
          below and pick a practice, or archive the ones that no longer belong on your caseload.
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="caseload-table">
          <thead>
            <tr>
              {COLUMNS.map((col, i) => {
                const classes = [
                  NARROW_COLUMNS.has(col) ? "caseload-col-narrow" : null,
                  DIVIDE_BEFORE.has(col) ? "caseload-col-divide" : null,
                ].filter(Boolean).join(" ") || undefined;
                return (
                  <th key={i} className={classes}>{col}</th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <CaseTableRow
                key={c.id}
                c={c}
                books={books}
                insuranceOptions={insuranceOptions}
                specialisms={specialisms}
                updateCase={updateCase}
                archiveCase={archiveCase}
              />
            ))}
          </tbody>
        </table>
      </div>
      {cases.length > 6 && (
        <button type="button" className="case-list-toggle" onClick={() => setExpanded((v) => !v)}>
          <span className="case-list-toggle-arrow" style={{ transform: expanded ? "rotate(90deg)" : "none" }}>
            &#9656;
          </span>
          {expanded ? "Show fewer" : `Show ${remaining} more`}
        </button>
      )}
    </div>
  );
}

// Groups active clients into one table per practice/organization, matching
// Nick's mockup (each org gets its own block rather than one flat list).
// Any legacy client with no practice assigned gets its own flagged group at
// the top rather than being hidden - per Nick's rule, every active client
// must be assigned or archived, and this surfaces the violation for him to
// fix by hand rather than silently guessing an assignment.
export default function ActiveClientsBoard({
  cases,
  books,
  insuranceOptions,
  specialisms,
  updateCase,
  archiveCase,
}: {
  cases: any[];
  books: Org[];
  insuranceOptions: any[];
  specialisms: any[];
  updateCase: (formData: FormData) => Promise<void>;
  archiveCase: (formData: FormData) => Promise<void>;
}) {
  const unassigned = cases.filter((c) => !c.book_of_business_id);
  const byBook = new Map<number, any[]>();
  for (const c of cases) {
    if (!c.book_of_business_id) continue;
    if (!byBook.has(c.book_of_business_id)) byBook.set(c.book_of_business_id, []);
    byBook.get(c.book_of_business_id)!.push(c);
  }

  const groups = Array.from(byBook.entries())
    .map(([bookId, groupCases]) => ({
      bookId,
      name: groupCases[0]?.books_of_business?.name || books.find((b) => b.id === bookId)?.name || "Practice",
      cases: groupCases,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {unassigned.length > 0 && (
        <OrgTable
          title="Needs a practice assigned"
          cases={unassigned}
          books={books}
          insuranceOptions={insuranceOptions}
          specialisms={specialisms}
          updateCase={updateCase}
          archiveCase={archiveCase}
          warn
        />
      )}
      {groups.map((g) => (
        <OrgTable
          key={g.bookId}
          title={g.name}
          cases={g.cases}
          books={books}
          insuranceOptions={insuranceOptions}
          specialisms={specialisms}
          updateCase={updateCase}
          archiveCase={archiveCase}
        />
      ))}
      {groups.length === 0 && unassigned.length === 0 && (
        <p className="muted">No active clients yet, add one above.</p>
      )}
    </>
  );
}
