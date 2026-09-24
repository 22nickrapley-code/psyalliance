import "../premium.css";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { requestToJoinAction } from "../auth/actions";

export const metadata = { title: "Join the founding cohort · PsyAlliance" };

// Ask for an invitation. PsyAlliance opens to a founding cohort of
// verified clinicians who overlap by state and specialty, so we invite
// people deliberately rather than opening sign-up.
export default async function JoinPage(props: { searchParams: Promise<{ sent?: string; error?: string }> }) {
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
              <div className="card tint">
                <h3>Thank you. We&rsquo;ve got your request.</h3>
                <p className="small" style={{ marginBottom: 0 }}>We&rsquo;ll email you an invitation link when we open your state. Nothing else is sent to you until then.</p>
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
                <label className="field">
                  States where you&rsquo;re licensed
                  <input name="states" placeholder="e.g. NY, MA" maxLength={120} />
                </label>
                <label className="field">
                  Your practice, briefly <span className="micro-note">(optional)</span>
                  <textarea name="note" rows={3} maxLength={600} placeholder="Specialties, who you see, what you'd use PsyAlliance for." />
                </label>
                <button type="submit" className="btn" style={{ alignSelf: "flex-start" }}>Ask to join</button>
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
