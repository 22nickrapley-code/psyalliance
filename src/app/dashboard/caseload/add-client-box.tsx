"use client";

import { useRef, useState, useTransition } from "react";
import UsStateDatalist from "@/components/us-state-datalist";
import { createCase, requestNewInsurance } from "./actions";
import CaseloadImportBox from "./import";

type Org = { id: number; name: string };
type LookupOption = { id: number; value: string };

// Collapsed to a single button by default (Nick's spec) - expands to the
// full "add a client" form, with the file-import flow folded into the
// bottom of the same box instead of living as its own separate card. On a
// successful add the box collapses itself back down; on a validation error
// (e.g. no practice picked) createCase redirects with ?error=... and the
// box stays open so the practitioner can fix it.
export default function AddClientBox({
  books,
  insuranceOptions,
  specialisms,
}: {
  books: Org[];
  insuranceOptions: LookupOption[];
  specialisms: LookupOption[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} style={{ marginBottom: "0.5rem" }}>
        + Add a client
      </button>
    );
  }

  return (
    <div className="caseload-add-box">
      <div className="widget-header">
        <h3 style={{ margin: 0 }}>Add a client</h3>
        <button type="button" className="secondary" onClick={() => setExpanded(false)} style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}>
          Close
        </button>
      </div>
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(async () => {
            await createCase(formData);
            setExpanded(false);
            formRef.current?.reset();
          });
        }}
      >
        <div className="field-row">
          <div className="field">
            <label htmlFor="book_of_business_id">Practice</label>
            <select id="book_of_business_id" name="book_of_business_id" defaultValue="" required>
              <option value="" disabled>
                Choose a practice&hellip;
              </option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {books.length === 0 && (
              <p className="muted" style={{ fontSize: "0.76rem", marginTop: "0.3rem" }}>
                Add a practice first under Practices below - every client needs one.
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="private_label">Your private client label (optional, never shared)</label>
            <input id="private_label" name="private_label" type="text" maxLength={24} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" name="city" type="text" placeholder="Austin" />
          </div>
          <div className="field">
            <label htmlFor="state">State</label>
            <input id="state" name="state" type="text" maxLength={24} placeholder="TX or Texas" list="us-states" autoComplete="off" />
            <UsStateDatalist />
          </div>
          <div className="field">
            <label htmlFor="session_type">Session type</label>
            <select id="session_type" name="session_type">
              <option value="F2F">In-person</option>
              <option value="Virtual">Virtual</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="insurance">Insurance</label>
            <select id="insurance" name="insurance" defaultValue="">
              <option value="">-</option>
              {insuranceOptions.map((i) => (
                <option key={i.id} value={i.value}>{i.value}</option>
              ))}
            </select>
            <details style={{ marginTop: "0.35rem" }}>
              <summary className="muted" style={{ fontSize: "0.78rem", cursor: "pointer" }}>
                Not listed? Request it
              </summary>
              <form action={requestNewInsurance} className="field-row" style={{ marginTop: "0.4rem", alignItems: "flex-end" }}>
                <div className="field" style={{ flex: "1 1 180px" }}>
                  <input
                    name="requested_value"
                    type="text"
                    placeholder="Insurance provider name"
                    maxLength={120}
                    required
                    style={{ fontSize: "0.82rem" }}
                  />
                </div>
                <div className="field" style={{ flex: "0 0 auto" }}>
                  <button type="submit" className="secondary" style={{ fontSize: "0.82rem", padding: "0.35rem 0.7rem" }}>
                    Request
                  </button>
                </div>
              </form>
            </details>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="primary_need">Primary need</label>
            <select id="primary_need" name="primary_need" defaultValue="">
              <option value="">-</option>
              {specialisms.map((s) => (
                <option key={s.id} value={s.value}>{s.value}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="secondary_need">Secondary need</label>
            <select id="secondary_need" name="secondary_need" defaultValue="">
              <option value="">-</option>
              {specialisms.map((s) => (
                <option key={s.id} value={s.value}>{s.value}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tertiary_need">Tertiary need</label>
            <select id="tertiary_need" name="tertiary_need" defaultValue="">
              <option value="">-</option>
              {specialisms.map((s) => (
                <option key={s.id} value={s.value}>{s.value}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="rate_per_session">Rate per session ($)</label>
            <input id="rate_per_session" name="rate_per_session" type="number" step="0.01" min="0" />
          </div>
          <div className="field">
            <label htmlFor="sessions_per_week">Sessions per week</label>
            <input id="sessions_per_week" name="sessions_per_week" type="number" step="0.01" min="0" placeholder="1 or 0.5 for biweekly" />
          </div>
        </div>
        <button type="submit" disabled={pending || books.length === 0}>
          {pending ? "Adding…" : "Add client"}
        </button>
      </form>

      <details className="caseload-import-fold">
        <summary>Or import several clients from a file</summary>
        <div style={{ marginTop: "0.75rem" }}>
          <CaseloadImportBox embedded />
        </div>
      </details>
    </div>
  );
}
