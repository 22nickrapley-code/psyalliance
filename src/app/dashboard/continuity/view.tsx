import type { Suggestion } from "@/lib/colleague-suggestions";
import { CONTINUITY_SECTIONS, BACKUP_STATUS, planProgress, sectionDone, type ContinuityAnswers } from "@/lib/continuity";
import { longDate } from "@/lib/dates";
import { PageHead, Banner, Status } from "../_components/ui";
import { ColleaguePicker } from "../_components/colleague-picker";
import { saveContinuitySection, markContinuityReviewed } from "./actions";

type Named = { id: string; name: string; status: string } | null;

// The continuity plan builder: name a backup, say where things are and
// what should happen, then print and sign it. Useful on day one, with or
// without a network.
export function ContinuityView({
  sp,
  answers,
  backup,
  alternate,
  updatedAt,
  reviewedAt,
  suggestions,
  dutiesWaiting,
  dutiesTotal,
  known,
}: {
  sp: { saved?: string; error?: string; reviewed?: string };
  answers: ContinuityAnswers;
  backup: Named;
  alternate: Named;
  updatedAt: string | null;
  reviewedAt: string | null;
  suggestions: Suggestion[];
  dutiesWaiting: number;
  dutiesTotal: number;
  known?: { licenses: string; owner: string };
}) {
  const hasBackup = !!backup || !!(answers.backup_outside || "").trim();
  const progress = planProgress(answers, hasBackup);
  // One section at a time: the next unfinished one after the one just
  // saved, or the first unfinished one.
  const keys = CONTINUITY_SECTIONS.map((x) => x.key);
  const after = sp.saved && keys.includes(sp.saved) ? keys.indexOf(sp.saved) + 1 : 0;
  const openKey =
    CONTINUITY_SECTIONS.slice(after).find((x) => !sectionDone(x, answers))?.key ??
    CONTINUITY_SECTIONS.find((x) => !sectionDone(x, answers))?.key ??
    null;
  const savedTitle =
    sp.saved === "backup" ? "Your backup" : CONTINUITY_SECTIONS.find((s) => s.key === sp.saved)?.title;
  const reviewDue = reviewedAt ? Date.now() - new Date(reviewedAt).getTime() > 365 * 86_400_000 : false;

  return (
    <>
      <PageHead
        eyebrow="Your practice"
        title="Continuity plan"
        lead="If you couldn't practice tomorrow, who would tell your clients? Name a colleague, write down where things are, then print it and sign it. It never holds client information."
        actions={
          <a className="btn" href="/continuity/print" target="_blank" rel="noopener">
            Print or save as PDF
          </a>
        }
      />
      <Banner
        error={sp.error}
        ok={sp.reviewed ? "Marked as reviewed today." : savedTitle ? `${savedTitle} saved.` : null}
      />

      <div className="split continuity-layout">
        <div className="stack">
          <section className="card continuity-summary">
            <div className="continuity-progress">
              <div>
                <div className="eyebrow">Your plan</div>
                <h3>
                  {progress.done === progress.steps ? "Complete. Print it, sign it and give your backup a copy." : `${progress.done} of ${progress.steps} parts done`}
                </h3>
              </div>
              <span className="continuity-pct">{progress.pct}%</span>
            </div>
            <div className="continuity-bar" aria-hidden="true"><span style={{ width: `${progress.pct}%` }} /></div>
            <ol className="continuity-steps">
              <li className={hasBackup ? "done" : ""}><a href="#backup">Your backup</a></li>
              {CONTINUITY_SECTIONS.map((s) => (
                <li key={s.key} className={sectionDone(s, answers) ? "done" : ""}>
                  <a href={`#${s.key}`}>{s.title}</a>
                </li>
              ))}
            </ol>
            <div className="continuity-meta">
              <span>
                {updatedAt ? `Last changed ${longDate(updatedAt)}` : "Not started"}
                {reviewedAt ? ` · reviewed ${longDate(reviewedAt)}` : ""}
                {reviewDue && <b className="continuity-due"> · due for its yearly review</b>}
              </span>
              {updatedAt && (
                <form action={markContinuityReviewed} className="inline">
                  <button type="submit" className="plain-button small">I&rsquo;ve reviewed it today</button>
                </form>
              )}
            </div>
          </section>

          <section className="card continuity-section" id="backup">
            <div className="continuity-section-head">
              <span className={`continuity-num${hasBackup ? " done" : ""}`}>{hasBackup ? "✓" : 1}</span>
              <div>
                <h3>Your backup</h3>
                <p className="small">
                  The colleague who would tell your clients, arrange their care and look after your records. Name an alternate in case they
                  can&rsquo;t. A colleague on PsyAlliance is asked to agree, and you&rsquo;re told when they do.
                </p>
              </div>
            </div>
            <form action={saveContinuitySection} className="continuity-form">
              <input type="hidden" name="section" value="backup" />
              <div className="continuity-pick">
                <ColleaguePicker suggestions={suggestions} name="backup_profile_id" mode="single" initial={backup ? [backup.id] : []} label="Backup" clearable placeholder="Search by name, or pick from your circle" limitPerGroup={3} />
                {backup && <Status tone={BACKUP_STATUS[backup.status]?.tone || "neutral"}>{backup.name}: {BACKUP_STATUS[backup.status]?.label || backup.status}</Status>}
              </div>
              <label className="field">
                <span>Or someone not on PsyAlliance <span className="micro-note">(name, phone, email)</span></span>
                <input name="backup_outside" defaultValue={answers.backup_outside || ""} placeholder="e.g. Dr. Jane Smith, (212) 555-0123, jane@example.com" />
              </label>
              <div className="continuity-pick">
                <ColleaguePicker suggestions={suggestions} name="alternate_profile_id" mode="single" initial={alternate ? [alternate.id] : []} label="Alternate (optional)" clearable placeholder="Search by name, or pick from your circle" limitPerGroup={3} />
                {alternate && <Status tone={BACKUP_STATUS[alternate.status]?.tone || "neutral"}>{alternate.name}: {BACKUP_STATUS[alternate.status]?.label || alternate.status}</Status>}
              </div>
              <label className="field">
                <span>Alternate not on PsyAlliance <span className="micro-note">(optional)</span></span>
                <input name="alternate_outside" defaultValue={answers.alternate_outside || ""} placeholder="Name, phone, email" />
              </label>
              <div className="continuity-save">
                <button type="submit" className="btn">Save your backup</button>
                <span className="micro-note">Changing who you name asks the new colleague again.</span>
              </div>
            </form>
          </section>

          {CONTINUITY_SECTIONS.map((s, i) => {
            const done = sectionDone(s, answers);
            const isOpen = s.key === openKey;
            return (
              <details key={s.key} className="card continuity-section" id={s.key} open={isOpen} data-just-added={isOpen && sp.saved ? "" : undefined}>
                <summary className="continuity-section-head">
                  <span className={`continuity-num${done ? " done" : ""}`}>{done ? "✓" : i + 2}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p className="small">{done ? "Done. Open to change it." : s.why}</p>
                  </div>
                  <span className="continuity-chevron" aria-hidden="true" />
                </summary>
                {done && <p className="small continuity-why">{s.why}</p>}
                <form action={saveContinuitySection} className="continuity-form">
                  <input type="hidden" name="section" value={s.key} />
                  {s.fields.map((f) => {
                    const fromProfile = answers[f.key] === undefined && f.key === "licenses" && !!known?.licenses;
                    const preset = f.preset && known?.owner ? f.preset.replace("Dr. [name]", known.owner) : f.preset;
                    const value = answers[f.key] ?? (fromProfile ? known!.licenses : preset) ?? "";
                    const suggested = answers[f.key] === undefined && !!f.preset;
                    return (
                      <label key={f.key} className="field">
                        <span>
                          {f.label}
                          {suggested && <span className="continuity-suggested">Suggested wording, edit freely</span>}
                          {fromProfile && <span className="continuity-suggested">From your credentials, check and save</span>}
                        </span>
                        {f.kind === "long" ? (
                          <textarea name={f.key} rows={4} defaultValue={value} placeholder={f.placeholder} maxLength={2000} />
                        ) : (
                          <input name={f.key} defaultValue={value} placeholder={f.placeholder} maxLength={2000} />
                        )}
                        {f.hint && <small>{f.hint}</small>}
                      </label>
                    );
                  })}
                  <div className="continuity-save">
                    <button type="submit" className="btn">{i < CONTINUITY_SECTIONS.length - 1 ? "Save and continue" : "Save"}</button>
                    <span className="micro-note">Saved as you go. Come back any time.</span>
                  </div>
                </form>
              </details>
            );
          })}
        </div>

        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">Why it matters</div>
            <h3>Most clinicians have nothing written down.</h3>
            <p className="small">
              The APA Ethics Code expects psychologists to plan for interrupted care (Standards 3.12 and 10.09). A short plan and a colleague who has
              agreed to act on it mean your clients hear from someone who knows what to do.
            </p>
            <p className="small">
              Prefer paper? The <a href="/dashboard/documents/professional-will">Professional Will template</a> in the Practice Library covers the same ground,
              with an executor acceptance form.
            </p>
            <p className="small" style={{ marginBottom: 0 }}>
              This isn&rsquo;t legal advice. Some states have specific rules on records; check yours and ask your attorney to keep a signed copy.
            </p>
          </section>
          <section className="card">
            <div className="eyebrow">Keeping it safe</div>
            <ul className="continuity-rules">
              <li>No client names or details: the plan says where records are, not what&rsquo;s in them.</li>
              <li>No passwords: name who holds the access details.</li>
              <li>Only you and a backup who has agreed can open it.</li>
            </ul>
          </section>
          {dutiesTotal > 0 && (
            <section className="card">
              <div className="eyebrow">Named in a colleague&rsquo;s plan</div>
              <p className="small">
                {dutiesWaiting > 0
                  ? `${dutiesWaiting} colleague${dutiesWaiting === 1 ? " has" : "s have"} asked you to be their backup.`
                  : `You're the backup in ${dutiesTotal} colleague${dutiesTotal === 1 ? "'s plan" : "s' plans"}.`}
              </p>
              <a className="btn secondary small-btn" href="/dashboard/continuity/duties">{dutiesWaiting > 0 ? "Reply" : "See plans"}</a>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
