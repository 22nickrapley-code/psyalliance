import { signIn } from "../actions";

export default function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
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
        </form>

        <p className="muted" style={{ textAlign: "center" }}>
          No account yet? <a href="/auth/sign-up">Create one</a>
        </p>
      </div>
    </div>
  );
}
