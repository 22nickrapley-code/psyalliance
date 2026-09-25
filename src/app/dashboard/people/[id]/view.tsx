import { sendConnectionRequest, respondToConnection, removeConnection, saveClinicianAction, removeSavedClinicianAction } from "../../network/actions";
import { startConversation } from "../../messages/actions";
import { addToBlocklist, removeFromBlocklist, blockMemberAction } from "../../settings/actions";
import { fileReportAction } from "../../moderation-actions";
import { Banner, PersonAvatar } from "../../_components/ui";

// A colleague's profile, laid out as the design concept: who they are on
// a dark hero, their practice at a glance, the facts PsyAlliance holds
// and the private controls you have over the relationship.

export type ClinicianProfile = {
  id: string;
  name: string;
  firstName: string;
  role: string;
  where: string;
  avatarUrl: string | null;
  bio: string | null;
  licenceStates: string[];
  psypact: boolean;
  boardCertified: boolean;
  availabilityChip: string;
  availabilityFresh: boolean;
  glance: [string, string][];
  availability: [string, string][];
  confirmed: string;
  specialties: string[];
  relationship: string;
  status: "trusted" | "pending_out" | "pending_in" | null;
  connectionId: number | null;
  saved: boolean;
  excluded: boolean;
  collaborations: number;
  signals: string[];
  primaryState: string | null;
};

