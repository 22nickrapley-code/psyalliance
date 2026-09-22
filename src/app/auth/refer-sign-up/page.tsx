import { signUpProvider } from "../../refer/actions";

export default async function ProviderSignUpPage(
  props: { searchParams: Promise<{ error?: string }> }
) {
  const searchParams = await props.searchParams;
  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <a href="/" className="brand">psyalliance.org</a>

        {searchParams.error && <div className="error-banner">{searchParams.error}</div>}

        <form action={signUpProvider} className="card">
          <h2>Referring provider sign-up</h2>
          <p className="muted" style={{ marginTop: "-0.5rem" }}>
            For family physicians and general practitioners who want to refer patients into
            PsyAlliance's verified network. An admin reviews every registration before it's
            approved.
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

        <p className="muted" style={{ textAlign: "center" }}>
          Already registered? <a href="/auth/refer-sign-in">Sign in</a>
        </p>
        <p className="muted" style={{ textAlign: "center" }}>
          A psychologist or psychiatrist looking to join the network? <a href="/auth/sign-up">Sign up here</a>
        </p>
      </div>
    </div>
  );
}
