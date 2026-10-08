import "../../premium.css";
import { redirect } from "next/navigation";
import { signUp } from "../actions";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO_SITE, JOIN_URL, TOUR_URL } from "@/lib/env";
import { US_STATES } from "@/lib/us-states";
import { loadOpenStates, stateList } from "@/lib/open-states";
import { PublicNav, PublicFooter } from "../../_public/chrome";
import { DegreeField } from "./degree-field";

export const metadata = {
  title: "Create your account",
  description: "Join PsyAlliance, the verified network for doctoral psychologists and psychiatrists in private practice. Founding members never pay.",
};

const NORTHEAST = ["NY", "MA", "NJ", "CT", "RI", "VT", "NH", "ME", "PA"];

// The one way in. Anyone with a doctoral degree can create an account; a
// person checks the license; the network opens state by state.
export default async function SignUpPage(props: {
  searchParams: Promise<{ error?: string; invite?: string; from?: string; ineligible?: string }>;
}) {
  if (IS_DEMO_SITE) redirect(JOIN_URL);
  const sp = await props.searchParams;
  const invite = (sp.invite || "").trim();
  const source = String(sp.from || "").replace(/[^a-z0-9-]/gi, "").slice(0, 60);
  const supabase = await createClient();
  const [open, { data: inv }] = await Promise.all([
    loadOpenStates(supabase),
    invite ? supabase.rpc("invitation_status", { p_token: invite }).maybeSingle<any>() : Promise.resolve({ data: null as any }),
  ]);
  const openText = stateList(open);
  const first = [...open, ...NORTHEAST.filter((c) => !open.includes(c))];

  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section join-page">
          <div className="section-inner join-layout">
            <div className="join-intro">
              <div className="eyebrow">Founding members never pay</div>
              <h1>Create your account.</h1>
              <p className="lead">
                For doctoral psychologists and psychiatrists in private practice. Open now in {openText || "the Northeast"}; other states open as colleagues
                join.
              </p>
              <ol className="join-steps">
                <li><b>Create your account</b><span>It takes a minute.</span></li>
                <li><b>Add your license</b><span>A person checks it against the state board before anyone can see you.</span></li>
                <li><b>Explore while we check</b><span>The Practice Library and a sandbox with fictional colleagues are open to you straight away.</span></li>
                <li>
                  <b>You&rsquo;re in</b>
                  <span>
                    Licensed in {openText || "an open state"}? You join the network as soon as you&rsquo;re verified. Elsewhere, you&rsquo;ll see your place in line
                    and we open your state as colleagues join.
                  </span>
                </li>
              </ol>
              <p className="small">
                Want to see it first? <a href={TOUR_URL}>Explore the guided demos</a>.
              </p>
            </div>

            {sp.ineligible ? (
              <div className="card tint roomy join-card">
                <div className="eyebrow">Membership</div>
                <h2 className="serif-title" style={{ fontSize: 28, margin: "6px 0 10px" }}>PsyAlliance membership is for doctoral clinicians.</h2>
                <p>
                  The network is for psychologists with a PhD, PsyD or EdD and psychiatrists with an MD or DO, licensed in the US. The Practice Library is open to
                  everyone, and every template can be used by master&rsquo;s-level clinicians.
                </p>
                <div className="row wrap" style={{ gap: 10 }}>
                  <a className="btn" href="/library">Browse the Practice Library</a>
                  <a className="btn secondary" href={`/auth/sign-up${source ? `?from=${source}` : ""}`}>Back</a>
                </div>
              </div>
            ) : (
              <form action={signUp} className="card join-card join-form">
                {invite && <input type="hidden" name="invite" value={invite} />}
                {source && <input type="hidden" name="source" value={source} />}
                {sp.error && <div className="banner error" role="alert">{sp.error}</div>}
                <DegreeField />
                <div className="join-rest">
                <label className="field">
                  Full name
                  <input name="fullName" required minLength={2} autoComplete="name" defaultValue={inv?.valid ? inv.full_name || "" : ""} />
                </label>
                <label className="field">
                  Email
                  <input name="email" type="email" required autoComplete="email" defaultValue={inv?.valid ? inv.email || "" : ""} />
                </label>
                <label className="field">
                  Password
                  <input name="password" type="password" required minLength={8} autoComplete="new-password" />
                  <small>At least 8 characters.</small>
                </label>
                <fieldset className="state-pick">
                  <legend>States where you&rsquo;re licensed</legend>
                  <div className="check-grid">
                    {US_STATES.filter((s) => first.includes(s.code)).map((s) => (
                      <label key={s.code} className="check-pill">
                        <input type="checkbox" name="state" value={s.code} /> <span>{s.name}{open.includes(s.code) ? " (open)" : ""}</span>
                      </label>
                    ))}
                  </div>
                  <details className="more-states">
                    <summary>Licensed somewhere else?</summary>
                    <div className="check-grid">
                      {US_STATES.filter((s) => !first.includes(s.code)).map((s) => (
                        <label key={s.code} className="check-pill">
                          <input type="checkbox" name="state" value={s.code} /> <span>{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                </fieldset>
                <button type="submit" className="btn lg block">Create your account</button>
                <p className="micro-note" style={{ margin: 0, textAlign: "center" }}>
                  Founding members never pay. See <a href="/privacy">Privacy</a> and <a href="/terms">Terms</a>. Already have an account?{" "}
                  <a href="/auth/sign-in">Sign in</a>.
                </p>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