export function ClinicianProfileView({ p, error }: { p: ClinicianProfile; error?: string }) {
  return (
    <>
      <a href="/dashboard/network" className="text-arrow">&larr; Network</a>
      <div style={{ height: 14 }} />
      <Banner error={error} />
      {p.status === "pending_in" && p.connectionId && (
        <div className="banner ok row between wrap">
          <span>{p.name} invited you to their trusted circle.</span>
          <span className="row">
            <form action={respondToConnection} className="inline">
              <input type="hidden" name="id" value={p.connectionId} />
              <input type="hidden" name="decision" value="accepted" />
              <button type="submit" className="btn small-btn">Accept</button>
            </form>
            <form action={respondToConnection} className="inline">
              <input type="hidden" name="id" value={p.connectionId} />
              <input type="hidden" name="decision" value="declined" />
              <button type="submit" className="btn ghost small-btn">Decline</button>
            </form>
          </span>
        </div>
      )}

      <section className="profile-hero">
        <PersonAvatar name={p.name} url={p.avatarUrl} size={84} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">Clinician profile</div>
          <h1>{p.name}</h1>
          <p className="hero-role">{p.role}{p.where ? ` · ${p.where}` : ""}</p>
          <div className="chip-row">
            {p.licenceStates.length > 0 && (
              <span className="chip">{p.licenceStates.length === 1 ? `${p.licenceStates[0]} licence on file` : `Licences on file: ${p.licenceStates.join(", ")}`}</span>
            )}
            <span className="chip">{p.availabilityChip}</span>
            {p.psypact && <span className="chip">PSYPACT</span>}
            {p.relationship !== "Verified network" && <span className="chip gold">{p.relationship}</span>}
          </div>
        </div>
        <div className="actions hero-actions">
          <div className="row" style={{ gap: 8 }}>
            <form action={p.saved ? removeSavedClinicianAction : saveClinicianAction}>
              <input type="hidden" name="clinician_id" value={p.id} />
              <button type="submit" className="btn on-dark">{p.saved ? "Saved ✓" : "Save clinician"}</button>
            </form>
            <form action={startConversation}>
              <input type="hidden" name="participant_ids" value={p.id} />
              <input type="hidden" name="title" value="" />
              <input type="hidden" name="body" value="" />
              <button type="submit" className="btn ghost-on-dark">Send message</button>
            </form>
          </div>
          <div className="hero-links">
            <a href={`/dashboard/refer/new?state=${p.primaryState || ""}`}>Refer a patient &#8599;</a>
            <a href="/dashboard/cover/new">Ask for cover &#8599;</a>
          </div>
        </div>
      </section>

      <div className="split profile-body">
        <div className="stack">
          <section className="card roomy">
            <div className="eyebrow">Professional overview</div>
            <h2 className="serif-title">Practice at a glance</h2>
            {p.bio && <p className="lead-text">{p.bio}</p>}
            <ul className="glance">
              {p.glance.map(([k, v]) => (
                <li key={k}><span>{k}</span><strong>{v}</strong></li>
              ))}
            </ul>
          </section>

          <section className="card roomy">
            <div className="card-title" style={{ alignItems: "baseline" }}>
              <div className="eyebrow" style={{ margin: 0 }}>Current availability</div>
              <span className="micro-note">{p.confirmed}</span>
            </div>
            <ul className="glance" style={{ marginTop: 8 }}>
              {p.availability.map(([k, v]) => (
                <li key={k}><span>{k}</span><strong>{v}</strong></li>
              ))}
            </ul>
          </section>

          {p.specialties.length > 3 && (
            <section className="card roomy">
              <div className="eyebrow">All specialties, in their order</div>
              <ol className="ranked-list">
                {p.specialties.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </section>
          )}

          <section className="card roomy">
            <div className="eyebrow">Professional history</div>
            <div className="history-row">
              <div>
                <strong>{p.relationship}</strong>
                <p className="small" style={{ margin: "4px 0 0" }}>
                  {p.collaborations > 0
                    ? `${p.collaborations} collaboration${p.collaborations === 1 ? "" : "s"} together on PsyAlliance.`
                    : p.status === "trusted"
                      ? "A mutual relationship. They rank first in your matches."
                      : "A member relationship, separate from credential review."}
                </p>
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                {p.status === "trusted" && p.connectionId ? (
                  <>
                    <span className="btn secondary small-btn is-static">Trusted &#10003;</span>
                    <a className="btn secondary small-btn" href="/dashboard/cover/new">Invite to coverage</a>
                  </>
                ) : p.status === "pending_out" ? (
                  <span className="btn secondary small-btn is-static">Invitation sent</span>
                ) : p.status === null ? (
                  <form action={sendConnectionRequest}>
                    <input type="hidden" name="addressee_id" value={p.id} />
                    <input type="hidden" name="tier" value="trusted_colleague" />
                    <button type="submit" className="btn secondary small-btn">Invite to trusted colleagues</button>
                  </form>
                ) : null}
              </div>
            </div>
            {p.signals.length > 0 && (
              <ul className="signal-list">
                {p.signals.map((s) => <li key={s}>{s}</li>)}
              </ul>
            )}
          </section>
        </div>

        <aside className="stack">
          <section className="card tint roomy">
            <div className="eyebrow">Facts on file</div>
            <h2 className="serif-title">What is known here</h2>
            <p className="small">Professional licence evidence reviewed by PsyAlliance; current availability confirmed by the member.</p>
            <ul className="glance">
              <li><span>Authority recorded</span><strong>{p.licenceStates.length ? `${p.licenceStates.join(", ")} licence${p.licenceStates.length === 1 ? "" : "s"} on file` : "None on file"}</strong></li>
              {p.psypact && <li><span>PSYPACT</span><strong>Participating</strong></li>}
              {p.boardCertified && <li><span>Board certification</span><strong>Self-reported</strong></li>}
              <li><span>Availability</span><strong>{p.confirmed}</strong></li>
            </ul>
            <p className="micro-note" style={{ marginTop: 14 }}>Specific work, jurisdictional authority and fit for a patient remain your own professional judgement.</p>
          </section>

          <section className="card roomy">
            <div className="eyebrow">Your controls</div>
            <p className="small" style={{ marginTop: 8 }}>Private to your account. {p.firstName} is never told.</p>
            <div className="control-stack">
              <form action={p.excluded ? removeFromBlocklist : addToBlocklist}>
                <input type="hidden" name="blocked_profile_id" value={p.id} />
                <button type="submit" className="btn secondary block">{p.excluded ? "Include in suggestions again" : "Exclude from suggestions"}</button>
              </form>
              {p.status === "trusted" && p.connectionId && (
                <form action={removeConnection}>
                  <input type="hidden" name="id" value={p.connectionId} />
                  <button type="submit" className="btn secondary block">Remove from trusted colleagues</button>
                </form>
              )}
              <details className="control-details">
                <summary className="btn secondary block">Block contact</summary>
                <p className="small">They won&rsquo;t be able to message or invite you, and you disappear from each other&rsquo;s directory and suggestions. Undo it in Settings.</p>
                <form action={blockMemberAction}>
                  <input type="hidden" name="blocked_profile_id" value={p.id} />
                  <input type="hidden" name="return_to" value="/dashboard/settings?saved=blocked#privacy" />
                  <button type="submit" className="btn block">Block {p.firstName}</button>
                </form>
              </details>
              <details className="control-details">
                <summary className="btn ghost block">Report this profile</summary>
                <form action={fileReportAction}>
                  <input type="hidden" name="target_type" value="profile" />
                  <input type="hidden" name="target_id" value={p.id} />
                  <input type="hidden" name="return_to" value={`/dashboard/people/${p.id}`} />
                  <label className="field">What&rsquo;s wrong?<textarea name="reason" required rows={3} /></label>
                  <button type="submit" className="btn secondary small-btn" style={{ marginTop: 8 }}>Send to admins</button>
                </form>
              </details>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
