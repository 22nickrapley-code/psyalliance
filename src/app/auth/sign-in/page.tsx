import { signIn } from "../actions";
import { GoogleSignInButton } from "../google-button";

export default async function SignInPage(
  props: {
    searchParams: Promise<{ error?: string; message?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <a href="/" className="brand">PsyAlliance</a>

        {searchParams.error && <div className="error-banner">{searchParams.error}</div>}
        {searchParams.message && <div className="message-banner">{searchParams.message}</div>}

        <form action={signIn} className="card">
          <h2>Sign in</h2>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required />
          </div>
          <button type="submit" style={{ width: "100%" }}>Sign in</button>
          <p className="muted" style={{ textAlign: "center", marginBottom: 0 }}>
            <a href="/auth/forgot-password">Forgot your password?</a>
          </p>
        </form>

        <p className="muted" style={{ textAlign: "center", margin: "1rem 0" }}>or</p>
        <GoogleSignInButton />

        <p className="muted" style={{ textAlign: "center" }}>
          No account yet? <a href="/auth/sign-up">Create one</a>
        </p>
      </div>
    </div>
  );
}
