"use client";

import { useMemo, useState } from "react";

type PastCase = {
  id: number;
  private_label: string | null;
  org: string | null;
  state: string | null;
  rate: number | null;
};

// Collapsed to a single button by default, matching AddClientBox's exact
// pattern and styling - per Nick's note that Past Clients shouldn't be an
// always-open section, it should be a button (like "+ Add a client") that
// drops down into the list when clicked. Search inside it is local state,
// not a GET form, so it filters instantly with no page reload either.
export default function PastClientsBox({
  cases,
  reactivateCase,
  deleteCase,
}: {
  cases: PastCase[];
  reactivateCase: (formData: FormData) => Promise<void>;
  deleteCase: (formData: FormData) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");

  if (!expanded) {
    return (
      <button type="button" className="secondary" onClick={() => setExpanded(true)}>
        Past clients ({cases.length})
      </button>
    );
  }

  const qq = q.trim().toLowerCase();
  const filtered = cases.filter((c) => {
    if (!qq) return true;
    return (
      (c.private_label || "").toLowerCase().includes(qq) ||
      (c.org || "").toLowerCase().includes(qq) ||
      (c.state || "").toLowerCase().includes(qq) ||
      String(c.id).includes(qq)
    );
  });

  return (
    <div className="caseload-add-box" style={{ flex: "1 1 100%" }}>
      <div className="widget-header">
        <h3 style={{ margin: 0 }}>Past clients ({cases.length})</h3>
        <button type="button" className="secondary" onClick={() => setExpanded(false)} style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}>
          Close
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Anyone archived from your caseload. Re-add a past client and their record keeps the same
        number and details, no need to re-enter anything.
      </p>
      {cases.length > 0 ? (
        <>
          <div className="field" style={{ maxWidth: 320, marginBottom: "0.75rem" }}>
            <label htmlFor="past-q">Search past clients</label>
            <input
              id="past-q"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Label, organization, state, or client #"
            />
          </div>
          <table>
            <thead>
              <tr>
                <th>Client #</th>
                <th>Label</th>
                <th>Organization</th>
                <th>State</th>
                <th>Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>#{c.id}</td>
                  <td>{c.private_label || <span className="muted">-</span>}</td>
                  <td>{c.org || <span className="muted">-</span>}</td>
                  <td>{c.state || "-"}</td>
                  <td>{c.rate ? `$${c.rate}` : "-"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <form action={reactivateCase} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="secondary" style={{ marginRight: "0.35rem" }}>Re-add to caseload</button>
                    </form>
                    <form
                      action={deleteCase}
                      style={{ display: "inline" }}
                      onSubmit={(e) => {
                        if (!confirm(`Permanently delete client ${c.private_label || `#${c.id}`}? This can't be undone.`)) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="danger">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">No past clients match that search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      ) : (
        <p className="muted">No archived clients yet.</p>
      )}
    </div>
  );
}
