import "../../premium.css";
import { signIn } from "../actions";
import { IS_DEMO_SITE, JOIN_URL, JOIN_HREF } from "@/lib/env";

// Member sign-in. One side says what PsyAlliance is; the other is the
// form. On the demo site, prospects are pointed to the tour and the real
// site's join form instead: only sandbox passes and admins sign in here.
export default async function SignInPage(props: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await props.searchParams;
  return (
    <div className="pa">
      <main className="auth-split">
        <section className="auth-story">
          <a href="/" className="brand" style={{ color: "#fff" }}>
            <span className="brand-mark" aria-hidden="true">&psi;</span>psyalliance
          </a>
          <div>
            <div className="eyebrow">{IS_DEMO_SITE ? "Demo site" : "Members"}</div>
            <h1>Professional backup for independent clinicians.</h1>
            <p>Cover when you&rsquo;re away, the right colleague for a referral, and peers to think a decision through with. Verified psychologists and psychiatrists only.</p>
          </div>
          <p className="auth-foot">{IS_DEMO_SITE ? "A sandbox with fictional colleagues." : "Open to doctoral psychologists and psychiatrists, state by state."}</p>
        </section>
        <section className="auth-form">
          <div className="auth-form-inner">
            <div className="eyebrow">{IS_DEMO_SITE ? "Demo administrators" : "Member sign in"}</div>
            <h2 className="serif-title" style={{ fontSize: 34, margin: "6px 0 18px" }}>Welcome back.</h2>
            {sp.error && <div className="banner error" role="alert">{sp.error}</div>}
            {sp.message && <div className="banner ok" role="status">{sp.message}</div>}
            <form action={signIn} className="stack" style={{ gap: 14 }}>
              <label className="field">
                Email
                <input name="email" type="email" required autoComplete="email" />
              </label>
              <label className="field">
                Password
                <input name="password" type="password" required autoComplete="current-password" />
              </label>
              <button type="submit" className="btn lg block">Sign in</button>
              <a className="text-arrow" href="/auth/forgot-password" style={{ justifySelf: "center" }}>Forgot your password?</a>
            </form>
            <div className="auth-alt">
              {IS_DEMO_SITE ? (
                <>
                  <p className="small">This sign-in is for running the sandbox. Members sign in on the main site, and open their sandbox from their account.</p>
                  <a className="btn secondary block" href={JOIN_URL.replace("/auth/sign-up", "/auth/sign-in")}>Sign in to PsyAlliance</a>
                </>
              ) : (
                <>
                  <p className="small">New to PsyAlliance? Founding members never pay.</p>
                  <a className="btn secondary block" href={JOIN_HREF}>Create your account</a>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
