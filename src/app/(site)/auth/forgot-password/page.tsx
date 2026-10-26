import { requestPasswordReset } from "../actions";

export default async function ForgotPasswordPage(
  props: {
    searchParams: Promise<{ error?: string; message?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <a href="/" className="brand"><span aria-hidden="true" style={{ display: "inline-grid", placeItems: "center", width: 30, height: 30, border: "1.5px solid currentColor", borderRadius: "50%", fontFamily: "Georgia, serif", transform: "rotate(-18deg)", marginRight: 10, fontSize: 20 }}>ψ</span>psyalliance</a>

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
