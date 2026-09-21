"use client";

import { useState, useTransition } from "react";
import UsStateDatalist from "@/components/us-state-datalist";
import { requestNewInsurance } from "./actions";
import { useCaseloadHighlight, matchesHighlight } from "./caseload-context";

type Org = { id: number; name: string };
type LookupOption = { id: number; value: string };

// Literal spreadsheet-style row: No. / Client Identifier / State / Sesh Type
// / Insurance / Primary / Secondary / Tertiary / Rate / Sessions per week /
// Actions, matching Nick's Excel mockup. Edit mode swaps the row for a
// colSpan'd cell wrapping the same field-row form that was already working
// (and already verified) in the old card-style layout - only the container
// changed, not the editing UX itself.
export default function CaseTableRow({
  c,
  books,
  insuranceOptions,
  specialisms,
  updateCase,
  archiveCase,
}: {
  c: any;
  books: Org[];
  insuranceOptions: LookupOption[];
  specialisms: LookupOption[];
  updateCase: (formData: FormData) => Promise<void>;
  archiveCase: (formData: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { highlight } = useCaseloadHighlight();
  const isHighlighted = matchesHighlight(c, highlight);

  function cellClass(field: "primary_need" | "secondary_need" | "tertiary_need") {
    if (!highlight.value) return undefined;
    const areaMatches = highlight.area === "all" || highlight.area === field.replace("_need", "");
    return areaMatches && c[field] === highlight.value ? "caseload-cell-match" : undefined;
  }

  if (!editing) {
    return (
      <tr className={isHighlighted ? "caseload-row-match" : undefined}>
        <td>#{c.id}</td>
        <td>{c.private_label || <span className="muted">Unlabeled</span>}</td>
        <td>{c.state || <span className="muted">-</span>}</td>
        <td>{c.session_type === "Virtual" ? "Virtual" : c.session_type === "F2F" ? "In-person" : <span className="muted">-</span>}</td>
        <td>{c.insurance || <span className="muted">-</span>}</td>
        <td className={cellClass("primary_need")}>{c.primary_need || <span className="muted">-</span>}</td>
        <td className={cellClass("secondary_need")}>{c.secondary_need || <span className="muted">-</span>}</td>
        <td className={cellClass("tertiary_need")}>{c.tertiary_need || <span className="muted">-</span>}</td>
        <td>{c.rate_per_session ? `$${c.rate_per_session}` : <span className="muted">-</span>}</td>
        <td>{c.sessions_per_week ?? <span className="muted">-</span>}</td>
        <td className="case-row-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setEditing(true)}
            style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem", marginRight: "0.35rem" }}
          >
            Edit
          </button>
          <form action={archiveCase} style={{ display: "inline" }}>
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className="secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }}>
              Archive
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={11}>
        <form
          className="case-row-edit"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            startTransition(async () => {
              await updateCase(formData);
              setEditing(false);
            });
          }}
        >
          <input type="hidden" name="id" value={c.id} />
          <div className="field-row">
            <div className="field">
              <label>Label</label>
              <input name="private_label" type="text" maxLength={24} defaultValue={c.private_label || ""} />
            </div>
            <div className="field">
              <label>Practice</label>
              <select name="book_of_business_id" defaultValue={c.book_of_business_id ?? ""} required>
                <option value="" disabled>
                  Choose a practice&hellip;
                </option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>City</label>
              <input name="city" type="text" defaultValue={c.city || ""} />
            </div>
            <div className="field">
              <label>State</label>
              <input name="state" type="text" maxLength={24} defaultValue={c.state || ""} placeholder="TX or Texas" list="us-states" autoComplete="off" />
              <UsStateDatalist />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Session type</label>
              <select name="session_type" defaultValue={c.session_type || "F2F"}>
                <option value="F2F">In-person</option>
                <option value="Virtual">Virtual</option>
              </select>
            </div>
            <div className="field">
              <label>Insurance</label>
              <select name="insurance" defaultValue={c.insurance || ""}>
                <option value="">-</option>
                {insuranceOptions.map((i) => (
                  <option key={i.id} value={i.value}>{i.value}</option>
                ))}
              </select>
              <details style={{ marginTop: "0.3rem" }}>
                <summary className="muted" style={{ fontSize: "0.74rem", cursor: "pointer" }}>Not listed? Request it</summary>
                <form action={requestNewInsurance} className="field-row" style={{ marginTop: "0.3rem", alignItems: "flex-end" }}>
                  <div className="field" style={{ flex: "1 1 160px" }}>
                    <input name="requested_value" type="text" placeholder="Insurance provider name" maxLength={120} required style={{ fontSize: "0.8rem" }} />
                  </div>
                  <div className="field" style={{ flex: "0 0 auto" }}>
                    <button type="submit" className="secondary" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>Request</button>
                  </div>
                </form>
              </details>
            </div>
            <div className="field">
              <label>Rate per session ($)</label>
              <input name="rate_per_session" type="number" step="0.01" min="0" defaultValue={c.rate_per_session ?? ""} />
            </div>
            <div className="field">
              <label>Sessions per week</label>
              <input name="sessions_per_week" type="number" step="0.01" min="0" defaultValue={c.sessions_per_week ?? ""} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Primary need</label>
              <select name="primary_need" defaultValue={c.primary_need || ""}>
                <option value="">-</option>
                {specialisms.map((s) => (
                  <option key={s.id} value={s.value}>{s.value}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Secondary need</label>
              <select name="secondary_need" defaultValue={c.secondary_need || ""}>
                <option value="">-</option>
                {specialisms.map((s) => (
                  <option key={s.id} value={s.value}>{s.value}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Tertiary need</label>
              <select name="tertiary_need" defaultValue={c.tertiary_need || ""}>
                <option value="">-</option>
                {specialisms.map((s) => (
                  <option key={s.id} value={s.value}>{s.value}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
            <button type="button" className="secondary" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}
