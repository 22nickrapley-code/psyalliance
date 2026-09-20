import { createClient } from "@/lib/supabase/server";
import { caseMonthlyGross, caseMonthlyNet, currency } from "@/lib/finance";

export default async function IncomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: books }, { data: cases }, { data: overhead }] = await Promise.all([
    supabase.from("books_of_business").select("*").eq("profile_id", user!.id),
    supabase.from("caseload_clients").select("*").eq("profile_id", user!.id).eq("is_active", true),
    supabase.from("practice_overhead_expenses").select("monthly_cost").eq("profile_id", user!.id),
  ]);

  const casesList = cases || [];
  const booksList = books || [];

  const totalGross = casesList.reduce((sum, c) => sum + caseMonthlyGross(c), 0);
  const totalNet = casesList.reduce((sum, c) => sum + caseMonthlyNet(c, booksList), 0);
  const totalOverhead = (overhead || []).reduce((sum, o) => sum + Number(o.monthly_cost || 0), 0);
  const trueNet = totalNet - totalOverhead;

  const byBook = booksList.map((b) => {
    const bookCases = casesList.filter((c) => c.book_of_business_id === b.id);
    const gross = bookCases.reduce((sum, c) => sum + caseMonthlyGross(c), 0);
    const net = bookCases.reduce((sum, c) => sum + caseMonthlyNet(c, booksList), 0);
    return { book: b, count: bookCases.length, gross, net };
  });

  const unassigned = casesList.filter((c) => !c.book_of_business_id);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Income &amp; revenue</h1>
          <p className="muted">
            Projected from your active caseload: rate × sessions/week × 4.3 weeks/month, net of
            each organization's retention share.
          </p>
        </div>
        <a href="/api/export/caseload" className="btn secondary" style={{ flex: "0 0 auto" }}>
          Export CSV
        </a>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{currency(totalGross)}</div>
          <div className="label">Monthly gross</div>
        </div>
        <div className="stat">
          <div className="value">{currency(totalNet)}</div>
          <div className="label">Monthly net (after retention split)</div>
        </div>
        <div className="stat">
          <div className="value">{currency(totalOverhead)}</div>
          <div className="label">Recurring overhead</div>
        </div>
        <div className="stat">
          <div className="value">{currency(trueNet)}</div>
          <div className="label">True net income</div>
        </div>
        <div className="stat">
          <div className="value">{currency(trueNet * 12)}</div>
          <div className="label">Annual true net income</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2>By organization</h2>
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Active cases</th>
              <th>Gross</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {byBook.map(({ book, count, gross, net }) => (
              <tr key={book.id}>
                <td>{book.name}</td>
                <td>{count}</td>
                <td>{currency(gross)}</td>
                <td>{currency(net)}</td>
              </tr>
            ))}
            {unassigned.length > 0 && (
              <tr>
                <td className="muted">Unassigned</td>
                <td>{unassigned.length}</td>
                <td>{currency(unassigned.reduce((s, c) => s + caseMonthlyGross(c), 0))}</td>
                <td>{currency(unassigned.reduce((s, c) => s + caseMonthlyNet(c, booksList), 0))}</td>
              </tr>
            )}
            {byBook.length === 0 && unassigned.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No active cases yet, add some on the Caseload page.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Annual income by organization</h2>
        <p className="muted">
          Same figures, annualized (× 12) and split out per organization, so you can see where
          your income actually comes from over a full year - not just this month.
        </p>
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Active cases</th>
              <th>Annual gross</th>
              <th>Annual net</th>
            </tr>
          </thead>
          <tbody>
            {byBook.map(({ book, count, gross, net }) => (
              <tr key={book.id}>
                <td>{book.name}</td>
                <td>{count}</td>
                <td>{currency(gross * 12)}</td>
                <td>{currency(net * 12)}</td>
              </tr>
            ))}
            {unassigned.length > 0 && (
              <tr>
                <td className="muted">Unassigned</td>
                <td>{unassigned.length}</td>
                <td>{currency(unassigned.reduce((s, c) => s + caseMonthlyGross(c), 0) * 12)}</td>
                <td>{currency(unassigned.reduce((s, c) => s + caseMonthlyNet(c, booksList), 0) * 12)}</td>
              </tr>
            )}
            {byBook.length === 0 && unassigned.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No active cases yet, add some on the Caseload page.</td>
              </tr>
            )}
            {(byBook.length > 0 || unassigned.length > 0) && (
              <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border-strong)" }}>
                <td>Total</td>
                <td>{casesList.length}</td>
                <td>{currency(totalGross * 12)}</td>
                <td>{currency(totalNet * 12)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="muted">
        "True net income" also subtracts your recurring practice overhead, see{" "}
        <a href="/dashboard/capacity">Capacity &amp; overhead</a> to add or edit those expenses.
      </p>
    </div>
  );
}
