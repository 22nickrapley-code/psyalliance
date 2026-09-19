import { createClient } from "@/lib/supabase/server";
import { createBookOfBusiness, createCase, archiveCase, deleteOrganization } from "./actions";
import CaseloadImportBox from "./import";

export default async function CaseloadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: books }, { data: cases }, { data: specialisms }] = await Promise.all([
    supabase.from("books_of_business").select("*").eq("profile_id", user!.id).eq("is_active", true),
    supabase
      .from("caseload_clients")
      .select("*, books_of_business(name)")
      .eq("profile_id", user!.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase.from("lookup_values").select("id, value").eq("category", "treatment_specialism").order("value"),
  ]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Caseload</h1>
          <p className="muted">
            Every case is referenced by its case number, never a name. Your private client label
            is your own optional shorthand and is never shown to anyone else.
          </p>
        </div>
        <a href="/api/export/caseload" className="btn secondary" style={{ flex: "0 0 auto" }}>
          Export CSV
        </a>
      </div>

      <div className="card">
        <h2>Organizations</h2>
        <p className="muted">
          Your own private practice, or a group practice/consultancy you're employed by or
          contracted to, each keeps a different share of the billed rate.
        </p>
        <table style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>% of hourly rate retained</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(books || []).map((b) => (
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
            {(books || []).length === 0 && (
              <tr>
                <td colSpan={3} className="muted">No organizations yet, add one below.</td>
              </tr>
            )}
          </tbody>
        </table>
        <form action={createBookOfBusiness} className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label htmlFor="name">Organization name</label>
            <input id="name" name="name" type="text" placeholder="e.g. my own practice, or the consultancy's name" required />
          </div>
          <div className="field" style={{ maxWidth: 220 }}>
            <label htmlFor="expense_burden_pct">% of hourly rate retained (0–1)</label>
            <input id="expense_burden_pct" name="expense_burden_pct" type="number" step="0.01" min="0" max="1" defaultValue="0.85" required />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit">Add</button>
          </div>
        </form>
        <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          For your own private practice this is usually 100%. If you're employed by or contracted
          to a group practice or consultancy, enter the percentage of the billed hourly rate you
          take home after their commission, e.g. if they bill $200/hr and you're paid 70%, enter
          0.70.
        </p>
      </div>

      <CaseloadImportBox />

      <div className="card">
        <h2>Add a case</h2>
        <form action={createCase}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="book_of_business_id">Organization</label>
              <select id="book_of_business_id" name="book_of_business_id">
                <option value="">-</option>
                {(books || []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
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
              <input id="state" name="state" type="text" maxLength={2} placeholder="TX" />
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
              <input id="insurance" name="insurance" type="text" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="primary_need">Primary need</label>
              <select id="primary_need" name="primary_need" defaultValue="">
                <option value="">-</option>
                {(specialisms || []).map((s) => (
                  <option key={s.id} value={s.value}>{s.value}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="secondary_need">Secondary need</label>
              <select id="secondary_need" name="secondary_need" defaultValue="">
                <option value="">-</option>
                {(specialisms || []).map((s) => (
                  <option key={s.id} value={s.value}>{s.value}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tertiary_need">Tertiary need</label>
              <select id="tertiary_need" name="tertiary_need" defaultValue="">
                <option value="">-</option>
                {(specialisms || []).map((s) => (
                  <option key={s.id} value={s.value}>{s.value}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="muted" style={{ marginTop: "-0.5rem" }}>
            Needs are picked from the standard specialism list so the Planner tool can match your
            cases to the right colleagues by specialism.
          </p>
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
          <button type="submit">Add case</button>
        </form>
      </div>

      <div className="card">
        <h2>Active cases ({(cases || []).length})</h2>
        <table>
          <thead>
            <tr>
              <th>Case #</th>
              <th>Label</th>
              <th>Organization</th>
              <th>State</th>
              <th>Rate</th>
              <th>Sessions/wk</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(cases || []).map((c: any) => (
              <tr key={c.id}>
                <td>#{c.id}</td>
                <td>{c.private_label || <span className="muted">-</span>}</td>
                <td>{c.books_of_business?.name || <span className="muted">-</span>}</td>
                <td>{c.state || "-"}</td>
                <td>{c.rate_per_session ? `$${c.rate_per_session}` : "-"}</td>
                <td>{c.sessions_per_week ?? "-"}</td>
                <td>
                  <form action={archiveCase}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="secondary">Archive</button>
                  </form>
                </td>
              </tr>
            ))}
            {(cases || []).length === 0 && (
              <tr>
                <td colSpan={7} className="muted">No active cases yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
