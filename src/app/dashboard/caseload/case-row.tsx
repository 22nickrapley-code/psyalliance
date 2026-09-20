"use client";

import { useState, useTransition } from "react";
import UsStateDatalist from "@/components/us-state-datalist";
import { requestNewInsurance } from "./actions";

type Org = { id: number; name: string };
type LookupOption = { id: number; value: string };

// Every field on an active client, editable in place - click Edit, the
// compact row swaps for a small form pre-filled with the current values,
// Save writes it via the updateCase server action (passed in as a prop
// since this needs to be a client component to hold the isEditing/pending
// state) and the row snaps back to its compact display once the save
// completes and the page's server data has been revalidated.
export default function CaseRow({
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

  if (!editing) {
    return (
      <div className="case-row">
        <span className="case-num">#{c.id}</span>
        <span className="case-label">{c.private_label || <span className="muted">Unlabeled</span>}</span>
        <span className="case-meta">
          <span className="case-org">
            {c.books_of_business?.name || <span className="muted">-</span>}
            {c.state ? ` · ${c.state}` : ""}
          </span>
          <span className="case-rate">{c.rate_per_session ? `$${c.rate_per_session}` : "-"}</span>
          <span className="case-sessions muted">{c.sessions_per_week ?? "-"}/wk</span>
        </span>
        <span className="case-row-actions">
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
        </span>
      </div>
    );
  }

  return (
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
          <select name="book_of_business_id" defaultValue={c.book_of_business_id ?? ""}>
            <option value="">-</option>
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
  );
}
