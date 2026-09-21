import { createClient } from "@/lib/supabase/server";
import { saveCapacitySettings, addOverheadExpense, deleteOverheadExpense } from "./actions";
import { currency } from "@/lib/finance";

export default async function CapacityPage(props: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: settings }, { data: cases }, { data: expenses }, { data: books }] = await Promise.all([
    supabase.from("capacity_settings").select("*").eq("profile_id", user!.id).maybeSingle(),
    supabase.from("caseload_clients").select("sessions_per_week").eq("profile_id", user!.id).eq("is_active", true),
    supabase
      .from("practice_overhead_expenses")
      .select("*, books_of_business(name)")
      .eq("profile_id", user!.id)
      .order("id"),
    supabase.from("books_of_business").select("*").eq("profile_id", user!.id).eq("is_active", true),
  ]);

  const actualSessionsPerWeek = (cases || []).reduce((s, c) => s + (c.sessions_per_week || 0), 0);
  const target = settings?.target_sessions_per_week || 0;
  const utilizationPct = target > 0 ? Math.round((actualSessionsPerWeek / target) * 100) : null;

  const totalMonthlyOverhead = (expenses || []).reduce((s, e) => s + Number(e.monthly_cost || 0), 0);

  return (
    <div>
      <h1>Capacity &amp; Overhead</h1>

      {error && <div className="error-banner">{error}</div>}

      {saved === "1" && (
        <div className="card" style={{ borderColor: "var(--accent, #2a7)", background: "rgba(34,170,119,0.08)" }}>
          Capacity settings saved.
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{actualSessionsPerWeek.toFixed(1)}</div>
          <div className="label">Actual sessions / week</div>
        </div>
        <div className="stat">
          <div className="value">{target || "-"}</div>
          <div className="label">Target sessions / week</div>
        </div>
        <div className="stat">
          <div className="value">{utilizationPct !== null ? `${utilizationPct}%` : "-"}</div>
          <div className="label">Utilization</div>
        </div>
        <div className="stat">
          <div className="value">{currency(totalMonthlyOverhead)}</div>
          <div className="label">Monthly overhead</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Capacity settings</h2>
        <form action={saveCapacitySettings}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="target_sessions_per_week">Target sessions/week</label>
              <input id="target_sessions_per_week" name="target_sessions_per_week" type="number" step="0.5" defaultValue={settings?.target_sessions_per_week ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="annual_vacation_days">Annual vacation days</label>
              <input id="annual_vacation_days" name="annual_vacation_days" type="number" defaultValue={settings?.annual_vacation_days ?? ""} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="no_show_rate_pct">No-show rate</label>
              <input id="no_show_rate_pct" name="no_show_rate_pct" type="number" step="0.01" min="0" max="1" defaultValue={settings?.no_show_rate_pct ?? ""} />
              <p className="muted" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
                The share of scheduled sessions where the client doesn't show, as a decimal (0.1 =
                10% of sessions, roughly 1 in 10).
                {settings?.no_show_rate_pct != null && actualSessionsPerWeek > 0 && (
                  <>
                    {" "}At your current caseload, that's about{" "}
                    <strong>{(actualSessionsPerWeek * Number(settings.no_show_rate_pct)).toFixed(1)} client{actualSessionsPerWeek * Number(settings.no_show_rate_pct) === 1 ? "" : "s"} a week</strong> who
                    no-show.
                  </>
                )}
              </p>
            </div>
            <div className="field">
              <label htmlFor="missed_session_charge_pct">Missed-session charge (0 = none, 1 = full)</label>
              <input id="missed_session_charge_pct" name="missed_session_charge_pct" type="number" step="0.01" min="0" max="1" defaultValue={settings?.missed_session_charge_pct ?? ""} />
            </div>
          </div>
          <button type="submit">Save settings</button>
        </form>
      </div>

      <div className="card">
        <h2>Recurring practice overhead</h2>
        <table style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Expense</th>
              <th>Organization</th>
              <th>Vendor</th>
              <th>Cadence</th>
              <th>Amount</th>
              <th>Monthly cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(expenses || []).map((e: any) => (
              <tr key={e.id}>
                <td>{e.expense_name}</td>
                <td>{e.books_of_business?.name || <span className="muted">General</span>}</td>
                <td>{e.vendor || "-"}</td>
                <td>{e.cadence}</td>
                <td>{currency(Number(e.amount))}</td>
                <td>{currency(Number(e.monthly_cost))}</td>
                <td>
                  <form action={deleteOverheadExpense}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="secondary">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
            {(expenses || []).length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No overhead expenses yet: insurance, EHR/video platform, HIPAA-compliant email,
                  directory ad spend, licensing fees, etc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <form action={addOverheadExpense}>
          <p className="muted" style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "0.78rem" }}>
            Most expenses are your own private practice - only pick an organization below if it's
            specific to a particular one.
          </p>
          <div className="field-row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field">
              <label htmlFor="expense_name">Expense</label>
              <input id="expense_name" name="expense_name" type="text" required />
            </div>
            <div className="field">
              <label htmlFor="book_of_business_id">Organization</label>
              <select id="book_of_business_id" name="book_of_business_id" defaultValue="">
                <option value="">General</option>
                {(books || []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="vendor">Vendor</label>
              <input id="vendor" name="vendor" type="text" />
            </div>
            <div className="field" style={{ maxWidth: 140 }}>
              <label htmlFor="cadence">Cadence</label>
              <select id="cadence" name="cadence" defaultValue="monthly">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className="field" style={{ maxWidth: 140 }}>
              <label htmlFor="amount">Amount ($)</label>
              <input id="amount" name="amount" type="number" step="0.01" min="0" required />
            </div>
            <div className="field" style={{ flex: "0 0 auto" }}>
              <button type="submit">Add expense</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
