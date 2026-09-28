import "../premium.css";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { requestToJoinAction } from "../auth/actions";
import { redirect } from "next/navigation";
import { IS_DEMO_SITE, JOIN_URL } from "@/lib/env";
import { US_STATES } from "@/lib/us-states";

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
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 640 }}>
            <div className="section-intro">
              <div className="eyebrow">Founding members</div>
              <h2>Ask to join the first cohort.</h2>
              <p>
                We&rsquo;re inviting doctoral-level psychologists and psychiatrists in a few states at a time, so members can actually cover, refer and consult with
                each other from day one. Tell us where you practise and we&rsquo;ll send you a personal invitation when your area opens.
              </p>
            </div>
            {sp.sent ? (
              <div className="card tint roomy">
                <div className="eyebrow">Request received</div>
                <h3>You&rsquo;re on the list for an invitation.</h3>
                <p className="small">This is a request, not membership yet. When we open your state we&rsquo;ll email you a personal invitation link. After you sign up, you add your licence and a person checks it against the state board before you can use the network.</p>
                <p className="small" style={{ marginBottom: 0 }}>Nothing else is sent to you until then.</p>
              </div>
            ) : (
              <form action={requestToJoinAction} className="card fields">
                {sp.error && <div className="banner error" role="alert">{sp.error}</div>}
                <label className="field">
                  Full name
                  <input name="full_name" required autoComplete="name" />
                </label>
                <label className="field">
                  Work email
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
                <fieldset className="field state-pick">
                  <legend>States where you&rsquo;re licensed <span className="micro-note">(at least one)</span></legend>
                  <div className="check-grid">
                    {US_STATES.filter((s) => LAUNCH.includes(s.code)).map((s) => (
                      <label key={s.code}>
                        <input type="checkbox" name="state" value={s.code} /> {s.name}
                      </label>
                    ))}
                  </div>
                  <details style={{ marginTop: 8 }}>
                    <summary className="small" style={{ cursor: "pointer" }}>Licensed somewhere else?</summary>
                    <div className="check-grid" style={{ marginTop: 8 }}>
                      {US_STATES.filter((s) => !LAUNCH.includes(s.code)).map((s) => (
                        <label key={s.code}>
                          <input type="checkbox" name="state" value={s.code} /> {s.name}
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
                <button type="submit" className="btn" style={{ alignSelf: "flex-start" }}>Request an invitation</button>
                <p className="micro-note" style={{ margin: 0 }}>We use this only to decide when to invite you. See <a href="/privacy">Privacy</a>.</p>
              </form>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
