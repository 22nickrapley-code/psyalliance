import { createClient } from "@/lib/supabase/server";
import { caseMonthlyGross, caseMonthlyNet, currency } from "@/lib/finance";
import InfoTooltip from "@/components/info-tooltip";

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
  const hasRows = byBook.length > 0 || unassigned.length > 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1>Income &amp; Revenue</h1>
          <p className="muted">
            Projected from your active caseload: rate × sessions/week × 4.3 weeks/month, net of
            each practice's retention share and your recurring overhead.
          </p>
        </div>
        <a href="/api/export/caseload" className="btn secondary" style={{ flex: "0 0 auto" }}>
          Export CSV
        </a>
      </div>

      {/* One headline figure - what you actually take home over a year -
          with the figures behind it as smaller supporting stats, rather
          than five same-weight boxes with no hierarchy between them. */}
      <div className="income-hero">
        <div className="income-hero-primary">
          <div className="label">
            Annual true net income
            <InfoTooltip
              dark
              text="Your monthly true net (after retention splits and overhead) times 12 - the closest single number to what you actually take home over a year."
            />
          </div>
          <div className="value">{currency(trueNet * 12)}</div>
          <div className="sub">
            {currency(trueNet)}/mo, after retention splits and {currency(totalOverhead)}/mo of
            recurring overhead
          </div>
        </div>
        <div className="income-hero-secondary">
          <div className="stat">
            <div className="value">{currency(totalGross)}</div>
            <div className="label">
              Monthly gross
              <InfoTooltip text="Total billed this month across all active clients: rate per session × sessions/week × 4.3 weeks/month, before any practice retention split or overhead is taken out." />
            </div>
          </div>
          <div className="stat">
            <div className="value">{currency(totalNet)}</div>
            <div className="label">
              Monthly net
              <InfoTooltip text="Monthly gross minus each practice's retention share (what a group practice keeps from the billed rate for cases under it). This does not yet subtract your recurring overhead - see Monthly true net for that." />
            </div>
          </div>
          <div className="stat">
            <div className="value">{currency(totalOverhead)}</div>
            <div className="label">
              Overhead
              <InfoTooltip text="Your recurring monthly practice expenses - insurance, EHR/video platform, HIPAA-compliant email, licensing fees, and anything else logged on the Capacity & Overhead page." />
            </div>
          </div>
          <div className="stat">
            <div className="value">{currency(trueNet)}</div>
            <div className="label">
              Monthly true net
              <InfoTooltip text="Monthly net minus overhead - what you actually keep this month after both practice retention splits and your recurring expenses. This is the difference from Monthly net: true net also subtracts overhead." />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="widget-header">
          <h2>Income by practice</h2>
        </div>
        <p className="muted" style={{ marginTop: "-0.4rem" }}>
          This month's figures alongside the annualized (× 12) projection, so you can see both
          where your income comes from and what it adds up to over a full year.
        </p>
        <table className="income-table">
          <thead>
            <tr>
              <th>Practice</th>
              <th>Active</th>
              <th>Monthly gross</th>
              <th>Monthly net</th>
              <th>Annual gross</th>
              <th>Annual net</th>
            </tr>
          </thead>
          <tbody>
            {byBook.map(({ book, count, gross, net }) => (
              <tr key={book.id} className={count === 0 ? "muted-row" : undefined}>
                <td>{book.name}</td>
                <td>{count}</td>
                <td>{currency(gross)}</td>
                <td>{currency(net)}</td>
                <td>{currency(gross * 12)}</td>
                <td>{currency(net * 12)}</td>
              </tr>
            ))}
            {unassigned.length > 0 && (
              <tr>
                <td className="muted">Unassigned</td>
                <td>{unassigned.length}</td>
                <td>{currency(unassigned.reduce((s, c) => s + caseMonthlyGross(c), 0))}</td>
                <td>{currency(unassigned.reduce((s, c) => s + caseMonthlyNet(c, booksList), 0))}</td>
                <td>{currency(unassigned.reduce((s, c) => s + caseMonthlyGross(c), 0) * 12)}</td>
                <td>{currency(unassigned.reduce((s, c) => s + caseMonthlyNet(c, booksList), 0) * 12)}</td>
              </tr>
            )}
            {!hasRows && (
              <tr>
                <td colSpan={6} className="muted">No active cases yet, add some on the Caseload page.</td>
              </tr>
            )}
            {hasRows && (
              <tr className="income-table-total">
                <td>Total</td>
                <td>{casesList.length}</td>
                <td>{currency(totalGross)}</td>
                <td>{currency(totalNet)}</td>
                <td>{currency(totalGross * 12)}</td>
                <td>{currency(totalNet * 12)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="muted">
        "True net income" also subtracts your recurring practice overhead, see{" "}
        <a href="/dashboard/capacity">Capacity &amp; Overhead</a> to add or edit those expenses.
      </p>
    </div>
  );
}
