import { PageHead, Banner, Empty, Status } from "../_components/ui";
import { CATEGORIES, WORKFLOW, formatDate, libraryHref, type LibraryResource } from "@/lib/library";
import { uploadDocument, deleteDocument, createFolder, deleteFolder, moveDocumentToFolder, saveWorkingCopyAction } from "./actions";

// Practice Library (Product Spec v1). Two tabs: the curated, reviewed
// Practice Library and the member's private My Library.

export type MyDoc = {
  id: number;
  title: string;
  storagePath: string;
  folderId: number | null;
  createdAt: string;
  source: string | null;
  url: string | null;
};

const SHORT_CATEGORY: Record<string, string> = {
  "Coverage & Continuity": "Coverage",
  "Consultation & Collaboration": "Consultation",
  "Clinical Practice": "Clinical practice",
  "Regulatory & Compliance": "Compliance",
  "Business & Practice Management": "Business",
};

export function ResourceCard({ r }: { r: LibraryResource }) {
  const wf = WORKFLOW[r.code];
  return (
    <article className="card resource">
      <div className="code">
        <span>{r.code} / {SHORT_CATEGORY[r.category] || r.category}</span>
        {wf && (
          <a className="micro-note" style={{ textDecoration: "none", letterSpacing: 0, fontWeight: 600 }} href={wf.href}>
            {wf.label} &rarr;
          </a>
        )}
      </div>
      <h3>
        <a href={libraryHref(r.code)}>{r.title}</a>
      </h3>
      <p>{r.summary}</p>
      <div className="foot">
        <span className="micro-note">
          <span className={`review-dot${r.reviewed ? " ok" : ""}`} aria-hidden="true" />
          v{r.version} &middot; {r.reviewed ? `reviewed ${formatDate(r.reviewDate)}` : "provisional, review pending"}
        </span>
        <a className="text-arrow" href={libraryHref(r.code)}>Explore &#8599;</a>
      </div>
    </article>
  );
}

function LibraryTabs({ tab, mineCount }: { tab: "curated" | "mine"; mineCount: number }) {
  return (
    <nav className="tabs" aria-label="Library">
      <a className={`tab${tab === "curated" ? " active" : ""}`} href="/dashboard/documents">Practice Library</a>
      <a className={`tab${tab === "mine" ? " active" : ""}`} href="/dashboard/documents?tab=mine">
        My Library <span className="micro-note">({mineCount})</span>
      </a>
    </nav>
  );
}

