import { shortDate } from "@/lib/dates";
import { docName } from "@/lib/library";
import { PageHead, Status, Empty } from "../../_components/ui";
import { filterLeads, type LeadsData } from "./load";

export function LeadsView({ d, doc, intent, error }: { d: LeadsData; doc: string; intent: string; error: string | null }) {
  const leads = d.leads || [];
  const shown = filterLeads(leads, doc, intent);

  const codes = Array.from(new Set([...leads.map((l) => l.library_code), ...Object.keys(d.joins || {}).map((k) => k.replace(/^library-/, "")).filter((k) => /^PA-\d+$/.test(k))])).sort();
  const perDoc = codes.map((c) => ({
    code: c,
    downloads: leads.filter((l) => l.library_code === c && l.intent === "download").length,
    notify: leads.filter((l) => l.library_code === c && l.intent === "notify").length,
    joins: (d.joins || {})[`library-${c}`] || 0,
  }));
  const fromIndex = (d.joins || {})["library-index"] || 0;
  const qs = new URLSearchParams({ ...(doc ? { doc } : {}), ...(intent ? { intent } : {}) }).toString();

  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="Library leads"
        lead="People who asked for a template from the public Library. Follow up by hand for now; email isn't connected yet."
        actions={
          <>
            <a className="btn secondary" href="/dashboard/admin/library">Library governance</a>
            <a className="btn" href={`/dashboard/admin/library-leads/csv${qs ? `?${qs}` : ""}`}>Download CSV</a>
          </>
        }
      />
      {error && <div className="banner error">{error}</div>}

      <div className="split">
        <section className="card">
          <div className="card-title"><h3>Requests</h3><span className="micro-note">{shown.length} of {leads.length}, newest first</span></div>
          <form method="get" className="filter-grid leads-filter" style={{ marginBottom: 14 }}>
            <label className="field">
              Template
              <select name="doc" defaultValue={doc}>
                <option value="">All templates</option>
                {codes.map((c) => <option key={c} value={c}>{c} {docName(c)}</option>)}
              </select>
            </label>
            <label className="field">
              Asked for
              <select name="intent" defaultValue={intent}>
                <option value="">Downloads and notify requests</option>
                <option value="download">Downloads</option>
                <option value="notify">Tell me when it&rsquo;s free</option>
              </select>
            </label>
            <span className="row" style={{ gap: 6 }}>
              <button type="submit" className="btn secondary small-btn">Filter</button>
              {(doc || intent) && <a className="text-arrow" href="/dashboard/admin/library-leads">Clear</a>}
            </span>
          </form>
          {shown.length === 0 ? (
            <Empty symbol={"▤"} title={leads.length ? "No requests match these filters." : "No requests yet."} body="Requests appear here when someone downloads a template or asks to hear when one is free." />
          ) : (
            shown.slice(0, 300).map((l) => (
              <div key={l.id} className="item lead-row">
                <span>
                  <strong>{l.full_name}</strong>
                  <p>
                    <a href={`mailto:${l.email}`}>{l.email}</a> &middot; {l.role}
                    {l.state ? ` · ${l.state}` : ""}
                  </p>
                </span>
                <span className="lead-meta">
                  <Status tone={l.intent === "download" ? "" : "warn"}>{docName(l.library_code)} &middot; {l.intent === "download" ? "Download" : "Notify"}</Status>
                  <small>{shortDate(l.created_at)}</small>
                </span>
              </div>
            ))
          )}
        </section>

        <aside className="stack">
          <section className="card">
            <div className="card-title"><h3>By template</h3></div>
            {perDoc.length === 0 ? (
              <p className="small" style={{ marginBottom: 0 }}>Nothing yet.</p>
            ) : (
              <table className="leads-table">
                <thead>
                  <tr><th>Template</th><th>Downloads</th><th>Notify</th><th>Joins</th></tr>
                </thead>
                <tbody>
                  {perDoc.map((p) => (
                    <tr key={p.code}>
                      <td><a href={`/dashboard/admin/library-leads?doc=${p.code}`}>{p.code}</a></td>
                      <td>{p.downloads}</td>
                      <td>{p.notify}</td>
                      <td>{p.joins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="micro-note" style={{ marginBottom: 0, marginTop: 12 }}>
              Joins are requests to join that started on that template&rsquo;s page.{fromIndex ? ` ${fromIndex} more started on the Library index.` : ""}
            </p>
          </section>
          <section className="card tint">
            <div className="eyebrow">Privacy</div>
            <p className="small" style={{ marginBottom: 0 }}>
              Each person was told we&rsquo;d email them when the template is updated and when PsyAlliance opens in their state. Remove anyone who asks.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
