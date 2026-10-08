import { createClient } from "@/lib/supabase/server";
import { clinicianName } from "@/lib/profession";
import { IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { shortDate } from "@/lib/dates";
import { PageHead, Status, PersonAvatar } from "../_components/ui";
import { CopyLink } from "../_components/copy-link";

export const metadata = { title: "Invite a colleague" };

// Your personal invitation link. A colleague who joins through it, or a
// member who opens it and accepts, goes straight into your trusted circle,
// and you into theirs, once both of you are verified.
export default async function InvitePage() {
  const supabase = await createClient();
  const [{ data: token }, { data: inv }, { data: me }] = await Promise.all([
    supabase.rpc("my_invite_link"),
    supabase.rpc("my_invitations"),
    supabase.rpc("my_profile").select("full_name, credential_prefix, qualification_level").maybeSingle<any>(),
  ]);
  const link = token ? `${REAL_SITE_URL}/i/${token}` : null;
  const myName = me ? clinicianName(me.full_name, me.qualification_level, me.credential_prefix) : "A colleague";
  const sent = ((inv as any)?.sent as any[]) || [];
  const mail = link
    ? `mailto:?subject=${encodeURIComponent(`${myName.split(",")[0]} invited you to PsyAlliance`)}&body=${encodeURIComponent(
        `I use PsyAlliance for cover, referrals and consultation with colleagues I trust, and I'd like you in my circle.\n\nThis link connects us as soon as you've joined and been verified:\n${link}\n\nIt's free for founding members, for doctoral psychologists and psychiatrists.`
      )}`
    : null;

  return (
    <>
      <PageHead
        eyebrow="Your professional circle"
        title="Invite a colleague"
        lead="Your own link. Anyone who joins through it, or is already a member and accepts it, goes straight into your trusted circle, and you into theirs."
      />
      <div className="split">
        <div className="stack">
          <section className="card roomy">
            <div className="eyebrow">Your invitation link</div>
            {link ? (
              <>
                <h3>Share it however suits you.</h3>
                <CopyLink value={link} label="Your invitation link" />
                <div className="row wrap" style={{ marginTop: 12, gap: 10 }}>
                  <a className="btn" href={mail!}>Email it</a>
                </div>
                <p className="micro-note" style={{ marginTop: 12 }}>
                  You&rsquo;re connected once both of you are verified with a reviewed license in an open state. Until then the connection waits; it gives no
                  one access early.
                </p>
              </>
            ) : (
              <p className="small">
                {IS_DEMO_SITE
                  ? "Invitations aren't sent from the sandbox. In your real account, Network > Invite a colleague gives you your own link."
                  : "Your link becomes available once your account is set up as a clinician."}
              </p>
            )}
          </section>

          <section className="card">
            <div className="card-title"><h3>Joined through your link</h3>{sent.length > 0 && <span className="micro-note">{sent.length}</span>}</div>
            {sent.length === 0 ? (
              <p className="small">No one yet. When a colleague joins through your link, they appear here.</p>
            ) : (
              sent.map((s) => {
                const name = clinicianName(s.name, s.qualification_level, s.credential_prefix);
                return (
                  <div key={s.id} className="list-row">
                    <span className="row"><PersonAvatar name={name} /><span><strong>{name}</strong><small className="micro-note" style={{ display: "block" }}>Joined {shortDate(s.joined)}</small></span></span>
                    {s.connected ? (
                      <a className="btn secondary small-btn" href={`/dashboard/people/${s.id}`}>In your circle</a>
                    ) : (
                      <Status tone="warn">Connects once verified</Status>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </div>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">How it works</div>
            <ol className="plain-steps">
              <li>Your colleague opens your link and sees it&rsquo;s from you.</li>
              <li>They create an account, or sign in if they&rsquo;re already a member.</li>
              <li>Once both of you are verified, you&rsquo;re in each other&rsquo;s trusted circle. No searching, no second invitation.</li>
            </ol>
            <p className="micro-note">Trusted colleagues come first in each other&rsquo;s matches for cover and referrals.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
