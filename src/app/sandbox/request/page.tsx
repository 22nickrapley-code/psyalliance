import "../../premium.css";
import { redirect } from "next/navigation";
import { PublicNav, PublicFooter } from "../../_public/chrome";
import { IS_DEMO_SITE, DEMO_URL, JOIN_URL } from "@/lib/env";
import { US_STATES } from "@/lib/us-states";
import { requestSandboxAction } from "./actions";

export const metadata = { title: "Ask for a sandbox", robots: { index: false, follow: false } };

// Ask for a personal sandbox. A person reads each request and sends back a
// link that is yours alone, so the page says what happens next and what a
// sandbox is (and isn't).
export default async function SandboxRequestPage(props: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  if (!IS_DEMO_SITE && DEMO_URL && process.env.NODE_ENV === "production") redirect(`${DEMO_URL}/sandbox/request`);
  const sp = await props.searchParams;
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 640 }}>
            <div className="section-intro">
              <div className="eyebrow">Personal sandbox</div>
              <h2>Try PsyAlliance with your own fictional practice.</h2>
              <p>
                A sandbox is a private copy of the tour&rsquo;s story that you can use freely for a week: ask for cover, send a referral, post a
                consultation, and invented colleagues reply. Everyone in it is fictional, and nothing you do reaches the real network.
              </p>
            </div>
            {sp.sent ? (
              <div className="card tint roomy">
                <div className="eyebrow">Request received</div>
                <h3>We&rsquo;ll email you a personal link.</h3>
                <p className="small">
                  A member of the PsyAlliance team reads each request, usually within a working day. Your link is yours alone and works for 7 days;
                  please don&rsquo;t pass it on. &ldquo;Start the story again&rdquo; inside the sandbox clears your fictional activity whenever you like.
                </p>
                <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
                  <a className="btn secondary small-btn" href="/tour">Back to the tour</a>
                  <a className="text-arrow" href={JOIN_URL}>Ask to join the real cohort &rarr;</a>
                </div>
              </div>
            ) : (
              <form action={requestSandboxAction} className="card fields">
                {sp.error && <div className="banner error" role="alert">{sp.error}</div>}
                <label className="field">
                  Name
                  <input name="full_name" required autoComplete="name" maxLength={120} />
                </label>
                <label className="field">
                  Email for the link
                  <input name="email" type="email" required autoComplete="email" maxLength={200} />
                </label>
                <div className="field-pair">
                  <label className="field">
                    Role
                    <select name="role" defaultValue="">
                      <option value="">Choose one</option>
                      <option>Psychologist</option>
                      <option>Psychiatrist</option>
                      <option>Practice owner</option>
                      <option>Other</option>
                    </select>
                  </label>
                  <label className="field">
                    State
                    <select name="state" defaultValue="">
                      <option value="">Choose one</option>
                      {US_STATES.map((s) => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Anything you&rsquo;d like to try <span className="micro-note">(optional)</span></span>
                  <textarea name="note" rows={2} maxLength={600} placeholder="For example, planning cover for a leave." />
                </label>
                <button type="submit" className="btn" style={{ alignSelf: "flex-start" }}>Ask for a sandbox</button>
                <p className="micro-note" style={{ margin: 0 }}>
                  Please don&rsquo;t enter anything about real clients, here or in the sandbox. We use your details only to send the link. See{" "}
                  <a href="/privacy">Privacy</a>.
                </p>
              </form>
            )}
            <p className="small" style={{ marginTop: 20 }}>
              Ready for the real thing? A sandbox isn&rsquo;t membership. <a href={JOIN_URL}>Ask to join the founding cohort</a> separately.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
