import { createClient } from "@/lib/supabase/server";
import { uploadDocument, deleteDocument, rateDocument } from "./actions";

// One hour, not the 60 *seconds* this used to be set to: these signed URLs
// sit as plain <a href> links on a rendered page, and a user browsing the
// list, reading titles, and clicking "Open" a minute or two later would
// previously find the link already expired and broken. An hour comfortably
// covers a normal browse-then-click session without over-extending how long
// a leaked link stays valid.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function withSignedUrls(supabase: Awaited<ReturnType<typeof createClient>>, docs: any[]) {
  const withUrls = await Promise.all(
    docs.map(async (d) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...d, signedUrl: data?.signedUrl || null };
    })
  );
  return withUrls;
}

// A document can now carry several treatment areas (document_treatment_areas
// join table) rather than the single legacy `treatment_area` column.
function withAreas(d: any) {
  const areas = (d.document_treatment_areas || [])
    .map((dta: any) => ({ id: dta.lookup_value_id, value: dta.lookup_values?.value as string | undefined }))
    .filter((a: any) => a.value);
  return { ...d, areas: areas as { id: number; value: string }[] };
}

function renderAreas(areas: { id: number; value: string }[]) {
  return areas.length > 0 ? areas.map((a) => a.value).join(", ") : "—";
}

