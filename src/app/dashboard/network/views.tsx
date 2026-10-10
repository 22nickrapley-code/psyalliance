import { PageHead, PersonAvatar, Banner } from "../_components/ui";
import { Orbit, type CircleNode } from "../_components/orbit";
import { removeTrustedAction } from "./actions";
import { TrustButton } from "../clinicians/views";

// Your network, the way a group practice feels: the colleagues you've
// chosen (Trusted), the people you've worked with (built automatically),
// and the colleagues PsyAlliance suggests you get to know.

export type Colleague = { id: string; name: string; where: string; avatarUrl: string | null; why: string; trusted: boolean };

const BACK = "/dashboard/network";

// A colleague in one of the three lists. A button sits under the name so
// the name and details keep the full width of the column.
function Row({ c, action, below = false }: { c: Colleague; action: React.ReactNode; below?: boolean }) {
  return (
    <div className={`net-row${below ? " action-below" : ""}`}>
      <PersonAvatar name={c.name} url={c.avatarUrl} />
      <div className="net-row-text">
        <a href={`/dashboard/people/${c.id}?back=${encodeURIComponent(BACK)}`}><strong>{c.name}</strong></a>
        {c.where && <small>{c.where}</small>}
        {c.why && <small className="net-why">{c.why}</small>}
        {below && <div className="net-row-action">{action}</div>}
      </div>
      {!below && <div className="net-row-action">{action}</div>}
    </div>
  );
}

export function NetworkView({
  trusted,
  worked,
  suggested,
  nodes,
  me,
  note,
  error,
}: {
  trusted: Colleague[];
  worked: Colleague[];
  suggested: Colleague[];
  nodes: CircleNode[];
  me: { initials: string; avatarUrl: string | null };
  note?: string | null;
  error?: string | null;
}) {
  return (
    <>
      <PageHead
        eyebrow="Your practice"
        title="Your network"
        lead="The colleagues you count on, the ones you've worked with, and the people PsyAlliance thinks you should know."
        actions={
          <>
            <a className="btn" href="/dashboard/clinicians">Find clinicians</a>
            <a className="btn secondary" href="/dashboard/invite">Invite a colleague</a>
          </>
        }
      />
      <Banner ok={note} error={error} />
      <div className="net-hero card">
        <div className="net-orbit">
          <Orbit nodes={nodes} me={me} size={340} />
        </div>
        <div className="net-legend">
          <a href="#trusted" className="net-legend-item">
            <i className="dot trusted" />
            <span><b>{trusted.length}</b> Trusted colleagues</span>
            <small>The people you&rsquo;d count on, like colleagues in a group practice. You choose them; they come first in every match.</small>
          </a>
          <a href="#worked" className="net-legend-item">
            <i className="dot worked" />
            <span><b>{worked.length}</b> Worked with before</span>
            <small>Builds itself after a referral, cover or consult together.</small>
          </a>
          <a href="#suggested" className="net-legend-item">
            <i className="dot suggested" />
            <span><b>{suggested.length}</b> Suggested for you</span>
            <small>People who added you, and colleagues whose practice fits yours.</small>
          </a>
          <a className="btn secondary small-btn" href="/dashboard/clinicians" style={{ marginTop: 6 }}>Search all clinicians &rarr;</a>
        </div>
      </div>

      <div className="net-columns">
        <section className="card" id="trusted">
          <div className="card-title"><h3>Trusted colleagues</h3><span className="micro-note">{trusted.length}</span></div>
          {trusted.length === 0 ? (
            <p className="small">
              Add the colleagues you&rsquo;d count on, the way you would in a group practice. Use <b>Add as Trusted Colleague</b> on anyone&rsquo;s profile or in{" "}
              <a href="/dashboard/clinicians">Clinicians</a>.
            </p>
          ) : (
            trusted.map((c) => (
              <Row
                key={c.id}
                c={c}
                below
                action={
                  <form action={removeTrustedAction} className="inline">
                    <input type="hidden" name="colleague_id" value={c.id} />
                    <input type="hidden" name="back" value={`${BACK}#trusted`} />
                    <button type="submit" className="plain-button small net-remove">Remove from trusted</button>
                  </form>
                }
              />
            ))
          )}
        </section>

        <section className="card" id="worked">
          <div className="card-title"><h3>Worked with before</h3><span className="micro-note">{worked.length}</span></div>
          {worked.length === 0 ? (
            <p className="small">
              Colleagues appear here automatically after a referral, cover arrangement or consultation together. Anyone you&rsquo;ve already added is listed
              under Trusted colleagues.
            </p>
          ) : (
            worked.map((c) => <Row key={c.id} c={c} below action={<TrustButton id={c.id} trusted={c.trusted} back={`${BACK}#worked`} />} />)
          )}
        </section>

        <section className="card" id="suggested">
          <div className="card-title"><h3>Suggested for you</h3></div>
          {suggested.length === 0 ? (
            <p className="small">Suggestions come from your specialties, your state and who&rsquo;s active. <a href="/dashboard/profile?edit=1&back=%2Fdashboard%2Fnetwork#specialties">Rank your specialties</a> for better ones.</p>
          ) : (
            suggested.map((c) => <Row key={c.id} c={c} below action={<TrustButton id={c.id} trusted={c.trusted} back={`${BACK}#suggested`} />} />)
          )}
        </section>
      </div>
    </>
  );
}
