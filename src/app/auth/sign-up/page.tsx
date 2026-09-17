import { signUp } from "../actions";

export default function SignUpPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h1>Create your account</h1>
      <p className="muted">
        For PhD, PsyD, EdD psychologists and psychiatrists. Credential verification happens after
        sign-up, from your profile.
      </p>

      {searchParams.error && <div className="error-banner">{searchParams.error}</div>}

      <form action={signUp} className="card">
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
        <button type="submit">Create account</button>
      </form>

      <p className="muted">
        Already have an account? <a href="/auth/sign-in">Sign in</a>
      </p>
    </div>
  );
}
