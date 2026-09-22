import { signInProvider } from "../../refer/actions";

export default async function ProviderSignInPage(
  props: { searchParams: Promise<{ error?: string; message?: string }> }
) {
  const searchParams = await props.searchParams;
  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <a href="/" className="brand">psyalliance.org</a>

        {searchParams.error && <div className="error-banner">{searchParams.error}</div>}
        {searchParams.message && <div className="message-banner">{searchParams.message}</div>}

        <form action={signInProvider} className="card">
          <h2>Referring provider sign-in</h2>
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

        <p className="muted" style={{ textAlign: "center" }}>
          No account yet? <a href="/auth/refer-sign-up">Register as a referring provider</a>
        </p>
      </div>
    </div>
  );
}
