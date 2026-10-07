// The public "When you're full" page, rendered from its data.
import { clinicianName, roleLabel } from "@/lib/profession";
import { shortDate } from "@/lib/dates";
import { IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";

export type Colleague = {
  name: string;
  prefix: string | null;
  qualification: string | null;
  city: string | null;
  state: string | null;
  referral: string | null;
  confirmed_at: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  focus: string[];
  sessions: string[];
};

export type OverflowData = {
  owner: { name: string; prefix: string | null; qualification: string | null; city: string | null; state: string | null };
  message: string | null;
  colleagues: Colleague[];
};

const sessionLabel = (s: string) => (/face/i.test(s) ? "In person" : /virtual|tele/i.test(s) ? "Telehealth" : s);
const telHref = (p: string) => `tel:${p.replace(/[^0-9+]/g, "")}`;

export function OverflowPublicView({ d }: { d: OverflowData }) {
  const owner = clinicianName(d.owner.name, d.owner.qualification, d.owner.prefix);
  const first = owner.replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0];
  const where = [d.owner.city, d.owner.state].filter(Boolean).join(", ");

  return (
    <div className="pa full-public">
      <header className="full-public-head">
        <a className="brand" href={IS_DEMO_SITE ? "/tour" : "/"}>
          <span className="brand-mark" aria-hidden="true">&psi;</span>psyalliance
        </a>
      </header>
      <main className="full-public-main">
        <section className="full-owner">
          <div className="eyebrow">{where || "Independent practice"}</div>
          <h1>{owner}</h1>
          <p className="full-message">{d.message || `${first} isn't taking new clients right now. These colleagues they trust have openings.`}</p>
        </section>

        {d.colleagues.length === 0 ? (
          <section className="card full-empty">
            <h2>No colleague openings listed today.</h2>
            <p>Openings change often. Please check back, or contact {first}&rsquo;s practice for a recommendation.</p>
          </section>
        ) : (
          <section className="full-cards" aria-label="Colleagues with openings">
            {d.colleagues.map((c, i) => {
              const name = clinicianName(c.name, c.qualification, c.prefix);
              return (
                <article key={i} className="full-card">
                  <div className="full-card-top">
                    <span className="full-initials" aria-hidden="true">
                      {c.name.replace(/^(dr\.?)\s+/i, "").split(/\s+/).slice(0, 2).map((p) => p[0]).join("")}
                    </span>
                    <div>
                      <h2>{name}</h2>
                      <p>{roleLabel(c.qualification)}{c.city || c.state ? ` · ${[c.city, c.state].filter(Boolean).join(", ")}` : ""}</p>
                    </div>
                  </div>
                  <div className="full-open">
                    <span className="full-dot" aria-hidden="true" />
                    {c.referral === "yes" ? "Accepting new clients" : "Taking some new clients"}
                    {c.confirmed_at && <small> &middot; updated {shortDate(c.confirmed_at)}</small>}
                  </div>
                  {(c.focus.length > 0 || c.sessions.length > 0) && (
                    <ul className="full-tags">
                      {c.focus.map((f) => <li key={f}>{f}</li>)}
                      {c.sessions.map((s) => <li key={s} className="session">{sessionLabel(s)}</li>)}
                    </ul>
                  )}
                  {c.note && <p className="full-note">{c.note}</p>}
                  <div className="full-contact">
                    {c.phone && <a className="btn small-btn" href={telHref(c.phone)}>Call {c.phone}</a>}
                    {c.email && <a className="btn secondary small-btn" href={`mailto:${c.email}`}>Email</a>}
                    {c.website && <a className="btn secondary small-btn" href={c.website} target="_blank" rel="noopener nofollow">Website</a>}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <section className="full-trust">
          <p>
            <b>In a crisis?</b> Call or text 988, or go to your nearest emergency room.
          </p>
          <p>
            Every clinician listed is a member of PsyAlliance, a private network of psychologists and psychiatrists whose licenses are checked by a
            person. Contact them directly; nothing you share here goes through PsyAlliance.
            {IS_DEMO_SITE && " This page is part of the demo: everyone on it is fictional."}
          </p>
          <a className="text-arrow" href={IS_DEMO_SITE ? `${REAL_SITE_URL}/` : "/"}>About PsyAlliance &rarr;</a>
        </section>
      </main>
    </div>
  );
}
