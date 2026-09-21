import { createClient } from "@/lib/supabase/server";
import { archiveCase, updateCase, reactivateCase } from "./actions";
import { CaseloadProvider } from "./caseload-context";
import AddClientBox from "./add-client-box";
import ActiveClientsBoard from "./active-clients-board";
import CaseloadDataSection from "./caseload-data-section";
import PracticesBox from "./practices-box";
import SinglePatientReferral from "../single-patient-referral";

export default async function CaseloadPage(
  props: {
    searchParams: Promise<{ insurance_requested?: string; past_q?: string; error?: string; spr?: string }>;
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

      {searchParams.error && <div className="error-banner">{searchParams.error}</div>}

      {searchParams.insurance_requested === "1" && (
        <div className="message-banner">
          Request sent. An admin will review it, and you'll get a message once it's added.
        </div>
      )}

      <SinglePatientReferral supabase={supabase} myself={user!.id} query={searchParams.spr || ""} paramName="spr" />

      <CaseloadProvider>
        <div className="card">
          <div className="widget-header">
            <h2 style={{ margin: 0 }}>Active clients ({activeCases.length})</h2>
          </div>
          <AddClientBox books={books || []} insuranceOptions={insuranceOptions || []} specialisms={specialisms || []} />
          <ActiveClientsBoard
            cases={activeCases}
            books={books || []}
            insuranceOptions={insuranceOptions || []}
            specialisms={specialisms || []}
            updateCase={updateCase}
            archiveCase={archiveCase}
          />
        </div>

        <div className="card">
          <h2>Past clients ({(pastCases || []).length})</h2>
        <p className="muted">
          Anyone archived from your caseload. Re-add a past client and their record keeps the same
          number and details, no need to re-enter anything.
        </p>
        {(pastCases || []).length > 0 ? (
          <details className="case-accordion">
            <summary>
              Show past client{(pastCases || []).length === 1 ? "" : "s"} ({(pastCases || []).length})
            </summary>
            <form method="GET" className="field-row" style={{ alignItems: "flex-end", marginTop: "0.75rem", marginBottom: "0.75rem" }}>
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
                    <td colSpan={6} className="muted">No past clients match that search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </details>
        ) : (
          <p className="muted">No archived clients yet.</p>
        )}
      </div>

        <CaseloadDataSection cases={activeCases} />
      </CaseloadProvider>

      <PracticesBox books={books || []} />
    </div>
  );
}
