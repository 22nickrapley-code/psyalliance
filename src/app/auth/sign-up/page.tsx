import { signUp } from "../actions";
import { GoogleSignInButton } from "../google-button";

export default async function SignUpPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <a href="/" className="brand"><span aria-hidden="true" style={{ display: "inline-grid", placeItems: "center", width: 30, height: 30, border: "1.5px solid currentColor", borderRadius: "50%", fontFamily: "Georgia, serif", transform: "rotate(-18deg)", marginRight: 10, fontSize: 20 }}>ψ</span>psyalliance</a>

        {searchParams.error && <div className="error-banner">{searchParams.error}</div>}

        <form action={signUp} className="card">
          <h2>Create your account</h2>
          <p className="muted" style={{ marginTop: "-0.5rem" }}>
            For PhD, PsyD and EdD psychologists and MD and DO psychiatrists. After you sign up, add
            your licence in Credentials: a person reviews it before you&rsquo;re listed.
          </p>
          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" type="text" required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" minLength={8} required />
          </div>
          <button type="submit" style={{ width: "100%" }}>Create account</button>
        </form>

        <p className="muted" style={{ textAlign: "center", margin: "1rem 0" }}>or</p>
        <GoogleSignInButton />

        <p className="muted" style={{ textAlign: "center" }}>
          Already have an account? <a href="/auth/sign-in">Sign in</a>
        </p>
        <p className="muted" style={{ textAlign: "center" }}>
          A referring physician or GP? <a href="/auth/refer-sign-up">Register here</a>
        </p>
      </div>
    </div>
  );
}
