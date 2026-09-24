import { createClient } from "@/lib/supabase/server";
import { setSavedLibraryResourceAction } from "./library-actions";

const WORKFLOWS: Record<string, { href: string; label: string }> = {
  "PA-01": { href: "/dashboard/requests?tab=coverage", label: "Coverage plans" },
  "PA-02": { href: "/dashboard/requests?tab=coverage", label: "Coverage plans" },
  "PA-04": { href: "/dashboard/consult/groups", label: "Consultation groups" },
  "PA-05": { href: "/dashboard/consult", label: "Consult" },
  "PA-07": { href: "/dashboard/requests?tab=referrals", label: "Referrals" },
  "PA-08": { href: "/dashboard/messages", label: "Messages" },
  "PA-19": { href: "/dashboard/credentials", label: "Credentials" },
};

function resourceCode(title: string) {
  return /^PA-\d\d/.exec(title)?.[0] || "Resource";
}

export default async function DocumentsPage({ searchParams }: {
  searchParams: Promise<{ tab?: string; q?: string; error?: string }>;
}) {
  const { tab: tabParam, q: query, error } = await searchParams;
  const tab = tabParam === "my" ? "my" : "practice";
  const search = (query || "").trim().toLowerCase().slice(0, 100);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: published }, { data: saved }, { data: legacyPersonal }, { data: me }] = await Promise.all([
    supabase.from("documents")
      .select("id,title,version,review_date,next_review_date,publish_date,sources,applicability,customization_warning,is_general")
      .eq("owner_scope", "world").eq("review_status", "published").order("title"),
    supabase.from("saved_library_resources").select("document_id").eq("profile_id", myself),
    tab === "my" ? supabase.from("documents").select("id,title,created_at")
      .eq("profile_id", myself).eq("owner_scope", "personal").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: number; title: string; created_at: string }[] }),
    supabase.from("profiles").select("is_admin").eq("id", myself).maybeSingle(),
  ]);
  const savedIds = new Set((saved || []).map((s) => s.document_id));
  const resources = (published || []).filter((d) =>
    (tab === "practice" || savedIds.has(d.id)) &&
    (!search || `${d.title} ${d.applicability || ""} ${resourceCode(d.title)}`.toLowerCase().includes(search))
  );

  return <div className="library-page">
    <div className="library-intro">
      <div><span className="section-kicker">Professional resources</span><h1>Practice Library</h1>
        <p>Reviewed resources for coverage, referrals, consultation and the practical work behind independent practice.</p></div>
      {me?.is_admin && <a className="btn secondary" href="/dashboard/admin/library">Review queue →</a>}
    </div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <nav className="library-tabs" aria-label="Library sections">
      <a href="/dashboard/documents" aria-current={tab === "practice" ? "page" : undefined}>Practice Library <span>{published?.length || 0}</span></a>
      <a href="/dashboard/documents?tab=my" aria-current={tab === "my" ? "page" : undefined}>My Library <span>{savedIds.size}</span></a>
    </nav>
    <div className="library-filter-bar">
      <div><h2>{tab === "my" ? "Saved for your practice" : "Find the right resource"}</h2>
        <p>{tab === "my" ? "Your saved resources and older personal files." : "Search by task, title or PA number. Open the current reviewed version before using a template."}</p></div>
      <form method="get" action="/dashboard/documents" role="search">
        {tab === "my" && <input type="hidden" name="tab" value="my" />}
        <label htmlFor="library-search" className="sr-only">Search resources</label>
        <input id="library-search" type="search" name="q" defaultValue={query || ""} placeholder="Search resources or PA number" />
        <button type="submit">Search</button>
      </form>
    </div>
    {resources.length ? <div className="library-grid">
      {resources.map((d) => {
        const code = resourceCode(d.title);
        const workflow = WORKFLOWS[code];
        const isSaved = savedIds.has(d.id);
        return <article className="library-resource" key={d.id}>
          <div className="library-resource-top"><span className="library-code">{code}</span>
            <span className="library-reviewed">Reviewed {d.review_date || "date pending"}</span></div>
          <h3>{d.title.replace(/^PA-\d\d:\s*/, "")}</h3>
          <p className="library-purpose">{d.applicability || "Review the scope and customization guidance before use."}</p>
          <div className="library-resource-meta"><span>Version {d.version}</span><span>·</span><span>{d.is_general ? "General practice" : "Professional resource"}</span></div>
          <div className="library-resource-actions">
            <a className="btn" href={`/dashboard/documents/${d.id}/open`} target="_blank" rel="noreferrer">Open resource ↗</a>
            <form action={setSavedLibraryResourceAction}>
              <input type="hidden" name="document_id" value={d.id} />
              <input type="hidden" name="intent" value={isSaved ? "remove" : "save"} />
              <button className="secondary" type="submit">{isSaved ? "Remove saved" : "Save"}</button>
            </form>
          </div>
          {workflow && <a className="library-context-link" href={workflow.href}>Go to {workflow.label} →</a>}
          <details className="library-details"><summary>Sources, scope and cautions</summary>
            <dl><dt>Sources</dt><dd>{d.sources || "Not supplied"}</dd>
              <dt>Review schedule</dt><dd>{d.next_review_date ? `Next review ${d.next_review_date}` : "Review date pending"}</dd>
              <dt>Customization</dt><dd>{d.customization_warning || "Adapt to your circumstances and applicable rules before use."}</dd></dl>
          </details>
        </article>;
      })}
    </div> : <div className="library-empty">
      <h2>{search ? "No matching resources" : tab === "my" ? "Nothing saved yet" : "Resources are being reviewed"}</h2>
      <p>{search ? "Try another title or PA number." : tab === "my"
        ? "Save a published resource from the Practice Library to find it here later."
        : "The Practice Library will show resources as each version completes its independent review."}</p>
      {tab === "my" && <a className="btn" href="/dashboard/documents">Browse Practice Library</a>}
    </div>}
    {tab === "my" && !!legacyPersonal?.length && <details className="library-legacy">
      <summary>Older personal files ({legacyPersonal.length})</summary>
      <p>Existing personal files are available to open while their retention and export path is reviewed. New uploads are paused because files may include patient information.</p>
      <ul>{legacyPersonal.map((d) => <li key={d.id}><span>{d.title}</span><a href={`/dashboard/documents/${d.id}/open`} target="_blank" rel="noreferrer">Open ↗</a></li>)}</ul>
    </details>}
  </div>;
}
