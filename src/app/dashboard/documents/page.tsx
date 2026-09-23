import { createClient } from "@/lib/supabase/server";
import { deleteDocument, rateDocument, createFolder, deleteFolder, moveDocumentToFolder } from "./actions";
import DocumentsUploadBox from "./documents-upload-box";
import { fileReportAction } from "../moderation-actions";

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

// A "General" document is deliberately its own bucket, not a wildcard - it
// shows up here instead of a dash, but never counts as a match for a
// specific treatment-area filter (see matchesCommon below).
function renderAreas(d: { areas: { id: number; value: string }[]; is_general?: boolean }) {
  if (d.areas.length > 0) return d.areas.map((a) => a.value).join(", ");
  if (d.is_general) return <span className="tag">General</span>;
  return "-";
}

export default async function DocumentsPage(
  props: {
    searchParams: Promise<{ q?: string; from?: string; area?: string; where?: string; sort?: string; folder?: string; uploaded?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: personalDocs }, { data: sharedDocs }, { data: treatmentAreas }, { data: ratings }, { data: folders }, { data: me }] =
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
      supabase.from("document_folders").select("id, name").eq("profile_id", myself).order("name"),
      supabase.from("profiles").select("is_admin").eq("id", myself).maybeSingle(),
    ]);

  const isAdmin = !!me?.is_admin;
  const myFolders = folders || [];

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
  const personalAllUnfiltered = await withSignedUrls(supabase, (personalDocs || []).map(withAreas));
  // Addendum A6: "a resource cannot move to Published until every required
  // reviewer role has approved it" also means a resource with required
  // roles set is never member-visible before that - draft/needs_review/
  // in_review all stay hidden here. A document nobody has ever gated with
  // required_reviewer_roles is treated as ungated and shows as before, so
  // this doesn't hide anything that predates the governance workflow.
  const sharedGoverned = (sharedDocs || []).filter(
    (d: any) => d.review_status === "published" || (d.required_reviewer_roles || []).length === 0
  );
  const sharedAllUnsorted = await withSignedUrls(supabase, sharedGoverned.map(withAreas));

  const folderFilter = searchParams?.folder || "all";
  const personalAll =
    folderFilter === "all"
      ? personalAllUnfiltered
      : folderFilter === "unfiled"
        ? personalAllUnfiltered.filter((d) => !d.folder_id)
        : personalAllUnfiltered.filter((d) => String(d.folder_id) === folderFilter);
  const folderCounts = new Map<string, number>();
  for (const d of personalAllUnfiltered) {
    const key = d.folder_id ? String(d.folder_id) : "unfiled";
    folderCounts.set(key, (folderCounts.get(key) || 0) + 1);
  }

  const sortBy = searchParams?.sort || "rating";
  const sharedAll = [...sharedAllUnsorted].sort((a, b) => {
    if (sortBy === "latest") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortBy === "area") {
      const aName = a.is_general ? "General" : a.areas[0]?.value || "￿";
      const bName = b.is_general ? "General" : b.areas[0]?.value || "￿";
      return aName.localeCompare(bName) || a.title.localeCompare(b.title);
    }
    const ra = ratingsByDoc.get(a.id)?.avg ?? -1;
    const rb = ratingsByDoc.get(b.id)?.avg ?? -1;
    if (rb !== ra) return rb - ra;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const q = (searchParams?.q || "").trim().toLowerCase();
  const fromFilter = (searchParams?.from || "").trim().toLowerCase();
  const areaFilter = searchParams?.area || "";
  const areaFilterId = areaFilter && areaFilter !== "general" ? Number(areaFilter) : null;
  const areaFilterGeneral = areaFilter === "general";
  const whereFilter = searchParams?.where || "all";
  const hasSearchQuery = !!(q || fromFilter || areaFilter || (searchParams?.where && searchParams.where !== "all"));

  function matchesCommon(d: any) {
    if (q && !d.title.toLowerCase().includes(q)) return false;
    if (areaFilterId && !d.areas.some((a: { id: number }) => a.id === areaFilterId)) return false;
    if (areaFilterGeneral && !d.is_general) return false;
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
        Your Personal Library is visible only to you. The Shared Library (best-practice guides,
        session frameworks, regulatory references) is visible to any signed-in colleague, and can
        be rated so the most useful ones surface.
      </p>

      {searchParams?.error && <div className="error-banner">{searchParams.error}</div>}

      {searchParams?.uploaded === "1" && (
        <div className="message-banner">Document uploaded successfully.</div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <DocumentsUploadBox treatmentAreas={treatmentAreas || []} folders={myFolders} />
      </div>

      <div className="card">
        <h2>My Personal Library ({personalAllUnfiltered.length})</h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center", marginBottom: "1rem" }}>
          <a
            href="/dashboard/documents?folder=all"
            className="tag"
            style={folderFilter === "all" ? { background: "var(--accent)", color: "#fff" } : undefined}
          >
            All ({personalAllUnfiltered.length})
          </a>
          <a
            href="/dashboard/documents?folder=unfiled"
            className="tag"
            style={folderFilter === "unfiled" ? { background: "var(--accent)", color: "#fff" } : undefined}
          >
            Unfiled ({folderCounts.get("unfiled") || 0})
          </a>
          {myFolders.map((f) => (
            <a
              key={f.id}
              href={`/dashboard/documents?folder=${f.id}`}
              className="tag gold"
              style={folderFilter === String(f.id) ? { background: "var(--gold)", color: "#fff" } : undefined}
            >
              {f.name} ({folderCounts.get(String(f.id)) || 0})
            </a>
          ))}
          <form action={createFolder} style={{ display: "inline-flex", gap: "0.3rem", marginLeft: "0.3rem" }}>
            <input
              type="text"
              name="name"
              placeholder="New folder name"
              required
              style={{ fontSize: "0.78rem", padding: "0.25rem 0.5rem", width: 150 }}
            />
            <button type="submit" className="secondary" style={{ fontSize: "0.78rem", padding: "0.25rem 0.6rem" }}>
              + Folder
            </button>
          </form>
          {folderFilter !== "all" && folderFilter !== "unfiled" && (
            <form action={deleteFolder} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={folderFilter} />
              <button type="submit" className="danger" style={{ fontSize: "0.78rem", padding: "0.25rem 0.6rem" }}>
                Delete this folder
              </button>
            </form>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Treatment areas</th>
              <th>Folder</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {personalAll.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>{renderAreas(d)}</td>
                <td>
                  <form action={moveDocumentToFolder} style={{ display: "inline-flex", gap: "0.3rem" }}>
                    <input type="hidden" name="document_id" value={d.id} />
                    <select name="folder_id" defaultValue={d.folder_id || ""} style={{ fontSize: "0.8rem", padding: "0.25rem" }}>
                      <option value="">Unfiled</option>
                      {myFolders.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <button type="submit" className="secondary" style={{ fontSize: "0.78rem", padding: "0.25rem 0.5rem" }}>
                      Move
                    </button>
                  </form>
                </td>
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
                <td colSpan={4} className="muted">
                  {folderFilter === "all"
                    ? "No personal documents yet, upload one above."
                    : "Nothing in this folder yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h2>Shared Library ({sharedAll.length})</h2>
            <p className="muted">
              {sortBy === "latest" ? "Sorted by newest first." : sortBy === "area" ? "Sorted by treatment area." : "Ranked by rating, highest first."}
            </p>
          </div>
          <form method="GET" className="field-row" style={{ alignItems: "flex-end", marginBottom: 0 }}>
            {folderFilter !== "all" && <input type="hidden" name="folder" value={folderFilter} />}
            <div className="field" style={{ maxWidth: 170, marginBottom: 0 }}>
              <label htmlFor="sort">Sort by</label>
              <select id="sort" name="sort" defaultValue={sortBy}>
                <option value="rating">Rating</option>
                <option value="latest">Latest</option>
                <option value="area">Treatment area</option>
              </select>
            </div>
            <div className="field" style={{ flex: "0 0 auto", marginBottom: 0 }}>
              <button type="submit" className="secondary">Sort</button>
            </div>
          </form>
        </div>
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
                  <td>
                    {d.uploader?.full_name ? (
                      <a href={`/dashboard/people/${d.uploaded_by}`} className="person-link">{d.uploader.full_name}</a>
                    ) : "-"}
                  </td>
                  <td>{renderAreas(d)}</td>
                  <td>
                    {r ? (
                      <span className="tag gold" title={`${r.count} rating${r.count === 1 ? "" : "s"}, averaged`}>
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
                    {(d.uploaded_by === myself || isAdmin) && (
                      <form action={deleteDocument} style={{ display: "inline", marginLeft: "0.4rem" }}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="storage_path" value={d.storage_path} />
                        <button type="submit" className="danger" title={d.uploaded_by === myself ? "Delete your upload" : "Delete as admin"}>
                          Delete
                        </button>
                      </form>
                    )}
                    {d.uploaded_by !== myself && (
                      <details style={{ display: "inline-block", marginLeft: "0.4rem" }}>
                        <summary className="muted" style={{ fontSize: "0.78rem", cursor: "pointer", display: "inline-block" }}>Report</summary>
                        <form action={fileReportAction} style={{ marginTop: "0.3rem", maxWidth: 280 }}>
                          <input type="hidden" name="target_type" value="library_document" />
                          <input type="hidden" name="target_id" value={d.id} />
                          <input type="hidden" name="return_to" value="/dashboard/documents" />
                          <div className="field">
                            <textarea name="reason" rows={2} placeholder="What's wrong with this document?" required />
                          </div>
                          <button type="submit" className="danger" style={{ padding: "0.1rem 0.4rem", fontSize: "0.72rem" }}>Submit report</button>
                        </form>
                      </details>
                    )}
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
          below, they don't filter the repositories above.
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
              <option value="personal">My Personal Library</option>
              <option value="world">Shared Library</option>
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
              <option value="general">General (not area-specific)</option>
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
                  <td>{d.scope === "personal" ? "My Personal Library" : "Shared Library"}</td>
                  <td>
                    {d.uploader?.full_name ? (
                      <a href={`/dashboard/people/${d.uploaded_by}`} className="person-link">{d.uploader.full_name}</a>
                    ) : "-"}
                  </td>
                  <td>{renderAreas(d)}</td>
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
