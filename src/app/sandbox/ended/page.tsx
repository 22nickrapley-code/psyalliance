import "../../premium.css";
import { PublicNav, PublicFooter } from "../../_public/chrome";
import { cookies } from "next/headers";
import { REAL_SITE_URL, TOUR_URL } from "@/lib/env";

export const metadata = { title: "Sandbox session ended", robots: { index: false, follow: false } };

// Where a sandbox visitor lands if this device is no longer signed in (the
// sandbox expired, or the browser cleared its session). Never the sign-in
// form: sandbox guests have no password.
export default async function SandboxEndedPage(props: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await props.searchParams;
  const canResume = !expired && !!(await cookies()).get("pa_pass")?.value;
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 620 }}>
            <div className="card roomy">
              <div className="eyebrow">Your sandbox</div>
              <h2 style={{ marginTop: 6 }}>{expired ? "Your sandbox link has expired." : "This device isn’t signed in to your sandbox."}</h2>
              <p>
                {canResume
                  ? "Your sandbox is still there. Carry on where you left off."
                  : "Sign in to PsyAlliance and open your sandbox from your account. You’ll carry on where you left off, on this device or another."}
              </p>
              <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
                {canResume && <a className="btn" href="/sandbox/resume" data-reload="">Continue in your sandbox</a>}
                <a className={canResume ? "btn secondary" : "btn"} href={`${REAL_SITE_URL}/auth/sign-in`}>Sign in to PsyAlliance</a>
                <a className="btn secondary" href={TOUR_URL}>Explore the guided demos</a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
