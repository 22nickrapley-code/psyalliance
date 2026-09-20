import { createClient } from "@/lib/supabase/server";
import {
  addLicense,
  deleteLicense,
  addCeCredit,
  deleteCeCredit,
  addInsurancePanel,
  updateInsurancePanelStatus,
  deleteInsurancePanel,
  saveNpiNumber,
  checkNpiRegistry,
  saveCaqhInfo,
} from "./actions";
import UsStateDatalist from "@/components/us-state-datalist";

// CAQH ProView requires re-attestation at least every 120 days (its own
// "120-day rule") or the profile goes inactive - the same expiry-reminder
// pattern already used for licenses/insurance panels below applies here too.
const CAQH_ATTESTATION_CYCLE_DAYS = 120;

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export default async function CredentialsPage(props: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: profile }, { data: licenses }, { data: ceCredits }, { data: panels }, { data: npiChecks }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("npi_number, full_name, caqh_provider_id, caqh_last_attested_date")
        .eq("id", myself)
        .maybeSingle(),
      supabase.from("licenses").select("*").eq("profile_id", myself).order("expiration_date"),
      supabase
        .from("continuing_education_credits")
        .select("*")
        .eq("profile_id", myself)
        .order("completed_date", { ascending: false }),
      supabase.from("insurance_panels").select("*").eq("profile_id", myself).order("insurance_name"),
      supabase
        .from("credential_verifications")
        .select("*")
        .eq("profile_id", myself)
        .eq("source", "npi_registry")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  const totalCeHours = (ceCredits || []).reduce((s, c) => s + Number(c.hours || 0), 0);
  const latestNpiCheck = (npiChecks || [])[0];

  return (
    <div>
      <h1>Credentials &amp; compliance</h1>
      <p className="muted">
        Track your licenses, continuing-education hours, and insurance-panel status in one place,
        with expiration reminders so nothing lapses unnoticed.
      </p>

      {saved === "1" && (
        <div className="card" style={{ borderColor: "var(--accent, #2a7)", background: "rgba(34,170,119,0.08)" }}>
          NPI number saved.
        </div>
      )}

      <div className="card">
        <h2>Licenses</h2>
        <table style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>State</th>
              <th>License #</th>
              <th>Type</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(licenses || []).map((l) => {
              const days = daysUntil(l.expiration_date);
              return (
                <tr key={l.id}>
                  <td>{l.state}</td>
                  <td>{l.license_number}</td>
                  <td>{l.license_type || "-"}</td>
                  <td>
                    {l.expiration_date || "-"}
                    {days !== null && days <= 60 && (
                      <span className="tag" style={{ marginLeft: "0.4rem", color: days < 0 ? "#b91c1c" : undefined }}>
                        {days < 0 ? "expired" : `${days}d left`}
                      </span>
                    )}
                  </td>
                  <td>
                    <form action={deleteLicense}>
                      <input type="hidden" name="id" value={l.id} />
                      <button type="submit" className="secondary">Remove</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(licenses || []).length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No licenses added yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        <form action={addLicense} className="field-row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ maxWidth: 90 }}>
            <label htmlFor="state">State</label>
            <input id="state" name="state" type="text" maxLength={24} placeholder="TX or Texas" list="us-states" autoComplete="off" required />
            <UsStateDatalist />
          </div>
          <div className="field">
            <label htmlFor="license_number">License number</label>
            <input id="license_number" name="license_number" type="text" required />
          </div>
          <div className="field">
            <label htmlFor="license_type">Type</label>
            <input id="license_type" name="license_type" type="text" placeholder="e.g. Licensed Psychologist" />
          </div>
          <div className="field">
            <label htmlFor="issued_date">Issued</label>
            <input id="issued_date" name="issued_date" type="date" />
          </div>
          <div className="field">
            <label htmlFor="expiration_date">Expires</label>
            <input id="expiration_date" name="expiration_date" type="date" />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit">Add license</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Continuing education ({totalCeHours.toFixed(1)} hours logged)</h2>
        <table style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Provider</th>
              <th>Category</th>
              <th>Hours</th>
              <th>Completed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(ceCredits || []).map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td>{c.provider || "-"}</td>
                <td>{c.category || "-"}</td>
                <td>{c.hours}</td>
                <td>{c.completed_date}</td>
                <td>
                  <form action={deleteCeCredit}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="secondary">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
            {(ceCredits || []).length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No CE credits logged yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        <form action={addCeCredit} className="field-row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" type="text" required />
          </div>
          <div className="field">
            <label htmlFor="provider">Provider</label>
            <input id="provider" name="provider" type="text" />
          </div>
          <div className="field" style={{ maxWidth: 160 }}>
            <label htmlFor="category">Category</label>
            <input id="category" name="category" type="text" placeholder="Ethics, clinical…" />
          </div>
          <div className="field" style={{ maxWidth: 100 }}>
            <label htmlFor="hours">Hours</label>
            <input id="hours" name="hours" type="number" step="0.25" min="0.25" required />
          </div>
          <div className="field">
            <label htmlFor="completed_date">Completed</label>
            <input id="completed_date" name="completed_date" type="date" required />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit">Add credit</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Insurance panels</h2>
        <table style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Insurance</th>
              <th>Status</th>
              <th>Renewal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(panels || []).map((p) => {
              const days = daysUntil(p.renewal_date);
              return (
                <tr key={p.id}>
                  <td>{p.insurance_name}</td>
                  <td>
                    <form action={updateInsurancePanelStatus} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <select name="status" defaultValue={p.status} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                        <option value="in_network">In network</option>
                        <option value="pending">Pending</option>
                        <option value="out_of_network">Out of network</option>
                        <option value="terminated">Terminated</option>
                      </select>
                    </form>
                  </td>
                  <td>
                    {p.renewal_date || "-"}
                    {days !== null && days <= 60 && (
                      <span className="tag" style={{ marginLeft: "0.4rem", color: days < 0 ? "#b91c1c" : undefined }}>
                        {days < 0 ? "overdue" : `${days}d left`}
                      </span>
                    )}
                  </td>
                  <td>
                    <form action={deleteInsurancePanel}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="secondary">Remove</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(panels || []).length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No insurance panels tracked yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        <form action={addInsurancePanel} className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label htmlFor="insurance_name">Insurance</label>
            <input id="insurance_name" name="insurance_name" type="text" required />
          </div>
          <div className="field" style={{ maxWidth: 160 }}>
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue="pending">
              <option value="in_network">In network</option>
              <option value="pending">Pending</option>
              <option value="out_of_network">Out of network</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="effective_date">Effective</label>
            <input id="effective_date" name="effective_date" type="date" />
          </div>
          <div className="field">
            <label htmlFor="renewal_date">Renewal</label>
            <input id="renewal_date" name="renewal_date" type="date" />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit">Add panel</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>NPI registry pre-check</h2>
        <p className="muted">
          An automated check against the free public NPI registry, it only feeds your verification
          queue as a pre-check; a human always makes the final call on your listing.
        </p>
        <form action={saveNpiNumber} className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label htmlFor="npi_number">Your NPI number</label>
            <input id="npi_number" name="npi_number" type="text" maxLength={10} defaultValue={profile?.npi_number || ""} />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Save</button>
          </div>
        </form>
        {profile?.npi_number && (
          <form action={checkNpiRegistry} style={{ marginTop: "0.5rem" }}>
            <button type="submit">Run NPI pre-check</button>
          </form>
        )}
        {latestNpiCheck && (
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Last check: {latestNpiCheck.matched ? "matched" : `needs review${latestNpiCheck.flagged_reason ? `, ${latestNpiCheck.flagged_reason}` : ""}`}
          </p>
        )}
      </div>

      <div className="card">
        <h2>CAQH re-attestation</h2>
        <p className="muted">
          Most commercial insurers and behavioral-health networks (Aetna, UnitedHealthcare, Cigna,
          BCBS, Optum, Magellan) require an active CAQH ProView profile before they'll process an
          insurance-panel application, and CAQH requires re-attestation at least every 120 days or
          your profile goes inactive. This just tracks the date so it doesn't lapse unnoticed, it
          doesn't connect to CAQH itself.
        </p>
        {(() => {
          const nextDue = profile?.caqh_last_attested_date
            ? new Date(
                new Date(profile.caqh_last_attested_date).getTime() +
                  CAQH_ATTESTATION_CYCLE_DAYS * 24 * 60 * 60 * 1000
              )
                .toISOString()
                .slice(0, 10)
            : null;
          const days = daysUntil(nextDue);
          return (
            <>
              {profile?.caqh_last_attested_date && (
                <p style={{ marginBottom: "0.75rem" }}>
                  Last attested {profile.caqh_last_attested_date}, next due {nextDue}
                  {days !== null && days <= 30 && (
                    <span className="tag" style={{ marginLeft: "0.4rem", color: days < 0 ? "#b91c1c" : undefined }}>
                      {days < 0 ? "overdue" : `${days}d left`}
                    </span>
                  )}
                </p>
              )}
              <form action={saveCaqhInfo} className="field-row" style={{ alignItems: "flex-end" }}>
                <div className="field">
                  <label htmlFor="caqh_provider_id">CAQH provider ID</label>
                  <input
                    id="caqh_provider_id"
                    name="caqh_provider_id"
                    type="text"
                    defaultValue={profile?.caqh_provider_id || ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="caqh_last_attested_date">Last attested</label>
                  <input
                    id="caqh_last_attested_date"
                    name="caqh_last_attested_date"
                    type="date"
                    defaultValue={profile?.caqh_last_attested_date || ""}
                  />
                </div>
                <div className="field" style={{ flex: "0 0 auto" }}>
                  <button type="submit" className="secondary">Save</button>
                </div>
              </form>
            </>
          );
        })()}
      </div>
    </div>
  );
}
