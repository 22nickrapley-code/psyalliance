import { PageHead, Banner, Empty, Status } from "../_components/ui";
import { CATEGORIES, WORKFLOW, SHORT_CATEGORY, SHARE_ASK, formatDate, libraryHref, publicLibraryHref, type LibraryResource } from "@/lib/library";
import { JOIN_URL, REAL_SITE_URL } from "@/lib/env";

function shareHref(code: string) {
  const s = SHARE_ASK[code];
  if (!s) return null;
  const body = `${s.ask}\n\nThe template: ${REAL_SITE_URL}${publicLibraryHref(code)}\n\nYou can create a PsyAlliance account here: ${JOIN_URL}`;
  return `mailto:?subject=${encodeURIComponent(s.subject)}&body=${encodeURIComponent(body)}`;
}
import { uploadDocument, deleteDocument, createFolder, deleteFolder, moveDocumentToFolder, saveWorkingCopyAction } from "./actions";

// Library (Product Spec v1). Two tabs: the curated Practice
// Library and the member's private My Library. Members never see review
// status (Nick, 18 Oct): a resource is ready to use, or "coming soon".

export type MyDoc = {
  id: number;
  title: string;
  storagePath: string;
  folderId: number | null;
  createdAt: string;
  source: string | null;
  url: string | null;
};

export function ResourceCard({ r }: { r: LibraryResource }) {
  const wf = WORKFLOW[r.code];
  return (
    <article className="card resource">
      <div className="code">
        <span>{SHORT_CATEGORY[r.category] || r.category}</span>
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
        {r.available ? <span className="micro-note">Version {r.version}</span> : <span className="soon-chip">Coming soon</span>}
        <a className="text-arrow" href={libraryHref(r.code)}>Explore &rarr;</a>
      </div>
    </article>
  );
}

function LibraryTabs({ tab, mineCount }: { tab: "curated" | "mine"; mineCount: number }) {
  return (
    <nav className="tabs" aria-label="Library">
      <a className={`tab${tab === "curated" ? " active" : ""}`} href="/dashboard/documents">Library</a>
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
        title="Library"
        lead="Templates placed near the work they support. Adapt any template to your state and practice before you rely on it."
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
            <input type="search" name="q" defaultValue={q} placeholder="Search a topic or task, such as leave or consent" aria-label="Search the library" />
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
              body={q || category ? "Try a task name or a subject." : "Resources appear here once they are added to the Library."}
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
            <div className="eyebrow">How to use them</div>
            <h3>A library with context.</h3>
            <p className="small">
              Each resource links to the part of PsyAlliance where it helps. Save a PDF to My Library to keep a private copy, and fill it in outside PsyAlliance.
            </p>
            <p className="small" style={{ marginBottom: 0 }}>
              These are templates and guidance, not legal advice. Check your state&rsquo;s rules before you use one with clients.
            </p>
          </section>
          <section className="card">
            <div className="eyebrow">In your workflow</div>
            <h3>Where these show up</h3>
            <ul className="summary-list">
              <li><span>Cover</span><strong>Coverage agreement, leave pack</strong></li>
              <li><span>Continuity plan</span><strong>Professional will</strong></li>
              <li><span>Refer</span><strong>Referral letters, split treatment</strong></li>
              <li><span>Ask a question</span><strong>Case consultation</strong></li>
              <li><span>Consultation groups</span><strong>Group charter</strong></li>
              <li><span>Credentials</span><strong>Renewal tracker</strong></li>
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
  const share = shareHref(r.code);
  return (
    <>
      <div className="breadcrumbs small" style={{ marginBottom: 14 }}>
        <a href="/dashboard/documents">&larr; Library</a>
      </div>
      <PageHead
        eyebrow={r.category}
        title={r.title}
        lead={r.summary}
        actions={
          <>
            {r.available && url && <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Open the PDF</a>}
            {r.available && (
              <form action={saveWorkingCopyAction} className="inline">
                <input type="hidden" name="document_id" value={r.id} />
                <button type="submit" className="btn secondary">Save PDF to My Library</button>
              </form>
            )}
          </>
        }
      />
      <Banner error={error} />
      <div className="split">
        <section className="card">
          <div className="card-title">
            <h3>About this resource</h3>
            {!r.available && <span className="soon-chip">Coming soon</span>}
          </div>
          {!r.available && (
            <p className="small" style={{ marginTop: 0 }}>
              This template is coming soon. You&rsquo;ll be able to open it and save a copy here as soon as it&rsquo;s ready.
            </p>
          )}
          {(r.contents || []).length > 0 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 8 }}>What&rsquo;s inside</div>
              <ul className="lib-inside" style={{ marginBottom: 18 }}>
                {(r.contents || []).map((c) => <li key={c}>{c}</li>)}
              </ul>
            </>
          )}
          <ul className="summary-list">
            <li><span>Applies to</span><strong>{r.audience}</strong></li>
            <li><span>Version</span><strong>{r.version}</strong></li>
          </ul>
          {r.tags.length > 0 && (
            <div className="chip-row" style={{ marginTop: 16 }}>
              {r.tags.slice(0, 10).map((t) => (
                <a key={t} className="chip" href={`/dashboard/documents?q=${encodeURIComponent(t)}`}>{t}</a>
              ))}
            </div>
          )}
          <p className="small" style={{ marginTop: 16, marginBottom: 0 }}>
            {r.available ? "" : "When it's ready: "}Save PDF to My Library keeps a private copy that only you can see. Print it or fill it in outside PsyAlliance, especially if it will hold client details. Never upload a completed form that identifies a client.
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
          {share && (
            <section className="card">
              <div className="eyebrow">Needs a colleague</div>
              <h3>{SHARE_ASK[r.code].subject}</h3>
              <p className="small">Send this template to the colleague you have in mind, with a link to ask to join.</p>
              <a className="btn secondary small-btn" href={share}>Send to a colleague</a>
            </section>
          )}
          <section className="card">
            <div className="eyebrow">Not legal advice</div>
            <p className="small" style={{ marginBottom: 0 }}>
              Templates reflect general US practice. State law, payer rules and your licensing board&rsquo;s requirements come first; check a template with your own advisers before relying on it.
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
        title="My Library"
        lead="Your working copies and uploads. Nobody else can see these."
        actions={<a className="btn secondary" href="/dashboard/documents">Library</a>}
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
              body={total === 0 ? "Open a Library template and save its PDF, or upload your own practice documents." : "Move documents here from the list, or pick another folder."}
              action={total === 0 ? <a className="btn secondary small-btn" href="/dashboard/documents">Browse the Library</a> : undefined}
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
              <p className="micro-note" style={{ margin: 0 }}>Practice documents only. Don&rsquo;t upload anything that identifies a client.</p>
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
