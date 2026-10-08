import { clinicianName, roleLabel } from "@/lib/profession";
import { PublicNav, PublicFooter } from "../../_public/chrome";
import { acceptInviteAction } from "./actions";

export type InviteWho = { full_name: string; credential_prefix: string | null; qualification_level: string | null; city: string | null; state: string | null } | null;

// The landing page for a colleague's personal invitation.
export function InviteLanding({ who, token, signedIn, error }: { who: InviteWho; token: string; signedIn: boolean; error?: string }) {
  const name = who ? clinicianName(who.full_name, who.qualification_level, who.credential_prefix) : null;
  const first = who ? (who.credential_prefix ? `${who.credential_prefix} ${String(who.full_name || "").split(" ").slice(-1)[0]}` : String(who.full_name || "").split(" ")[0]) : "";
  const where = who ? [who.city, who.state].filter(Boolean).join(", ") : "";

  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner invite-hero">
            {!who ? (
              <div className="card roomy">
                <div className="eyebrow">Invitation</div>
                <h1 className="serif-title" style={{ fontSize: 34 }}>This invitation link isn&rsquo;t active.</h1>
                <p>Ask your colleague for a new link, or create your account and find them once you&rsquo;re in.</p>
                <a className="btn" href="/auth/sign-up">Create your account</a>
              </div>
            ) : (
              <div className="card roomy">
                <div className="eyebrow">Invitation</div>
                <h1 className="serif-title" style={{ fontSize: 36, margin: "6px 0 4px" }}>{name} invited you to connect on PsyAlliance.</h1>
                <p className="small">{[roleLabel(who.qualification_level), where].filter(Boolean).join(" · ")}</p>
                <p>
                  PsyAlliance is a verified network for doctoral psychologists and psychiatrists in independent practice: cover when you&rsquo;re away, the right
                  colleague for a referral, and peers to think a case through with.
                </p>
                <p className="invite-promise">
                  Accepting adds each of you to the other&rsquo;s <b>trusted circle</b>. Trusted colleagues come first in each other&rsquo;s matches. You&rsquo;re
                  connected once both of you are verified.
                </p>
                {error && <div className="banner error" role="alert">{error}</div>}
                {signedIn ? (
                  <form action={acceptInviteAction} className="row wrap" style={{ gap: 10 }}>
                    <input type="hidden" name="token" value={token} />
                    <button type="submit" className="btn lg">Connect with {first}</button>
                  </form>
                ) : (
                  <div className="stack" style={{ gap: 10 }}>
                    <a className="btn lg block" href={`/auth/sign-up?connect=${token}&from=invite`}>Create your account and connect with {first}</a>
                    <a className="btn secondary block" href={`/auth/sign-in?next=${encodeURIComponent(`/i/${token}`)}`}>Already a member? Sign in and connect</a>
                  </div>
                )}
                <p className="micro-note" style={{ marginTop: 14 }}>Founding members never pay. For PhD, PsyD and EdD psychologists and MD and DO psychiatrists.</p>
              </div>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
