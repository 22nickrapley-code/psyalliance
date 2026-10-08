import "../../premium.css";
import { PublicNav, PublicFooter } from "../../_public/chrome";
import { REAL_SITE_URL, TOUR_URL } from "@/lib/env";

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
                Sign in to PsyAlliance and open your sandbox from your account. You&rsquo;ll carry on where you left off, on this device or another.
              </p>
              <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
                <a className="btn" href={`${REAL_SITE_URL}/auth/sign-in`}>Sign in to PsyAlliance</a>
                <a className="btn secondary" href={TOUR_URL}>Watch the demos</a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
