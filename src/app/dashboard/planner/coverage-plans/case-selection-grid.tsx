"use client";

import { useState } from "react";

type CaseOption = {
  id: number;
  private_label: string | null;
  primary_need: string | null;
  state: string | null;
};

// Case checkboxes for "Start a new coverage plan," with a Select all/Clear
// all toggle above the grid. Checkboxes stay plain form inputs (name=
// "case_ids") so the surrounding <form action={createPlannerProject}>
// submits them normally; only the toggle button needs client state.
export default function CaseSelectionGrid({ cases }: { cases: CaseOption[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (cases.length === 0) {
    return <p className="muted">No active cases yet.</p>;
  }

  const allSelected = selected.size === cases.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(cases.map((c) => c.id)));
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <button
        type="button"
        className="secondary"
        style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem", marginBottom: "0.6rem" }}
        onClick={toggleAll}
      >
        {allSelected ? "Clear all" : "Select all"}
      </button>
      <div className="checkbox-grid">
        {cases.map((c) => (
          <label key={c.id}>
            <input
              type="checkbox"
              name="case_ids"
              value={c.id}
              checked={selected.has(c.id)}
              onChange={() => toggleOne(c.id)}
            />
            Case #{c.id}{c.private_label ? ` (${c.private_label})` : ""}, {c.primary_need || "no need set"}
            {c.state ? `, ${c.state}` : ""}
          </label>
        ))}
      </div>
    </div>
  );
}
