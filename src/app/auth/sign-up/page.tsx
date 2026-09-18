import { signUp } from "../actions";
import { GoogleSignInButton } from "../google-button";

export default function SignUpPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <a href="/" className="brand">PsyAlliance</a>

        {searchParams.error && <div className="error-banner">{searchParams.error}</div>}

        <form action={signUp} className="card">
          <h2>Create your account</h2>
          <p className="muted" style={{ marginTop: "-0.5rem" }}>
            For PhD, PsyD, EdD psychologists and psychiatrists. Credential verification happens
            after sign-up, from your profile.
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
      </div>
    </div>
  );
}
