import {
  addLicense,
  deleteLicense,
  addCeCredit,
  deleteCeCredit,
  addInsurancePanel,
  deleteInsurancePanel,
  saveNpiNumber,
  checkNpiRegistry,
  saveCaqhInfo,
  saveMalpracticeAction,
} from "./actions";
import { PageHead, Banner, Status } from "../_components/ui";
import { US_STATES } from "@/lib/us-states";

// Credentials (Product Spec v1): verification evidence first (identity,
// degree, each licence with state, number, expiry and review status), then
// a separate section for self-tracked renewals with reminders. Badges only
// show what an admin has reviewed. The NPI check can help, but never
// approves anyone on its own.

const CAQH_CYCLE_DAYS = 120;

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.round((new Date(d + "T12:00:00Z").getTime() - Date.now()) / 86_400_000);
}

function fmt(d: string | null) {
  if (!d) return "Not given";
  return new Date(d.length === 10 ? d + "T12:00:00Z" : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function DueTag({ days, soon = 90 }: { days: number | null; soon?: number }) {
  if (days === null) return null;
  if (days < 0) return <Status tone="danger">Expired</Status>;
  if (days <= soon) return <Status tone="warn">{days} day{days === 1 ? "" : "s"} left</Status>;
  return null;
}

const ACCOUNT_STATE: Record<string, { label: string; tone: "" | "warn" | "danger" | "neutral"; body: string }> = {
  pending: {
    label: "Pending review",
    tone: "warn",
    body: "An admin is checking your identity and doctoral degree. You can set up your profile meanwhile; you won't be listed or receive requests until it's done.",
  },
  flagged: {
    label: "Action required",
    tone: "danger",
    body: "We need something from you before we can finish. Check your notifications for what's missing.",
  },
  verified: {
    label: "Identity and degree reviewed",
    tone: "",
    body: "An admin has reviewed your professional identity and doctoral degree.",
  },
  rejected: {
    label: "Not verified",
    tone: "danger",
    body: "We couldn't verify this account. Contact us if you think that's wrong.",
  },
};

export function CredentialsView({ sp, profile, licences, ce, panels, npiChecks }: { sp: { saved?: string; added?: string; error?: string }; profile: any; licences: any[] | null; ce: any[] | null; panels: any[] | null; npiChecks: any[] | null }) {
  const status = profile?.account_status === "suspended" ? "suspended" : profile?.verification_status || "pending";
  const account =
    status === "suspended"
      ? { label: "Suspended", tone: "danger" as const, body: "This account is suspended. You can't send or receive requests. Contact us for details." }
      : ACCOUNT_STATE[status] || ACCOUNT_STATE.pending;
  const verified = status === "verified";
  const lic = licences || [];
  const reviewedActive = lic.filter((l: any) => l.reviewed_at && l.status === "active" && (daysUntil(l.expiration_date) ?? 1) >= 0);
  const ceHours = (ce || []).reduce((s: number, c: any) => s + Number(c.hours || 0), 0);
  const caqhDue = profile?.caqh_last_attested_date
    ? new Date(new Date(profile.caqh_last_attested_date + "T12:00:00Z").getTime() + CAQH_CYCLE_DAYS * 86_400_000).toISOString().slice(0, 10)
    : null;
  const npi = (npiChecks || [])[0];

  const badge = verified && reviewedActive.length > 0;

  return (
    <>
      <PageHead
        eyebrow="Credentials"
        title="Facts that earn trust."
        lead="The evidence behind your profile, and the renewals you track for yourself. Colleagues only see what an admin has reviewed."
      />
      <Banner
        error={sp.error}
        ok={sp.added === "licence" ? "Licence added. It counts once an admin has reviewed it, usually within two working days." : sp.saved ? "Saved." : null}
      />
      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="card-title">
              <h3>Verification</h3>
              {badge ? <Status>Verified</Status> : <Status tone="warn">Not yet listed</Status>}
            </div>
            {!verified && (
              <div className="item row between">
                <span>
                  <strong>Account</strong>
                  <p>{account.body}</p>
                </span>
                <Status tone={account.tone}>{account.label}</Status>
              </div>
            )}
            <div className="item row between">
              <span>
                <strong>Professional identity and doctoral degree{profile?.qualification_level ? ` (${profile.qualification_level})` : ""}</strong>
                <p>{verified && profile?.verified_at ? `Reviewed ${fmt(profile.verified_at)}` : "Not reviewed yet"}</p>
              </span>
              {verified ? <Status>On file</Status> : <Status tone="neutral">Pending</Status>}
            </div>
            {lic.map((l: any) => {
              const days = daysUntil(l.expiration_date);
              const expired = days !== null && days < 0;
              return (
                <div key={l.id} className="item row between wrap">
                  <span>
                    <strong>
                      {US_STATES.find((s) => s.code === l.state)?.name || l.state} licence &middot; #{l.license_number}
                    </strong>
                    <p>
                      {l.license_type ? `${l.license_type} · ` : ""}Expires {fmt(l.expiration_date)}
                      {l.reviewed_at ? ` · Reviewed ${fmt(l.reviewed_at)}` : ""}
                    </p>
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    {expired ? <Status tone="danger">Expired</Status> : l.reviewed_at ? <Status>Reviewed</Status> : <Status tone="warn">Awaiting review</Status>}
                    {!expired && <DueTag days={days} />}
                    <form action={deleteLicense} className="inline">
                      <input type="hidden" name="id" value={l.id} />
                      <button type="submit" className="plain-button small">Remove</button>
                    </form>
                  </span>
                </div>
              );
            })}
            {lic.length === 0 && (
              <div className="quiet-panel" style={{ marginTop: 12 }}>
                <strong className="small">No licence on file.</strong>
                <p className="small" style={{ margin: "5px 0 0" }}>
                  You&rsquo;re listed and matched only in states where a reviewed, in-date licence is on file. Add each state you hold.
                </p>
              </div>
            )}
            <details style={{ marginTop: 16 }} open={lic.length === 0}>
              <summary className="small" style={{ cursor: "pointer", fontWeight: 650 }}>Add a licence</summary>
              <form action={addLicense} style={{ marginTop: 12 }}>
                <div className="fields">
                  <label className="field">
                    State
                    <select name="state" required defaultValue="">
                      <option value="">Choose a state</option>
                      {US_STATES.map((s) => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Licence number
                    <input name="license_number" required autoComplete="off" />
                  </label>
                  <label className="field">
                    Type
                    <input name="license_type" placeholder="e.g. Licensed Psychologist" />
                  </label>
                  <label className="field">
                    Expires
                    <input type="date" name="expiration_date" required />
                  </label>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button type="submit" className="btn small-btn">Add licence</button>
                  <span className="micro-note">An admin checks it against the state board before it counts.</span>
                </div>
              </form>
            </details>
          </section>

          <section className="card">
            <div className="card-title">
              <h3>Renewals you track</h3>
              <span className="micro-note">Private to you</span>
            </div>
            <p className="small">Reminders for the dates that keep a practice running. These are your own records, not reviewed facts.</p>

            <div className="item">
              <div className="row between">
                <strong>Continuing education</strong>
                <span className="micro-note">{ceHours.toFixed(1)} hours logged</span>
              </div>
              {(ce || []).slice(0, 6).map((c: any) => (
                <div key={c.id} className="row between" style={{ marginTop: 8 }}>
                  <span className="small">{c.title}{c.provider ? `, ${c.provider}` : ""} &middot; {Number(c.hours)} h &middot; {fmt(c.completed_date)}</span>
                  <form action={deleteCeCredit} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="plain-button small">Remove</button>
                  </form>
                </div>
              ))}
              <details style={{ marginTop: 10 }}>
                <summary className="small" style={{ cursor: "pointer" }}>Log a CE credit</summary>
                <form action={addCeCredit} className="fields four" style={{ marginTop: 10 }}>
                  <label className="field">Title<input name="title" required /></label>
                  <label className="field">Provider<input name="provider" /></label>
                  <label className="field">Hours<input type="number" name="hours" step="0.25" min="0.25" required /></label>
                  <label className="field">Completed<input type="date" name="completed_date" required /></label>
                  <div><button type="submit" className="btn secondary small-btn">Add credit</button></div>
                </form>
              </details>
            </div>

            <div className="item">
              <div className="row between">
                <strong>Malpractice insurance</strong>
                <DueTag days={daysUntil(profile?.malpractice_expires || null)} soon={60} />
              </div>
              <form action={saveMalpracticeAction} className="fields three" style={{ marginTop: 10, alignItems: "end" }}>
                <label className="field">Carrier<input name="malpractice_carrier" defaultValue={profile?.malpractice_carrier || ""} /></label>
                <label className="field">Policy renews<input type="date" name="malpractice_expires" defaultValue={profile?.malpractice_expires || ""} /></label>
                <div style={{ paddingBottom: 4 }}><button type="submit" className="btn secondary small-btn">Save</button></div>
              </form>
            </div>

            <div className="item">
              <div className="row between">
                <strong>NPI</strong>
                {npi && <span className="micro-note">Last pre-check: {npi.matched ? "matched the registry" : "needs a human look"}</span>}
              </div>
              <form action={saveNpiNumber} className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                <input name="npi_number" maxLength={10} inputMode="numeric" defaultValue={profile?.npi_number || ""} placeholder="10-digit NPI" aria-label="NPI number" className="compact-input" />
                <button type="submit" className="btn secondary small-btn">Save</button>
              </form>
              {profile?.npi_number && (
                <form action={checkNpiRegistry} style={{ marginTop: 8 }}>
                  <button type="submit" className="plain-button small">Run the NPI registry pre-check &rarr;</button>
                </form>
              )}
              <p className="micro-note" style={{ margin: "6px 0 0" }}>The registry check helps an admin review you faster. It never approves anyone on its own.</p>
            </div>

            <div className="item">
              <div className="row between">
                <strong>CAQH re-attestation</strong>
                {caqhDue && <DueTag days={daysUntil(caqhDue)} soon={30} />}
              </div>
              {caqhDue && <p>Last attested {fmt(profile!.caqh_last_attested_date)}, next due {fmt(caqhDue)} (every 120 days).</p>}
              <form action={saveCaqhInfo} className="fields three" style={{ marginTop: 10, alignItems: "end" }}>
                <label className="field">CAQH provider ID<input name="caqh_provider_id" defaultValue={profile?.caqh_provider_id || ""} /></label>
                <label className="field">Last attested<input type="date" name="caqh_last_attested_date" defaultValue={profile?.caqh_last_attested_date || ""} /></label>
                <div style={{ paddingBottom: 4 }}><button type="submit" className="btn secondary small-btn">Save</button></div>
              </form>
            </div>

            <details className="item">
              <summary style={{ cursor: "pointer" }}><strong>Insurance panels</strong> <span className="micro-note">({(panels || []).length})</span></summary>
              {(panels || []).map((p: any) => (
                <div key={p.id} className="row between" style={{ marginTop: 8 }}>
                  <span className="small">
                    {p.insurance_name} &middot; {String(p.status).replace(/_/g, " ")}
                    {p.renewal_date ? ` · renews ${fmt(p.renewal_date)}` : ""}
                  </span>
                  <form action={deleteInsurancePanel} className="inline">
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="plain-button small">Remove</button>
                  </form>
                </div>
              ))}
              <form action={addInsurancePanel} className="fields four" style={{ marginTop: 10 }}>
                <label className="field">Insurer<input name="insurance_name" required /></label>
                <label className="field">
                  Status
                  <select name="status" defaultValue="pending">
                    <option value="in_network">In network</option>
                    <option value="pending">Pending</option>
                    <option value="out_of_network">Out of network</option>
                  </select>
                </label>
                <label className="field">Renewal<input type="date" name="renewal_date" /></label>
                <div><button type="submit" className="btn secondary small-btn">Add panel</button></div>
              </form>
              <p className="micro-note" style={{ margin: "8px 0 0" }}>The insurance colleagues match you on is set in your Profile.</p>
            </details>
          </section>
        </div>

        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">What your badge means</div>
            <h3>Reviewed, at a point in time.</h3>
            <p className="small" style={{ marginBottom: 0 }}>
              Verified means an admin has reviewed your identity, doctoral degree and at least one in-date licence. It doesn&rsquo;t certify fitness for a particular patient, referral or state. Colleagues see the facts on file, with dates.
            </p>
          </section>
          <section className="card">
            <div className="eyebrow">From the Practice Library</div>
            <h3>PA-19 &middot; Renewal Tracker</h3>
            <p className="small">A master renewal tracker, annual compliance calendar and record-retention log.</p>
            <a className="btn secondary small-btn" href="/dashboard/documents/PA-19">View PA-19</a>
          </section>
          <section className="card">
            <div className="eyebrow">Account states</div>
            <ul className="summary-list">
              <li><span>Pending review</span><strong>Not listed yet</strong></li>
              <li><span>Action required</span><strong>We need something</strong></li>
              <li><span>Verified</span><strong>Listed and matched</strong></li>
              <li><span>Licence expired</span><strong>Hidden in that state</strong></li>
              <li><span>Suspended</span><strong>No requests</strong></li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
