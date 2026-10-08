import { PublicNav, PublicFooter } from "../_public/chrome";
import { JOIN_HREF, TOUR_URL } from "@/lib/env";
import { CATEGORIES, PUBLIC_WORKFLOW, SHORT_CATEGORY, monthYear, docName, publicLibraryHref, type PublicDoc } from "@/lib/library";
import { LeadForm } from "./lead-form";

// The public Practice Library: every listed template, what's in it and
// whether it has been independently reviewed. Provisional templates are
// always labelled "In review"; only reviewed ones can be downloaded.

const DEMO_HREF = `${TOUR_URL}/overview`;

export const joinFrom = (code: string) => `${JOIN_HREF}?from=library-${code}`;

function reviewLine(d: PublicDoc) {
  if (!d.reviewed) return "In review";
  const names = (d.reviewers || []).join(" and ");
  return `Reviewed ${monthYear(d.review_date)}${names ? ` by ${names}` : ""}`;
}

function Badges({ d }: { d: PublicDoc }) {
  return (
    <div className="lib-badges">
      {d.downloadable ? <span className="lib-badge free">Free download</span> : <span className="lib-badge">Members</span>}
      <span className={`lib-badge review${d.reviewed ? " ok" : ""}`}>
        <span className={`review-dot${d.reviewed ? " ok" : ""}`} aria-hidden="true" />
        {reviewLine(d)}
      </span>
    </div>
  );
}

