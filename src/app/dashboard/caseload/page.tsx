import { createClient } from "@/lib/supabase/server";
import { createBookOfBusiness, createCase, archiveCase, reactivateCase, deleteOrganization, requestNewInsurance } from "./actions";
import CaseloadImportBox from "./import";
import UsStateDatalist from "@/components/us-state-datalist";

export default async function CaseloadPage(
  props: {
    searchParams: Promise<{ insurance_requested?: string; past_q?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: books }, { data: cases }, { data: pastCases }, { data: specialisms }, { data: insuranceOptions }] = await Promise.all([
    supabase.from("books_of_business").select("*").eq("profile_id", user!.id).eq("is_active", true),
    supabase
      .from("caseload_clients")
      .select("*, books_of_business(name)")
      .eq("profile_id", user!.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("caseload_clients")
      .select("*, books_of_business(name)")
      .eq("profile_id", user!.id)
      .eq("is_active", false)
      .order("archived_at", { ascending: false }),
    supabase.from("lookup_values").select("id, value").eq("category", "treatment_specialism").order("value"),
    supabase.from("lookup_values").select("id, value").eq("category", "insurance").order("value"),
  ]);

  const activeCases = cases || [];
  const topActiveCases = activeCases.slice(0, 3);
  const remainingActiveCases = activeCases.slice(3);

  const pastQ = (searchParams.past_q || "").trim().toLowerCase();
  const filteredPastCases = (pastCases || []).filter((c: any) => {
    if (!pastQ) return true;
    return (
      (c.private_label || "").toLowerCase().includes(pastQ) ||
      (c.books_of_business?.name || "").toLowerCase().includes(pastQ) ||
      (c.state || "").toLowerCase().includes(pastQ) ||
      String(c.id).includes(pastQ)
    );
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Caseload</h1>
          <p className="muted">
            Every client is referenced by their client number, never a name. Your private client label
            is your own optional shorthand and is never shown to anyone else.
          </p>
        </div>
        <a href="/api/export/caseload" className="btn secondary" style={{ flex: "0 0 auto" }}>
          Export CSV
        </a>
      </div>

      {searchParams.insurance_requested === "1" && (
        <div className="message-banner">
          Request sent. An admin will review it, and you'll get a message once it's added.
        </div>
      )}

      <div className="card">
        <div className="widget-header">
          <h2>Active clients ({activeCases.length})</h2>
        </div>
        {activeCases.length === 0 ? (
          <p className="muted">No active clients yet, add one below.</p>
        ) : (
          <>
            {topActiveCases.map((c: any) => (
              <div key={c.id} className="case-row">
                <span className="case-num">#{c.id}</span>
                <span className="case-label">{c.private_label || <span className="muted">Unlabeled</span>}</span>
                <span className="case-org">{c.books_of_business?.name || <span className="muted">-</span>}{c.state ? ` · ${c.state}` : ""}</span>
                <span className="case-rate">{c.rate_per_session ? `$${c.rate_per_session}` : "-"}</span>
                <span className="case-sessions muted">{c.sessions_per_week ?? "-"}/wk</span>
                <span className="case-row-actions">
                  <form action={archiveCase}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }}>Archive</button>
                  </form>
                </span>
              </div>
            ))}
            {remainingActiveCases.length > 0 && (
              <details className="case-accordion">
                <summary>
                  Show {remainingActiveCases.length} more active client{remainingActiveCases.length === 1 ? "" : "s"}
                </summary>
                {remainingActiveCases.map((c: any) => (
                  <div key={c.id} className="case-row">
                    <span className="case-num">#{c.id}</span>
                    <span className="case-label">{c.private_label || <span className="muted">Unlabeled</span>}</span>
                    <span className="case-org">{c.books_of_business?.name || <span className="muted">-</span>}{c.state ? ` · ${c.state}` : ""}</span>
                    <span className="case-rate">{c.rate_per_session ? `$${c.rate_per_session}` : "-"}</span>
                    <span className="case-sessions muted">{c.sessions_per_week ?? "-"}/wk</span>
                    <span className="case-row-actions">
                      <form action={archiveCase}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }}>Archive</button>
                      </form>
                    </span>
                  </div>
                ))}
              </details>
            )}
          </>
        )}
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
              <th>Share you keep</th>
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
            <label htmlFor="expense_burden_pct">Share of hourly rate you keep</label>
            <input id="expense_burden_pct" name="expense_burden_pct" type="number" step="0.01" min="0" max="1" defaultValue="0.85" required />
            <p className="muted" style={{ marginTop: "0.3rem", marginBottom: 0, fontSize: "0.78rem" }}>
              As a decimal, not a percent — 0.85 = 85%.
            </p>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit">Add</button>
          </div>
        </form>
        <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          For your own private practice this is usually 1 (100%) — you keep everything you bill.
          If you're employed by or contracted to a group practice or consultancy, enter the share
          of the billed hourly rate you take home after their cut, e.g. if they bill $200/hr and
          you're paid $140, enter 0.70.
        </p>
      </div>

      <CaseloadImportBox />

      <div className="card">
        <h2>Add a client</h2>
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
                {(insuranceOptions || []).map((i) => (
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
                <p className="muted" style={{ fontSize: "0.76rem", marginTop: "0.3rem", marginBottom: 0 }}>
                  Goes to an admin for review. Once approved, it's added to this list and you'll
                  get a message letting you know.
                </p>
              </details>
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
          <button type="submit">Add client</button>
        </form>
      </div>

      <div className="card">
        <h2>Past clients ({(pastCases || []).length})</h2>
        <p className="muted">
          Anyone archived from your caseload. Re-add a past client and their record keeps the same
          number and details, no need to re-enter anything.
        </p>
        <form method="GET" className="field-row" style={{ alignItems: "flex-end", marginBottom: "0.75rem" }}>
          <div className="field" style={{ flex: "1 1 240px" }}>
            <label htmlFor="past_q">Search past clients</label>
            <input
              id="past_q"
              name="past_q"
              type="text"
              defaultValue={searchParams.past_q || ""}
              placeholder="Label, organization, state, or client #"
            />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Search</button>
          </div>
          {pastQ && (
            <div className="field" style={{ flex: "0 0 auto" }}>
              <a href="/dashboard/caseload" className="btn secondary" style={{ display: "inline-block" }}>Clear</a>
            </div>
          )}
        </form>
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
            {filteredPastCases.map((c: any) => (
              <tr key={c.id}>
                <td>#{c.id}</td>
                <td>{c.private_label || <span className="muted">-</span>}</td>
                <td>{c.books_of_business?.name || <span className="muted">-</span>}</td>
                <td>{c.state || "-"}</td>
                <td>{c.rate_per_session ? `$${c.rate_per_session}` : "-"}</td>
                <td>
                  <form action={reactivateCase}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="secondary">Re-add to caseload</button>
                  </form>
                </td>
              </tr>
            ))}
            {filteredPastCases.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {pastQ ? "No past clients match that search." : "No archived clients yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
