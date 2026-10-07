import "../../premium.css";
import { PublicNav, PublicFooter } from "../../_public/chrome";

export const metadata = { title: "Sandbox session ended", robots: { index: false, follow: false } };

// Where a sandbox visitor lands if this device is no longer signed in (the
// sandbox expired, or the browser cleared its session). Never the sign-in
// form: sandbox guests have no password.
export default function SandboxEndedPage() {
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 620 }}>
            <div className="card roomy">
              <div className="eyebrow">Your sandbox</div>
              <h2 style={{ marginTop: 6 }}>This device isn&rsquo;t signed in to your sandbox.</h2>
              <p>
                Open your personal sandbox link again and you&rsquo;ll carry on where you left off, on this device or another. Links last 7 days.
              </p>
              <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
                <a className="btn" href="/sandbox/request">My link has expired</a>
                <a className="btn secondary" href="/tour">Watch the demos</a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
