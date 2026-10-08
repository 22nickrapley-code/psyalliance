import { CONTINUITY_SECTIONS, type ContinuityAnswers } from "@/lib/continuity";
import { longDate } from "@/lib/dates";

// The plan as a document: what the print page and an accepted backup see.
export function PlanDocument({
  ownerName,
  ownerRole,
  answers,
  backup,
  alternate,
  updatedAt,
  reviewedAt,
}: {
  ownerName: string;
  ownerRole: string;
  answers: ContinuityAnswers;
  backup: { name: string; contact?: string; status?: string } | null;
  alternate: { name: string; contact?: string; status?: string } | null;
  updatedAt: string | null;
  reviewedAt: string | null;
}) {
  const v = (k: string) => (answers[k] || "").trim();
  // A plan with gaps is a draft: it says so, and isn't laid out for signing.
  const blanks = CONTINUITY_SECTIONS.reduce((n, s) => n + s.required.filter((k) => !v(k)).length, 0) + (backup ? 0 : 1);
  const draft = blanks > 0;
  return (
    <article className={`plan-doc${draft ? " is-draft" : ""}`}>
      <header className="plan-doc-head">
        <div className="plan-doc-kicker">Professional will and continuity plan{draft ? " · Draft" : ""}</div>
        <h1>{ownerName}</h1>
        <p>{ownerRole}</p>
        <p className="plan-doc-meta">
          {updatedAt ? `Last updated ${longDate(updatedAt)}` : "Not saved yet"}
          {reviewedAt ? ` · Reviewed ${longDate(reviewedAt)}` : ""}
        </p>
        {draft && (
          <p className="plan-doc-draft">
            Draft: {blanks} essential item{blanks === 1 ? "" : "s"} still to complete. Finish the plan before you sign it or give it to your backup.
          </p>
        )}
      </header>

      <section className="plan-doc-section">
        <h2>My backup</h2>
        <dl>
          <div>
            <dt>Backup (professional executor)</dt>
            <dd>{backup ? `${backup.name}${backup.contact ? ` · ${backup.contact}` : ""}` : "Not named yet"}</dd>
          </div>
          <div>
            <dt>Alternate</dt>
            <dd>{alternate ? `${alternate.name}${alternate.contact ? ` · ${alternate.contact}` : ""}` : "Not named"}</dd>
          </div>
        </dl>
      </section>

      {CONTINUITY_SECTIONS.map((s) => (
        <section key={s.key} className="plan-doc-section">
          <h2>{s.title}</h2>
          <dl>
            {s.fields.map((f) => (
              <div key={f.key}>
                <dt>{f.label}</dt>
                <dd>{v(f.key) || <span className="plan-doc-blank">Not yet written</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {!draft && (
      <section className="plan-doc-section plan-doc-sign">
        <h2>Signatures</h2>
        <p>
          I appoint the colleague named above as my backup to act on this plan, and the alternate if they can&rsquo;t. This plan contains no client
          information; access details are held as described above.
        </p>
        <div className="plan-doc-lines">
          <div><span /><small>{ownerName} &middot; signature and date</small></div>
          <div><span /><small>{backup?.name || "Backup"} &middot; signature and date</small></div>
          <div><span /><small>Witness &middot; signature, name and date</small></div>
        </div>
      </section>
      )}

      <footer className="plan-doc-foot">
        Prepared with PsyAlliance. Keep signed copies with your backup, your attorney and your own records, and review it every year.
        Plans of this kind reflect the APA Ethics Code, Standards 3.12 and 10.09. This is not legal advice; check your state&rsquo;s requirements.
      </footer>
    </article>
  );
}
