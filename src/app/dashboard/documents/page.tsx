import { createClient } from "@/lib/supabase/server";
import { uploadDocument, deleteDocument } from "./actions";

async function withSignedUrls(supabase: ReturnType<typeof createClient>, docs: any[]) {
  const withUrls = await Promise.all(
    docs.map(async (d) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, 60);
      return { ...d, signedUrl: data?.signedUrl || null };
    })
  );
  return withUrls;
}

export default async function DocumentsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: personalDocs }, { data: sharedDocs }] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .eq("profile_id", user!.id)
      .eq("owner_scope", "personal")
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("*")
      .eq("owner_scope", "world")
      .order("created_at", { ascending: false }),
  ]);

  const personal = await withSignedUrls(supabase, personalDocs || []);
  const shared = await withSignedUrls(supabase, sharedDocs || []);

  return (
    <div>
      <h1>Documents</h1>
      <p className="muted">
        Personal documents are visible only to you. Shared library documents are visible to any
        signed-in colleague on the platform.
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
              <label htmlFor="treatment_area">Treatment area</label>
              <input id="treatment_area" name="treatment_area" type="text" />
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
                <td colSpan={3} className="muted">No personal documents yet.</td>
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
              <th>Treatment area</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shared.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>{d.treatment_area || "—"}</td>
                <td>
                  {d.signedUrl && (
                    <a className="btn secondary" href={d.signedUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {shared.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">No shared documents yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
