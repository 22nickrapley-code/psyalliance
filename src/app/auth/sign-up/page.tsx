import { signUp } from "../actions";
import { createClient } from "@/lib/supabase/server";

const MARK = { display: "inline-grid", placeItems: "center", width: 30, height: 30, border: "1.5px solid currentColor", borderRadius: "50%", fontFamily: "Georgia, serif", transform: "rotate(-18deg)", marginRight: 10, fontSize: 20 } as const;

// Sign-up needs a personal invitation link while the founding cohort forms.
export default async function SignUpPage(props: { searchParams: Promise<{ error?: string; invite?: string }> }) {
  const sp = await props.searchParams;
  const invite = (sp.invite || "").trim();
  const supabase = await createClient();
  const { data: inv } = invite ? await supabase.rpc("invitation_status", { p_token: invite }).maybeSingle<any>() : { data: null };

  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <a href="/" className="brand"><span aria-hidden="true" style={MARK}>ψ</span>psyalliance</a>
        {sp.error && <div className="error-banner">{sp.error}</div>}

        {!inv?.valid ? (
          <div className="card">
            <h2>{invite ? "This invitation isn't valid" : "PsyAlliance is invitation-only for now"}</h2>
            <p className="muted">
              {invite
                ? "The link has expired or has already been used. Ask us for a new one at hello@psyalliance.org."
                : "We're opening to a founding group of verified psychologists and psychiatrists first. Ask to join and we'll send you a personal invitation."}
            </p>
            <a className="btn" href="/join" style={{ display: "inline-block" }}>Ask to join</a>
          </div>
        ) : (
          <form action={signUp} className="card">
            <input type="hidden" name="invite" value={invite} />
            <h2>Create your account</h2>
            <p className="muted" style={{ marginTop: "-0.5rem" }}>
              For PhD, PsyD and EdD psychologists and MD and DO psychiatrists. After you sign up, add your licence in Credentials: a person reviews it before you
              can use the network.
            </p>
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" name="fullName" type="text" defaultValue={inv.full_name || ""} required autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" defaultValue={inv.email || ""} readOnly={!!inv.email} required autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
            </div>
            <button type="submit" style={{ width: "100%" }}>Create account</button>
          </form>
        )}

        <p className="muted" style={{ textAlign: "center" }}>
          Already have an account? <a href="/auth/sign-in">Sign in</a>
        </p>
      </div>
    </div>
  );
}
