import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage({
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

        <form action={requestPasswordReset} className="card">
          <h2>Reset your password</h2>
          <p className="muted">
            Enter the email address on your account and we'll send you a link to set a new
            password.
          </p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <button type="submit" style={{ width: "100%" }}>Send reset link</button>
        </form>

        <p className="muted" style={{ textAlign: "center" }}>
          <a href="/auth/sign-in">Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