export default async function DocumentsPage(
  props: {
    searchParams: Promise<{ q?: string; from?: string; area?: string; where?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: personalDocs }, { data: sharedDocs }, { data: treatmentAreas }, { data: ratings }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("*, document_treatment_areas(lookup_value_id, lookup_values(value))")
        .eq("profile_id", myself)
        .eq("owner_scope", "personal")
        .order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select("*, uploader:uploaded_by(full_name), document_treatment_areas(lookup_value_id, lookup_values(value))")
        .eq("owner_scope", "world")
        .order("created_at", { ascending: false }),
      supabase.from("lookup_values").select("id, value").eq("category", "treatment_specialism").order("value"),
      supabase.from("document_ratings").select("document_id, rating, rated_by"),
    ]);

  const ratingsByDoc = new Map<number, { avg: number; count: number; mine: number | null }>();
  for (const r of ratings || []) {
    const entry = ratingsByDoc.get(r.document_id) || { avg: 0, count: 0, mine: null };
    entry.avg = (entry.avg * entry.count + r.rating) / (entry.count + 1);
    entry.count += 1;
    if (r.rated_by === myself) entry.mine = r.rating;
    ratingsByDoc.set(r.document_id, entry);
  }

  // The two repositories below (My documents / Shared library) always show
  // everything you have access to - they are never filtered by the search
  // box. Only the "Search documents" section at the bottom reacts to it.
  const personalAll = await withSignedUrls(supabase, (personalDocs || []).map(withAreas));
  const sharedAllUnsorted = await withSignedUrls(supabase, (sharedDocs || []).map(withAreas));
  const sharedAll = [...sharedAllUnsorted].sort((a, b) => {
    const ra = ratingsByDoc.get(a.id)?.avg ?? -1;
    const rb = ratingsByDoc.get(b.id)?.avg ?? -1;
    if (rb !== ra) return rb - ra;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const q = (searchParams?.q || "").trim().toLowerCase();
  const fromFilter = (searchParams?.from || "").trim().toLowerCase();
  const areaFilter = searchParams?.area || "";
  const areaFilterId = areaFilter ? Number(areaFilter) : null;
  const whereFilter = searchParams?.where || "all";
  const hasSearchQuery = !!(q || fromFilter || areaFilterId || (searchParams?.where && searchParams.where !== "all"));

  function matchesCommon(d: any) {
    if (q && !d.title.toLowerCase().includes(q)) return false;
    if (areaFilterId && !d.areas.some((a: { id: number }) => a.id === areaFilterId)) return false;
    return true;
  }

  const searchPersonal =
    hasSearchQuery && whereFilter !== "world"
      ? personalAll.filter((d) => matchesCommon(d)).map((d) => ({ ...d, scope: "personal" as const }))
      : [];
  const searchShared =
    hasSearchQuery && whereFilter !== "personal"
      ? sharedAll
          .filter((d) => matchesCommon(d) && (!fromFilter || (d.uploader?.full_name || "").toLowerCase().includes(fromFilter)))
          .map((d) => ({ ...d, scope: "shared" as const }))
      : [];
  const searchResults = [...searchPersonal, ...searchShared];

  return (
    <div>
      <h1>Documents</h1>
      <p className="muted">
        Personal documents are visible only to you. Shared library documents — best-practice
        guides, session frameworks, regulatory references — are visible to any signed-in
        colleague, and can be rated so the most useful ones surface.
      </p>

      <div className="card">
        <h2>Upload</h2>
        <form action={uploadDocument}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" type="text" />
            </div>
            <div className="field">
              <label htmlFor="treatment_area_ids">Treatment areas</label>
              <select id="treatment_area_ids" name="treatment_area_ids" multiple size={6}>
                {(treatmentAreas || []).map((t) => (
                  <option key={t.id} value={t.id}>{t.value}</option>
                ))}
              </select>
              <p className="muted" style={{ marginTop: "0.3rem", marginBottom: 0 }}>
                Hold Ctrl (Windows) or Cmd (Mac) to select more than one.
              </p>
            </div>
            <div className="field" style={{ maxWidth: 180 }}>
              <label htmlFor="owner_scope">Visibility</label>
              <select id="owner_scope" name="owner_scope" defaultValue="personal">
                <option value="personal">Personal (only me)</option>
                <option value="world">Shared library (everyone)</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="file">File</label>
            <input
              id="file"
              name="file"
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.csv"
            />
            <p className="muted" style={{ marginTop: "0.3rem", marginBottom: 0 }}>
              PDF, Word, image, plain text or CSV — up to 15MB.
            </p>
          </div>
          <button type="submit">Upload</button>
        </form>
      </div>

      <div className="card">
        <h2>My documents ({personalAll.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Treatment areas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {personalAll.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>{renderAreas(d.areas)}</td>
                <td>
                  {d.signedUrl && (
                    <a className="btn secondary" href={d.signedUrl} target="_blank" rel="noreferrer" style={{ marginRight: "0.5rem" }}>
                      Open
                    </a>
                  )}
                  <form action={deleteDocument} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="storage_path" value={d.storage_path} />
                    <button type="submit" className="danger">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {personalAll.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">No personal documents yet — upload one above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Shared library ({sharedAll.length})</h2>
        <p className="muted">Ranked by rating, highest first.</p>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>From</th>
              <th>Treatment areas</th>
              <th>Rating</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sharedAll.map((d) => {
              const r = ratingsByDoc.get(d.id);
              return (
                <tr key={d.id}>
                  <td>{d.title}</td>
                  <td>{d.uploader?.full_name || "—"}</td>
                  <td>{renderAreas(d.areas)}</td>
                  <td>
                    {r ? (
                      <span className="tag gold" title={`${r.count} rating${r.count === 1 ? "" : "s"}`}>
                        {"★".repeat(Math.round(r.avg))}{"☆".repeat(5 - Math.round(r.avg))} ({r.count})
                      </span>
                    ) : (
                      <span className="muted">No ratings yet</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {d.signedUrl && (
                      <a className="btn secondary" href={d.signedUrl} target="_blank" rel="noreferrer" style={{ marginRight: "0.5rem" }}>
                        Open
                      </a>
                    )}
                    <form action={rateDocument} style={{ display: "inline" }}>
                      <input type="hidden" name="document_id" value={d.id} />
                      <select name="rating" defaultValue={r?.mine ?? ""} style={{ width: 70, padding: "0.3rem" }}>
                        <option value="" disabled>Rate</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>{n} ★</option>
                        ))}
                      </select>{" "}
                      <button type="submit" className="secondary">Save</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {sharedAll.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">Nothing shared yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Search documents</h2>
        <p className="muted">
          Search across both your personal documents and the shared library. Results appear
          below — they don't filter the repositories above.
        </p>
        <form method="GET" className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label htmlFor="q">Search text</label>
            <input id="q" name="q" type="text" defaultValue={searchParams?.q || ""} placeholder="Title contains…" />
          </div>
          <div className="field" style={{ maxWidth: 160 }}>
            <label htmlFor="where">Where?</label>
            <select id="where" name="where" defaultValue={whereFilter}>
              <option value="all">All</option>
              <option value="personal">My documents</option>
              <option value="world">Shared library</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="from">From who?</label>
            <input id="from" name="from" type="text" defaultValue={searchParams?.from || ""} placeholder="Submitted by…" />
          </div>
          <div className="field">
            <label htmlFor="area">Treatment area</label>
            <select id="area" name="area" defaultValue={areaFilter}>
              <option value="">All</option>
              {(treatmentAreas || []).map((t) => (
                <option key={t.id} value={t.id}>{t.value}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Search</button>
          </div>
        </form>

        {hasSearchQuery ? (
          <table style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Where</th>
                <th>From</th>
                <th>Treatment areas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((d: any) => (
                <tr key={`${d.scope}-${d.id}`}>
                  <td>{d.title}</td>
                  <td>{d.scope === "personal" ? "My documents" : "Shared library"}</td>
                  <td>{d.uploader?.full_name || "—"}</td>
                  <td>{renderAreas(d.areas)}</td>
                  <td>
                    {d.signedUrl && (
                      <a className="btn secondary" href={d.signedUrl} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {searchResults.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">No documents match.</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
            Enter a search above to find documents by title, submitter, or treatment area.
          </p>
        )}
      </div>
    </div>
  );
}
