import { PublicNav, PublicFooter } from "../_public/chrome";
import { JOIN_HREF, TOUR_URL } from "@/lib/env";
import { FOUNDING_LINE } from "@/lib/founding";
import { Director } from "../tour/director";
import { findScript } from "@/tour/demo-scripts";
import { CATEGORIES, PUBLIC_WORKFLOW, SHORT_CATEGORY, docName, publicLibraryHref, type PublicDoc } from "@/lib/library";

// The public Library (Nick, 18 Oct): every listed template's
// title, what's in it and who it's for. Opening and downloading templates
// is for members: a verified account. No review wording is shown here.

export const joinFrom = (code: string) => `${JOIN_HREF}?from=library-${code}`;
void TOUR_URL;

function Badges() {
  return (
    <div className="lib-badges">
      <span className="lib-badge">Members</span>
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

  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section lib-hero">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">Library</div>
              <h1>The Library.</h1>
              <p>
                Templates and checklists for independent practice, written for psychologists and psychiatrists. See what&rsquo;s in each one here; members open,
                download and save every template.
              </p>
            </div>
            <form method="get" action="/library" className="searchbar lib-search">
              <span className="magnify" aria-hidden="true">&#8981;</span>
              <input type="search" name="q" defaultValue={q} placeholder="Search a topic, such as leave, consent or subpoena" aria-label="Search the library" />
              <button type="submit" className="btn small-btn">Search</button>
            </form>
            <p className="lib-count micro-note">{docs.length} templates. Members get every template, beside the work it supports.</p>
          </div>
        </section>

        {!q && (
          <section className="public-section lib-demo">
            <div className="section-inner">
              <div className="section-intro">
                <div className="eyebrow">See how it works &middot; fictional people</div>
                <h2>Find the right template, in the moment you need it.</h2>
              </div>
              <Director
                script={findScript("library")!}
                tryHref={`${JOIN_HREF}?from=library-video`}
                end={{
                  title: "The right template, when you need it.",
                  text: "Create your account to save any template to your own private library.",
                  tryLabel: "Create your account",
                }}
              />
            </div>
          </section>
        )}

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
                      <Badges />
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
              <h2>Be one of the first 40 in your state.</h2>
              <p>{FOUNDING_LINE} For doctoral-level psychologists and psychiatrists, opening state by state.</p>
            </div>
            <a className="btn" href={`${JOIN_HREF}?from=library-index`}>Create your account &rarr;</a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

export function PublicResourceView({ d, related }: { d: PublicDoc; related: PublicDoc[]; preview?: boolean }) {
  const used = PUBLIC_WORKFLOW[d.code];
  const join = joinFrom(d.code);
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section lib-detail">
          <div className="section-inner">
            <div className="lib-crumbs small">
              <a href="/library">Library</a> / <b>{d.category}</b>
            </div>
            <div className="lib-detail-grid">
              <div>
                <h1>{d.title}</h1>
                <p className="lead">{d.summary}</p>
                <Badges />

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
                  </ul>
                </div>
                <p className="micro-note">Templates and guidance, not legal advice. Adapt each one to your state and practice.</p>
              </div>

              <aside className="lib-cta card">
                <div className="eyebrow">Members</div>
                <h3>Members get it now.</h3>
                <p className="small">Members get every template in the Library, beside the work it supports: open the {docName(d.code)}, download it and keep a private copy.</p>
                <a className="btn" href={join}>Create your account</a>
                <p className="lib-who micro-note">For doctoral-level psychologists and psychiatrists. Templates open once your license is verified.</p>
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
                    <Badges />
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
