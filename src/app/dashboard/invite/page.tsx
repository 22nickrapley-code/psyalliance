import { createClient } from "@/lib/supabase/server";
import { clinicianName } from "@/lib/profession";
import { loadInvite } from "@/lib/invite";
import { shortDate } from "@/lib/dates";
import { PageHead, Status, PersonAvatar } from "../_components/ui";
import { InviteBox } from "../_components/invite-box";

export const metadata = { title: "Invite a colleague" };

// Your personal invitation link. A colleague who joins through it, or a
// member who opens it and accepts, goes straight into your trusted circle,
// and you into theirs, once both of you are verified.
export default async function InvitePage() {
  const supabase = await createClient();
  const [invite, { data: inv }] = await Promise.all([loadInvite(supabase), supabase.rpc("my_invitations")]);
  const sent = ((inv as any)?.sent as any[]) || [];

  return (
    <>
      <PageHead
        eyebrow="Your professional circle"
        title="Invite a colleague"
        lead="Your own link. Anyone who joins through it, or is already a member and accepts it, becomes your trusted colleague, and you theirs."
      />
      <div className="split">
        <div className="stack">
          <InviteBox
            info={invite}
            title={invite.mode === "member" ? "Send your link however suits you." : "Invite a colleague"}
            lead={
              invite.mode === "member"
                ? "Type their email, mobile number or LinkedIn profile and send it from your own email, phone or LinkedIn. You're connected once both of you are verified with a reviewed license in an open state; until then the connection waits and gives no one early access."
                : undefined
            }
          />

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
              <li>Once both of you are verified, you&rsquo;re each other&rsquo;s trusted colleagues. No searching, no second invitation.</li>
            </ol>
            <p className="micro-note">Trusted colleagues come first in each other&rsquo;s matches for cover and referrals.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
