import { createClient } from "@/lib/supabase/server";
import { archiveCase, updateCase, reactivateCase, deleteCase } from "./actions";
import { CaseloadProvider } from "./caseload-context";
import AddClientBox from "./add-client-box";
import ActiveClientsBoard from "./active-clients-board";
import CaseloadDataSection from "./caseload-data-section";
import PracticesBox from "./practices-box";
import SinglePatientReferral from "../single-patient-referral";
import PastClientsBox from "./past-clients-box";

export default async function CaseloadPage(
  props: {
    searchParams: Promise<{ insurance_requested?: string; error?: string; spr?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: books }, { data: cases }, { data: pastCases }, { data: specialisms }, { data: insuranceOptions }] = await Promise.all([
    supabase.from("profiles").select("primary_state").eq("id", user!.id).maybeSingle(),
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
  const pastClientRows = (pastCases || []).map((c: any) => ({
    id: c.id,
    private_label: c.private_label,
    org: c.books_of_business?.name || null,
    state: c.state,
    rate: c.rate_per_session,
  }));

  // Resolves which active client (if any) the Single Patient Referral box
  // at the bottom of the page just matched, so the table above can highlight
  // that row - a plain server-side lookup passed down as an id, rather than
  // routing through the treatment-area highlight context (CaseloadContext),
  // which is a different mechanism built for the pie-chart click-to-highlight
  // feature. Mirrors the lookup SinglePatientReferral does itself, scoped to
  // active clients only since that's all ActiveClientsBoard renders.
  const sprQuery = (searchParams.spr || "").trim();
  let highlightedClientId: number | null = null;
  if (sprQuery) {
    const asNumber = Number(sprQuery);
    let hq = supabase.from("caseload_clients").select("id").eq("profile_id", user!.id).eq("is_active", true);
    hq = Number.isFinite(asNumber) && String(asNumber) === sprQuery ? hq.eq("id", asNumber) : hq.ilike("private_label", `%${sprQuery}%`);
    const { data: matchRows } = await hq.limit(1);
    highlightedClientId = matchRows && matchRows.length > 0 ? matchRows[0].id : null;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
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

      <CaseloadProvider>
        <div className="card">
          <div className="widget-header">
            <h2 style={{ margin: 0 }}>Active clients ({activeCases.length})</h2>
          </div>
          <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
            <AddClientBox books={books || []} insuranceOptions={insuranceOptions || []} specialisms={specialisms || []} />
            <PastClientsBox cases={pastClientRows} reactivateCase={reactivateCase} deleteCase={deleteCase} />
          </div>
          <ActiveClientsBoard
            cases={activeCases}
            books={books || []}
            insuranceOptions={insuranceOptions || []}
            specialisms={specialisms || []}
            updateCase={updateCase}
            archiveCase={archiveCase}
            highlightedClientId={highlightedClientId}
          />
        </div>

        <CaseloadDataSection cases={activeCases} myState={profile?.primary_state || null} />
      </CaseloadProvider>

      <PracticesBox books={books || []} />

      <SinglePatientReferral supabase={supabase} myself={user!.id} query={searchParams.spr || ""} paramName="spr" />
    </div>
  );
}
