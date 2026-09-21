"use client";

import { useState } from "react";
import { createBookOfBusiness, deleteOrganization } from "./actions";

type Book = { id: number; name: string; expense_burden_pct: number };

// Compact/collapsible per Nick's spec: once at least one practice is set up,
// this shrinks to a small summary line you expand to manage. "Share of
// hourly rate you keep" was confusing (read like a fee, not a retention
// share) - relabeled to "% of hourly client rate retained" everywhere it
// appears, wording unchanged in the database, just the label shown.
export default function PracticesBox({ books }: { books: Book[] }) {
  const [expanded, setExpanded] = useState(books.length === 0);

  return (
    <div className="card">
      <div className="widget-header">
        <h2 style={{ margin: 0 }}>Practices</h2>
        {books.length > 0 && (
          <button type="button" className="secondary" onClick={() => setExpanded((v) => !v)} style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}>
            {expanded ? "Collapse" : `Manage (${books.length})`}
          </button>
        )}
      </div>
      {!expanded && books.length > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {books.map((b) => `${b.name} (${Math.round(b.expense_burden_pct * 100)}%)`).join(" · ")}
        </p>
      )}
      {expanded && (
        <>
          <p className="muted">
            Your own private practice, or a group practice/consultancy you're employed by or
            contracted to, each keeps a different share of the billed rate.
          </p>
          <table style={{ marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>% of hourly client rate retained</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{Math.round(b.expense_burden_pct * 100)}%</td>
                  <td>
                    <form action={deleteOrganization}>
                      <input type="hidden" name="id" value={b.id} />
                      <button type="submit" className="secondary">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
              {books.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">No practices yet, add one below.</td>
                </tr>
              )}
            </tbody>
          </table>
          <form action={createBookOfBusiness} className="field-row" style={{ alignItems: "flex-end" }}>
            <div className="field">
              <label htmlFor="name">Practice name</label>
              <input id="name" name="name" type="text" placeholder="e.g. my own practice, or the consultancy's name" required />
            </div>
            <div className="field" style={{ maxWidth: 260 }}>
              <label htmlFor="expense_burden_pct">% of hourly client rate retained</label>
              <input id="expense_burden_pct" name="expense_burden_pct" type="number" step="0.01" min="0" max="1" defaultValue="0.85" required />
              <p className="muted" style={{ marginTop: "0.3rem", marginBottom: 0, fontSize: "0.78rem" }}>
                As a decimal, not a percent: 0.85 = 85%.
              </p>
            </div>
            <div className="field" style={{ flex: "0 0 auto" }}>
              <button type="submit">Add</button>
            </div>
          </form>
          <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            For your own private practice this is usually 1 (100%), you keep everything you bill.
            If you're employed by or contracted to a group practice or consultancy, enter the share
            of the billed hourly rate you take home after their cut, e.g. if they bill $200/hr and
            you're paid $140, enter 0.70.
          </p>
        </>
      )}
    </div>
  );
}
