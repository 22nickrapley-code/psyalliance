import { US_STATES } from "@/lib/us-states";
import { stateName } from "@/lib/open-states";
import { shortDate } from "@/lib/dates";
import { PageHead, Banner, Status } from "../../_components/ui";
import { setStateOpenAction } from "./actions";

export type StateRow = { state: string; open: boolean; changed_at: string | null; verified: number; signed_up: number; awaiting: number };

// Where the network is open, and who is waiting where. The waiting list is
// the recruitment map: open a state once there are enough verified
// colleagues there to cover, refer and consult with each other.
export function StatesView({ rows, sp }: { rows: StateRow[]; sp: { error?: string; opened?: string; closed?: string } }) {
  const open = rows.filter((r) => r.open);
  const waiting = rows.filter((r) => !r.open);
  const known = new Set(rows.map((r) => r.state));
  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="States"
        lead="Anyone eligible can create an account. The network opens state by state: verified members licensed in an open state join it; everyone else waits, with their place in line."
      />
      <Banner
        error={sp.error}
        ok={sp.opened ? `${stateName(sp.opened)} is open. Verified members licensed there are now in the network.` : sp.closed ? `${stateName(sp.closed)} is closed to new activity.` : null}
      />
      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="card-title"><h3>Open</h3><span className="micro-note">{open.length} state{open.length === 1 ? "" : "s"}</span></div>
            <StateTable rows={open} />
          </section>
          <section className="card">
            <div className="card-title"><h3>Waiting</h3><span className="micro-note">Accounts by the states they gave or are licensed in</span></div>
            {waiting.length === 0 ? <p className="small" style={{ marginBottom: 0 }}>No one is waiting for a state yet.</p> : <StateTable rows={waiting} />}
          </section>
        </div>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">Open another state</div>
            <form action={setStateOpenAction} className="stack" style={{ gap: 10 }}>
              <input type="hidden" name="open" value="1" />
              <label className="field">
                State
                <select name="state" defaultValue="" required>
                  <option value="" disabled>Choose a state</option>
                  {US_STATES.filter((s) => !open.some((o) => o.state === s.code)).map((s) => (
                    <option key={s.code} value={s.code}>{s.name}{known.has(s.code) ? ` (${rows.find((r) => r.state === s.code)?.signed_up || 0} waiting)` : ""}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn small-btn">Open this state</button>
            </form>
          </section>
          <section className="card">
            <div className="eyebrow">When to open</div>
            <p className="small" style={{ marginBottom: 0 }}>
              Open a state when its verified members can cover for each other and refer across the common needs, typically eight to ten active clinicians
              with some psychiatry. Opening too early means members arrive to an empty network.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

function StateTable({ rows }: { rows: StateRow[] }) {
  return (
    <div className="states-table">
      <div className="states-row head">
        <span>State</span><span>Verified</span><span>Being checked</span><span>Signed up</span><span />
      </div>
      {rows.map((r) => (
        <div key={r.state} className="states-row">
          <span>
            <b>{stateName(r.state)}</b>
            {r.open ? <Status>Open{r.changed_at ? ` since ${shortDate(r.changed_at)}` : ""}</Status> : null}
          </span>
          <span data-label="Verified">{r.verified}</span>
          <span data-label="Being checked">{r.awaiting}</span>
          <span data-label="Signed up">{r.signed_up}</span>
          <span>
            <form action={setStateOpenAction}>
              <input type="hidden" name="state" value={r.state} />
              <input type="hidden" name="open" value={r.open ? "0" : "1"} />
              <button type="submit" className={r.open ? "plain-button small" : "btn secondary small-btn"}>{r.open ? "Close" : "Open"}</button>
            </form>
          </span>
        </div>
      ))}
    </div>
  );
}
