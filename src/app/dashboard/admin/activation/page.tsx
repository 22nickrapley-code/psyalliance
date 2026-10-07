import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { shortDate } from "@/lib/dates";
import { PageHead, Status, Empty } from "../../_components/ui";

export const metadata = { title: "Activation" };

type Cohort = { week: string; joined: number; verified: number; trusted3: number; availability: number; activated: number; still_in_window: number };
type Pending = { id: string; name: string | null; joined: string; verified: boolean; trusted3: boolean; availability: boolean };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "-");

// The one success measure for the founding cohort: a member is activated
// when they're verified, have at least 3 trusted colleagues and have
// confirmed availability, all within 7 days of joining.
export default async function ActivationPage() {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const { data, error } = await supabase.rpc("admin_activation", { p_weeks: 12 });
  const r = (data as any) || { cohorts: [], pending: [] };
  const cohorts: Cohort[] = r.cohorts || [];
  const pending: Pending[] = r.pending || [];
  const totals = cohorts.reduce(
    (a, c) => ({ joined: a.joined + c.joined - c.still_in_window, activated: a.activated + c.activated }),
    { joined: 0, activated: 0 }
  );

  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="Activation"
        lead="Verified, at least 3 trusted colleagues and availability confirmed, all within 7 days of joining. Real members only."
      />
      {error && <div className="banner error">{error.message}</div>}
      <div className="split" style={{ marginBottom: 20 }}>
        <section className="card">
          <div className="card-title"><h3>Last 12 weeks</h3><span className="micro-note">Members still inside their first 7 days aren&rsquo;t counted in the rate</span></div>
          <div className="activation-rate">
            <b>{pct(totals.activated, totals.joined)}</b>
            <span>{totals.activated} of {totals.joined} activated</span>
          </div>
          {cohorts.length === 0 ? (
            <Empty title="No members have joined in the last 12 weeks." body="Each week's cohort appears here as people join." />
          ) : (
            <div className="table-scroll">
              <table className="activation-table">
                <thead>
                  <tr><th>Week of</th><th>Joined</th><th>Verified</th><th>3+ trusted</th><th>Availability</th><th>Activated</th></tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.week}>
                      <td>{shortDate(c.week)}</td>
                      <td>{c.joined}{c.still_in_window ? <small> ({c.still_in_window} in window)</small> : null}</td>
                      <td>{c.verified} <small>{pct(c.verified, c.joined)}</small></td>
                      <td>{c.trusted3} <small>{pct(c.trusted3, c.joined)}</small></td>
                      <td>{c.availability} <small>{pct(c.availability, c.joined)}</small></td>
                      <td><b>{c.activated}</b> <small>{pct(c.activated, c.joined)}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">How to use it</div>
            <p className="small" style={{ marginBottom: 0 }}>
              Below are members from the last 30 days who aren&rsquo;t activated yet, with what&rsquo;s missing. A personal note at day 3 is usually
              what moves them: verify their license, introduce two colleagues, ask them to confirm availability.
            </p>
          </section>
        </aside>
      </div>
      <section className="card">
        <div className="card-title"><h3>Not activated yet</h3><span className="micro-note">Joined in the last 30 days</span></div>
        {pending.length === 0 ? (
          <p className="small">Everyone who joined recently is activated.</p>
        ) : (
          pending.map((p) => (
            <div key={p.id} className="list-row">
              <span>
                <strong>{p.name || "New member"}</strong>
                <small>Joined {shortDate(p.joined)}</small>
              </span>
              <span className="row wrap" style={{ gap: 6 }}>
                <Status tone={p.verified ? "" : "warn"}>{p.verified ? "Verified" : "Not verified"}</Status>
                <Status tone={p.trusted3 ? "" : "warn"}>{p.trusted3 ? "3+ trusted" : "Under 3 trusted"}</Status>
                <Status tone={p.availability ? "" : "warn"}>{p.availability ? "Availability set" : "No availability"}</Status>
              </span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
