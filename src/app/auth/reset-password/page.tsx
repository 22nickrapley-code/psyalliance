import { resetPassword } from "../actions";

export default async function ResetPasswordPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <a href="/" className="brand">psyalliance.org</a>

        {searchParams.error && <div className="error-banner">{searchParams.error}</div>}

        <form action={resetPassword} className="card">
          <h2>Set a new password</h2>
          <div className="field">
            <label htmlFor="password">New password</label>
            <input id="password" name="password" type="password" minLength={8} required />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input id="confirmPassword" name="confirmPassword" type="password" minLength={8} required />
          </div>
          <button type="submit" style={{ width: "100%" }}>Update password</button>
        </form>
      </div>
    </div>
  );
}
