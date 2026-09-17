import { createClient } from "@/lib/supabase/server";
import { uploadDocument, deleteDocument, rateDocument } from "./actions";

async function withSignedUrls(supabase: ReturnType<typeof createClient>, docs: any[]) {
  const withUrls = await Promise.all(
    docs.map(async (d) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, 60);
      return { ...d, signedUrl: data?.signedUrl || null };
    })
  );
  return withUrls;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: { q?: string; from?: string; area?: string; where?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: personalDocs }, { data: sharedDocs }, { data: treatmentAreas }, { data: ratings }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("*")
        .eq("profile_id", myself)
        .eq("owner_scope", "personal")
        .order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select("*, uploader:uploaded_by(full_name)")
        .eq("owner_scope", "world")
        .order("created_at", { ascending: false }),
      supabase.from("lookup_values").select("value").eq("category", "treatment_specialism").order("value"),
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

  const q = (searchParams?.q || "").trim().toLowerCase();
  const fromFilter = (searchParams?.from || "").trim().toLowerCase();
  const areaFilter = searchParams?.area || "";
  const whereFilter = searchParams?.where || "all";

  const personal = (await withSignedUrls(supabase, personalDocs || [])).filter((d) => {
    if (whereFilter === "world") return false;
    if (q && !d.title.toLowerCase().includes(q)) return false;
    if (areaFilter && d.treatment_area !== areaFilter) return false;
    return true;
  });

  const shared = (await withSignedUrls(supabase, sharedDocs || [])).filter((d) => {
    if (whereFilter === "personal") return false;
    if (q && !d.title.toLowerCase().includes(q)) return false;
    if (areaFilter && d.treatment_area !== areaFilter) return false;
    if (fromFilter && !(d.uploader?.full_name || "").toLowerCase().includes(fromFilter)) return false;
    return true;
  });

  return (
    <div>
      <h1>Documents</h1>
      <p className="muted">
        Personal documents are visible only to you. Shared library documents — best-practice
        guides, session frameworks, regulatory references — are visible to any signed-in
        colleague, and can be rated so the most useful ones surface.
      </p>

      <div className="card">
        <h2>Search documents</h2>
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
                <option key={t.value} value={t.value}>{t.value}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Search</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Upload</h2>
        <form action={uploadDocument}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" type="text" />
            </div>
            <div className="field">
              <label htmlFor="treatment_area">Treatment area</label>
              <select id="treatment_area" name="treatment_area" defaultValue="">
                <option value="">— None —</option>
                {(treatmentAreas || []).map((t) => (
                  <option key={t.value} value={t.value}>{t.value}</option>
                ))}
              </select>
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
        <h2>My documents ({personal.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Treatment area</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {personal.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>{d.treatment_area || "—"}</td>
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
            {personal.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">No personal documents match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Shared library ({shared.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>From</th>
              <th>Treatment area</th>
              <th>Rating</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shared.map((d) => {
              const r = ratingsByDoc.get(d.id);
              return (
                <tr key={d.id}>
                  <td>{d.title}</td>
                  <td>{d.uploader?.full_name || "—"}</td>
                  <td>{d.treatment_area || "—"}</td>
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
            {shared.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No shared documents match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
