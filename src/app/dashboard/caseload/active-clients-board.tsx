"use client";

import { useState } from "react";
import CaseTableRow from "./case-table-row";
import { currency } from "@/lib/finance";

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

// Explicit per-column widths (percent, sums to 100) paired with
// table-layout: fixed below - round 1 (white-space: normal + a max-width
// hint) didn't hold because an auto-layout table still sizes columns from
// cell content, so "Rate/session" and "Sessions/wk" kept getting squeezed
// thin enough to visually overlap. A colgroup with fixed widths is the only
// way to guarantee every header gets a stable box to wrap inside.
const COLUMN_WIDTHS = [3, 14, 5, 7, 12, 7, 7, 10, 10, 10, 15];

const NARROW_COLUMNS = new Set(["No.", "State", "Sesh Type", "Rate/session", "Sessions/wk", ""]);

// A divider separates the identity/logistics columns from the clinical
// Primary/Secondary/Tertiary need columns - drawn as a left border on the
// Primary column only, so it reads as a single seam rather than three.
const DIVIDE_BEFORE = new Set(["Primary"]);

// Small stat trio shown in each org's title bar - Total Clients was already
// visible in the "(count)" next to the title, but Nick wanted it repeated
// here alongside the two new figures so all three read together at a glance.
function OrgStats({ cases }: { cases: any[] }) {
  const totalSessions = cases.reduce((sum, c) => sum + (Number(c.sessions_per_week) || 0), 0);
  const ratedCases = cases.filter((c) => c.rate_per_session !== null && c.rate_per_session !== undefined && c.rate_per_session !== "");
  const avgRate = ratedCases.length > 0
    ? ratedCases.reduce((sum, c) => sum + Number(c.rate_per_session), 0) / ratedCases.length
    : null;

  return (
    <div className="caseload-org-stats">
      <div className="caseload-org-stat">
        <div className="value">{cases.length}</div>
        <div className="label">Total clients</div>
      </div>
      <div className="caseload-org-stat">
        <div className="value">{Number.isInteger(totalSessions) ? totalSessions : totalSessions.toFixed(1)}</div>
        <div className="label">Sessions p.w.</div>
      </div>
      <div className="caseload-org-stat">
        <div className="value">{avgRate !== null ? currency(avgRate) : "-"}</div>
        <div className="label">Avg. rate</div>
      </div>
    </div>
  );
}

function OrgTable({
  title,
  cases,
  books,
  insuranceOptions,
  specialisms,
  updateCase,
  archiveCase,
  warn,
  highlightedClientId,
}: {
  title: string;
  cases: any[];
  books: Org[];
  insuranceOptions: any[];
  specialisms: any[];
  updateCase: (formData: FormData) => Promise<void>;
  archiveCase: (formData: FormData) => Promise<void>;
  warn?: boolean;
  highlightedClientId?: number | null;
}) {
  // Auto-expand when the Single Patient Referral match lives past the first
  // 6 rows, so "Find matches" always actually reveals the highlighted row
  // instead of leaving it collapsed out of view.
  const [expanded, setExpanded] = useState(
    () => highlightedClientId != null && cases.slice(6).some((c) => c.id === highlightedClientId)
  );
  const visible = expanded ? cases : cases.slice(0, 6);
  const remaining = cases.length - visible.length;

  return (
    <div className={`caseload-org-table${warn ? " caseload-org-table-warn" : ""}`}>
      <div className="caseload-org-table-head">
        <h3>
          {title} <span className="muted" style={{ fontWeight: 400 }}>({cases.length})</span>
        </h3>
        <OrgStats cases={cases} />
      </div>
      {warn && (
        <p className="error-banner" style={{ marginTop: 0 }}>
          These clients aren't assigned to a practice. Every active client needs one - edit each row
          below and pick a practice, or archive the ones that no longer belong on your caseload.
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="caseload-table caseload-org-fixed">
          <colgroup>
            {COLUMN_WIDTHS.map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
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
                sprMatched={highlightedClientId != null && c.id === highlightedClientId}
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
  highlightedClientId,
}: {
  cases: any[];
  books: Org[];
  insuranceOptions: any[];
  specialisms: any[];
  updateCase: (formData: FormData) => Promise<void>;
  archiveCase: (formData: FormData) => Promise<void>;
  highlightedClientId?: number | null;
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
          highlightedClientId={highlightedClientId}
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
          highlightedClientId={highlightedClientId}
        />
      ))}
      {groups.length === 0 && unassigned.length === 0 && (
        <p className="muted">No active clients yet, add one above.</p>
      )}
    </>
  );
}
