import "../premium.css";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { requestToJoinAction } from "../auth/actions";
import { redirect } from "next/navigation";
import { IS_DEMO_SITE, JOIN_URL, DEMO_URL } from "@/lib/env";
import { US_STATES } from "@/lib/us-states";

const DEMO_TOUR = DEMO_URL ? `${DEMO_URL}/tour` : "/tour";

const LAUNCH = ["NY", "NJ", "MA", "CT", "RI", "VT"];

export const metadata = { title: "Join the founding cohort" };

// Ask for an invitation. PsyAlliance opens to a founding cohort of
// verified clinicians who overlap by state and specialty, so we invite
// people deliberately rather than opening sign-up.
export default async function JoinPage(props: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  // Join requests always go to the real site's database.
  if (IS_DEMO_SITE) redirect(JOIN_URL);
  const sp = await props.searchParams;
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section join-page">
          <div className="section-inner join-layout">
            <div className="join-intro">
              <div className="eyebrow">Founding members</div>
              <h1>Request an invitation.</h1>
              <p className="lead">
                PsyAlliance opens a few states at a time, so members can cover, refer and consult with each other from day one. Tell us where you&rsquo;re
                licensed and we&rsquo;ll invite you when your state opens. Founding members join free.
              </p>
              <ol className="join-steps">
                <li><b>Request an invitation</b><span>You&rsquo;ll see a confirmation straight away. This is a request, not membership.</span></li>
                <li><b>We invite you when your state opens</b><span>A personal invitation link by email, once your state is open and you&rsquo;re eligible.</span></li>
                <li><b>Set up your account</b><span>Add your practice details and each license you hold.</span></li>
                <li><b>A person reviews your license</b><span>Identity, doctoral degree and license, checked against the state board, before you&rsquo;re listed or matched.</span></li>
              </ol>
              <p className="small">
                Not ready yet? <a href={DEMO_TOUR}>Watch the short demos</a> first.
              </p>
            </div>
            {sp.sent ? (
              <div className="card tint roomy join-card">
                <div className="eyebrow">Request received</div>
                <h2 className="serif-title" style={{ fontSize: 30, margin: "6px 0 10px" }}>You&rsquo;re on the list.</h2>
                <p>This is a request for an invitation, not membership. When we open your state we&rsquo;ll email you a personal invitation link. After you sign up, you add your license and a person checks it against the state board before you can use the network.</p>
                <p style={{ marginBottom: 0 }}>Nothing else is sent to you until then.</p>
              </div>
            ) : (
              <form action={requestToJoinAction} className="card join-card join-form">
                {sp.error && <div className="banner error" role="alert">{sp.error}</div>}
                <label className="field">
                  Full name
                  <input name="full_name" required autoComplete="name" />
                </label>
                <label className="field">
                  Email you&rsquo;ll use for PsyAlliance
                  <input name="email" type="email" required autoComplete="email" />
                </label>
                <label className="field">
                  Doctoral degree
                  <select name="qualification" defaultValue="" required>
                    <option value="" disabled>Choose one</option>
                    <option>PhD</option>
                    <option>PsyD</option>
                    <option>EdD</option>
                    <option>MD</option>
                    <option>DO</option>
                  </select>
                </label>
                <fieldset className="state-pick">
                  <legend>States where you&rsquo;re licensed <span className="micro-note">(at least one)</span></legend>
                  <div className="check-grid">
                    {US_STATES.filter((s) => LAUNCH.includes(s.code)).map((s) => (
                      <label key={s.code} className="check-pill">
                        <input type="checkbox" name="state" value={s.code} /> <span>{s.name}</span>
                      </label>
                    ))}
                  </div>
                  <details className="more-states">
                    <summary>Licensed somewhere else?</summary>
                    <div className="check-grid">
                      {US_STATES.filter((s) => !LAUNCH.includes(s.code)).map((s) => (
                        <label key={s.code} className="check-pill">
                          <input type="checkbox" name="state" value={s.code} /> <span>{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                  <small>We&rsquo;re opening New York, New Jersey, Massachusetts, Connecticut, Rhode Island and Vermont first.</small>
                </fieldset>
                <label className="field">
                  <span>Your practice, briefly <span className="micro-note">(optional)</span></span>
                  <textarea name="note" rows={3} maxLength={600} placeholder="Specialties, who you see, what you'd use PsyAlliance for." />
                </label>
                <button type="submit" className="btn lg block">Request an invitation</button>
                <p className="micro-note" style={{ margin: 0, textAlign: "center" }}>We use this only to decide when to invite you. See <a href="/privacy">Privacy</a>.</p>
              </form>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