export function LibraryView({
  resources,
  q,
  category,
  mineCount,
  error,
  isReviewer = false,
}: {
  resources: LibraryResource[];
  q: string;
  category: string;
  mineCount: number;
  error?: string | null;
  isReviewer?: boolean;
}) {
  return (
    <>
      <PageHead
        eyebrow="Practice resources"
        title="The Practice Library."
        lead="Templates placed near the work they support. Each one shows whether it has been independently reviewed. Adapt any template to your state and practice before you rely on it."
        actions={
          <>
            {isReviewer && <a className="btn ghost" href="/dashboard/documents/review">Review desk</a>}
            <a className="btn secondary" href="/dashboard/documents?tab=mine">My Library</a>
          </>
        }
      />
      <Banner error={error} />
      <div className="split">
        <div className="stack">
          <form method="get" action="/dashboard/documents" className="searchbar">
            <span className="magnify" aria-hidden="true">&#8981;</span>
            <input type="search" name="q" defaultValue={q} placeholder="Search a topic, task or PA number" aria-label="Search the library" />
            {category && <input type="hidden" name="category" value={category} />}
            <button type="submit" className="btn small-btn">Search</button>
          </form>
          <LibraryTabs tab="curated" mineCount={mineCount} />
          <div className="chip-row" aria-label="Categories">
            <a className={`chip${!category ? " selected" : ""}`} href={`/dashboard/documents${q ? `?q=${encodeURIComponent(q)}` : ""}`}>All</a>
            {CATEGORIES.map((c) => (
              <a
                key={c}
                className={`chip${category === c ? " selected" : ""}`}
                href={`/dashboard/documents?category=${encodeURIComponent(c)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              >
                {SHORT_CATEGORY[c]}
              </a>
            ))}
          </div>
          {resources.length === 0 ? (
            <Empty
              symbol={"▧"}
              title={q || category ? "No resources match that search." : "No resources yet."}
              body={q || category ? "Try a task name, a subject or a PA number." : "Resources appear here once they are added to the Library."}
              action={q || category ? <a className="btn secondary small-btn" href="/dashboard/documents">Clear search</a> : undefined}
            />
          ) : (
            <div className="resource-grid">
              {resources.map((r) => <ResourceCard key={r.id} r={r} />)}
            </div>
          )}
        </div>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">Editorial standard</div>
            <h3>A library with context.</h3>
            <p className="small">
              Every resource shows its version and its review status. Provisional ones are usable templates still waiting for independent review by an appointed clinician, lawyer or privacy reviewer. Each one links to the part of PsyAlliance where it helps.
            </p>
            <p className="small" style={{ marginBottom: 0 }}>
              These are templates and guidance, not legal advice. Check your state&rsquo;s rules before you use one with patients.
            </p>
          </section>
          <section className="card">
            <div className="eyebrow">In your workflow</div>
            <h3>Where these show up</h3>
            <ul className="summary-list">
              <li><span>Cover</span><strong>PA-01, PA-02</strong></li>
              <li><span>Refer</span><strong>PA-07, PA-08</strong></li>
              <li><span>Ask a question</span><strong>PA-05</strong></li>
              <li><span>Consultation groups</span><strong>PA-04</strong></li>
              <li><span>Credentials</span><strong>PA-19</strong></li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

export function ResourceDetailView({
  r,
  url,
  error,
  reviewers = [],
}: {
  r: LibraryResource;
  url: string | null;
  error?: string | null;
  reviewers?: { role: string; name: string }[];
}) {
  const wf = WORKFLOW[r.code];
  return (
    <>
      <div className="breadcrumbs small" style={{ marginBottom: 14 }}>
        <a href="/dashboard/documents">Practice Library</a> / <b>{r.code}</b>
      </div>
      <PageHead
        eyebrow={`${r.code} · ${r.category}`}
        title={r.title}
        lead={r.summary}
        actions={
          <>
            {url && <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Open the PDF</a>}
            <form action={saveWorkingCopyAction} className="inline">
              <input type="hidden" name="document_id" value={r.id} />
              <button type="submit" className="btn secondary">Save a working copy</button>
            </form>
          </>
        }
      />
      <Banner error={error} />
      <div className="split">
        <section className="card">
          <div className="card-title">
            <h3>About this resource</h3>
            {r.reviewed ? <Status>Independently reviewed</Status> : <Status tone="warn">Provisional</Status>}
          </div>
          {!r.reviewed && (
            <div className="tone-panel" style={{ marginBottom: 14 }}>
              <b>Not yet independently reviewed.</b>
              <p>This is a working template from PsyAlliance. No clinician, lawyer or privacy specialist has signed off this version yet. Check it against your state&rsquo;s rules and your own advisers before you use it.</p>
            </div>
          )}
          <ul className="summary-list">
            <li><span>Applies to</span><strong>{r.audience}</strong></li>
            <li><span>Version</span><strong>{r.version}</strong></li>
            {r.reviewed && <li><span>Last reviewed</span><strong>{formatDate(r.reviewDate)}</strong></li>}
            {r.reviewed && reviewers.map((rv) => (
              <li key={rv.role}><span>{rv.role} review</span><strong>{rv.name}</strong></li>
            ))}
            {r.nextReviewDate && <li><span>Next review</span><strong>{formatDate(r.nextReviewDate)}</strong></li>}
          </ul>
          {r.tags.length > 0 && (
            <div className="chip-row" style={{ marginTop: 16 }}>
              {r.tags.slice(0, 10).map((t) => (
                <a key={t} className="chip" href={`/dashboard/documents?q=${encodeURIComponent(t)}`}>{t}</a>
              ))}
            </div>
          )}
          <p className="small" style={{ marginTop: 16, marginBottom: 0 }}>
            A working copy goes to My Library, where only you can see it. Complete it outside PsyAlliance if it will hold patient details. Never upload a completed form that identifies a patient.
          </p>
        </section>
        <aside className="stack">
          {wf && (
            <section className="card tint">
              <div className="eyebrow">Use it where it helps</div>
              <h3>{wf.label}</h3>
              <p className="small">This resource supports that part of PsyAlliance.</p>
              <a className="btn secondary small-btn" href={wf.href}>{wf.label} &rarr;</a>
            </section>
          )}
          <section className="card">
            <div className="eyebrow">Not legal advice</div>
            <p className="small" style={{ marginBottom: 0 }}>
              Templates reflect general US practice at the review date. State law, payer rules and your licensing board&rsquo;s requirements come first.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

export function MyLibraryView({
  docs,
  folders,
  folder,
  folderCounts,
  total,
  notice,
  error,
}: {
  docs: MyDoc[];
  folders: { id: number; name: string }[];
  folder: string;
  folderCounts: Record<string, number>;
  total: number;
  notice?: string | null;
  error?: string | null;
}) {
  return (
    <>
      <PageHead
        eyebrow="Private to you"
        title="My Library."
        lead="Your working copies and uploads. Nobody else can see these."
        actions={<a className="btn secondary" href="/dashboard/documents">Practice Library</a>}
      />
      <Banner error={error} ok={notice} />
      <div className="split">
        <div className="stack">
          <LibraryTabs tab="mine" mineCount={total} />
          <div className="chip-row" aria-label="Folders">
            <a className={`chip${folder === "all" ? " selected" : ""}`} href="/dashboard/documents?tab=mine">All ({total})</a>
            {folders.map((f) => (
              <a key={f.id} className={`chip${folder === String(f.id) ? " selected" : ""}`} href={`/dashboard/documents?tab=mine&folder=${f.id}`}>
                {f.name} ({folderCounts[String(f.id)] || 0})
              </a>
            ))}
            {(folderCounts.unfiled || 0) > 0 && folders.length > 0 && (
              <a className={`chip${folder === "unfiled" ? " selected" : ""}`} href="/dashboard/documents?tab=mine&folder=unfiled">
                Unfiled ({folderCounts.unfiled})
              </a>
            )}
          </div>
          {docs.length === 0 ? (
            <Empty
              symbol={"▧"}
              title={total === 0 ? "Your working copies live here." : "Nothing in this folder."}
              body={total === 0 ? "Open a Practice Library resource and save a working copy, or upload your own practice documents." : "Move documents here from the list, or pick another folder."}
              action={total === 0 ? <a className="btn secondary small-btn" href="/dashboard/documents">Browse the Practice Library</a> : undefined}
            />
          ) : (
            <section className="card">
              {docs.map((d) => (
                <div key={d.id} className="item row between wrap">
                  <span>
                    <strong>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a> : d.title}</strong>
                    <p>
                      Added {formatDate(d.createdAt.slice(0, 10))}
                      {d.source ? ` · ${d.source}` : ""}
                    </p>
                  </span>
                  <span className="row wrap" style={{ gap: 6 }}>
                    {folders.length > 0 && (
                      <form action={moveDocumentToFolder} className="inline row" style={{ gap: 6 }}>
                        <input type="hidden" name="document_id" value={d.id} />
                        <select name="folder_id" defaultValue={d.folderId ? String(d.folderId) : ""} aria-label={`Folder for ${d.title}`} className="compact-select">
                          <option value="">Unfiled</option>
                          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <button type="submit" className="btn ghost small-btn">Move</button>
                      </form>
                    )}
                    <form action={deleteDocument} className="inline">
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="storage_path" value={d.storagePath} />
                      <button type="submit" className="btn ghost small-btn">Delete</button>
                    </form>
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="card">
            <h3>Upload a document</h3>
            <form action={uploadDocument} className="stack" style={{ gap: 12 }}>
              <label className="field">
                File
                <input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.csv" />
                <small>PDF, Word, image, text or CSV, up to 15MB.</small>
              </label>
              <label className="field">
                Title (optional)
                <input name="title" placeholder="Uses the file name if left blank" />
              </label>
              {folders.length > 0 && (
                <label className="field">
                  Folder
                  <select name="folder_id" defaultValue="">
                    <option value="">Unfiled</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
              )}
              <p className="micro-note" style={{ margin: 0 }}>Practice documents only. Don&rsquo;t upload anything that identifies a patient.</p>
              <button type="submit" className="btn">Upload</button>
            </form>
          </section>
          <section className="card tint">
            <h3>Folders</h3>
            <form action={createFolder} className="row" style={{ gap: 8 }}>
              <input name="name" placeholder="New folder name" aria-label="New folder name" required style={{ flex: 1 }} className="compact-input" />
              <button type="submit" className="btn secondary small-btn">Add</button>
            </form>
            {folders.map((f) => (
              <div key={f.id} className="item row between">
                <span className="small">{f.name}</span>
                <form action={deleteFolder} className="inline">
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className="plain-button small">Remove</button>
                </form>
              </div>
            ))}
            {folders.length > 0 && <p className="micro-note" style={{ marginBottom: 0 }}>Removing a folder keeps its documents; they move to Unfiled.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