export function matchesPublic(d: PublicDoc, q: string) {
  if (!q) return true;
  const hay = [d.code, docName(d.code), d.title, d.summary, d.category, d.audience, ...(d.contents || [])].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export function PublicLibraryView({ docs, q }: { docs: PublicDoc[]; q: string }) {
  const shown = docs.filter((d) => matchesPublic(d, q));
  const groups = CATEGORIES.map((c) => ({ c, items: shown.filter((d) => d.category === c) })).filter((g) => g.items.length > 0);
  const other = shown.filter((d) => !CATEGORIES.includes(d.category));
  if (other.length) groups.push({ c: "More templates", items: other });
  const free = docs.filter((d) => d.downloadable).length;

  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section lib-hero">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">Practice Library</div>
              <h1>The Practice Library.</h1>
              <p>
                Templates and checklists for independent practice, written for psychologists and psychiatrists. Each one shows whether it has been independently
                reviewed, and by whom.
              </p>
            </div>
            <form method="get" action="/library" className="searchbar lib-search">
              <span className="magnify" aria-hidden="true">&#8981;</span>
              <input type="search" name="q" defaultValue={q} placeholder="Search a topic, such as leave, consent or subpoena" aria-label="Search the library" />
              <button type="submit" className="btn small-btn">Search</button>
            </form>
            <p className="lib-count micro-note">
              {docs.length} templates{free > 0 ? `, ${free} free to download` : ""}. Members get every template now, beside the work it supports. Each becomes a free download for everyone once it has been independently reviewed.
            </p>
          </div>
        </section>

        <section className="public-section tint lib-list">
          <div className="section-inner">
            {groups.length === 0 && (
              <div className="lib-empty">
                <b>{q ? "No templates match that search." : "The Library is being updated."}</b>
                <p className="small">{q ? "Try a task, such as leave, referral or consent." : "Please check back shortly."}</p>
                {q && <a className="btn secondary small-btn" href="/library">Show all templates</a>}
              </div>
            )}
            {groups.map((g) => (
              <div key={g.c} className="lib-group">
                <h2>{g.c}</h2>
                <div className="lib-grid">
                  {g.items.map((d) => (
                    <article key={d.code} className="lib-card">
                      <div className="lib-code">{SHORT_CATEGORY[d.category] || d.category}</div>
                      <h3><a href={publicLibraryHref(d.code)}>{d.title}</a></h3>
                      <p>{d.summary}</p>
                      <Badges d={d} />
                    </article>
                  ))}
                </div>
              </div>
            ))}
            <p className="lib-note micro-note">Templates and guidance, not legal advice. Adapt each one to your state and practice.</p>
          </div>
        </section>

        <section className="public-section">
          <div className="section-inner pa-cta">
            <div>
              <div className="eyebrow" style={{ color: "#e2c49c" }}>Members get every template</div>
              <h2>Join the founding cohort.</h2>
              <p>Founding members never pay. For doctoral-level psychologists and psychiatrists, opening state by state.</p>
            </div>
            <a className="btn" href={`${JOIN_HREF}?from=library-index`}>Create your account &rarr;</a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

export function PublicResourceView({ d, related, preview = false }: { d: PublicDoc; related: PublicDoc[]; preview?: boolean }) {
  const used = PUBLIC_WORKFLOW[d.code];
  const join = joinFrom(d.code);
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section lib-detail">
          <div className="section-inner">
            <div className="lib-crumbs small">
              <a href="/library">Practice Library</a> / <b>{d.category}</b>
            </div>
            <div className="lib-detail-grid">
              <div>
                <h1>{d.title}</h1>
                <p className="lead">{d.summary}</p>
                <Badges d={d} />

                {d.contents.length > 0 && (
                  <div className="lib-block">
                    <h2>What&rsquo;s inside</h2>
                    <ul className="lib-inside">
                      {d.contents.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                  </div>
                )}

                <div className="lib-block">
                  <ul className="summary-list lib-facts">
                    {d.audience && <li><span>Who it&rsquo;s for</span><strong>{d.audience}</strong></li>}
                    {used && <li><span>In PsyAlliance</span><strong>Used with {used}</strong></li>}
                    <li><span>Version</span><strong>{d.version}</strong></li>
                    <li>
                      <span>Review</span>
                      <strong>
                        {d.reviewed
                          ? `Independently reviewed ${monthYear(d.review_date)}${d.reviewers?.length ? ` by ${d.reviewers.join(" and ")}` : ""}`
                          : "In review: not yet independently reviewed"}
                      </strong>
                    </li>
                  </ul>
                </div>
                <p className="micro-note">Templates and guidance, not legal advice. Adapt each one to your state and practice.</p>
              </div>

              <aside className="lib-cta card">
                {d.downloadable ? (
                  <>
                    <div className="eyebrow">Free download</div>
                    <h3>Get the {docName(d.code)}</h3>
                    <LeadForm code={d.code} name={docName(d.code)} intent="download" joinHref={join} demoHref={DEMO_HREF} preview={preview} />
                  </>
                ) : (
                  <>
                    <div className="eyebrow">Members</div>
                    <h3>Members get it now.</h3>
                    <p className="small">
                      Members get every template in the Library, beside the work it supports. It becomes a free download for everyone once it has been independently reviewed.
                    </p>
                    <a className="btn" href={join}>Create your account</a>
                    <details className="lib-notify">
                      <summary>Email me when it&rsquo;s reviewed and free to download</summary>
                      <LeadForm code={d.code} name={docName(d.code)} intent="notify" joinHref={join} demoHref={DEMO_HREF} preview={preview} />
                    </details>
                  </>
                )}
                <p className="lib-who micro-note">
                  Master&rsquo;s-level clinicians are welcome to download templates. Membership is for doctoral-level psychologists and psychiatrists.
                </p>
              </aside>
            </div>
          </div>
        </section>

        {related.length > 0 && (
          <section className="public-section tint">
            <div className="section-inner">
              <h2 className="lib-related-title">More in {d.category}</h2>
              <div className="lib-grid">
                {related.map((r) => (
                  <article key={r.code} className="lib-card">
                    <div className="lib-code">{SHORT_CATEGORY[r.category] || r.category}</div>
                    <h3><a href={publicLibraryHref(r.code)}>{r.title}</a></h3>
                    <p>{r.summary}</p>
                    <Badges d={r} />
                  </article>
                ))}
              </div>
              <p className="section-more"><a className="text-arrow" href="/library">Browse all templates &rarr;</a></p>
            </div>
          </section>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
