import { clinicianName } from "@/lib/profession";
import { shortDate } from "@/lib/dates";
import { PageHead, Banner, Status } from "../_components/ui";
import { CopyLink } from "../_components/copy-link";
import { saveOverflowPage, toggleOverflowColleague, savePublicListing } from "./actions";

type Candidate = {
  profile_id: string;
  full_name: string;
  credential_prefix: string | null;
  qualification_level: string | null;
  city: string | null;
  state: string | null;
  listed: boolean;
  open: boolean;
  referral: string | null;
  confirmed_at: string | null;
};

const DEFAULT_MESSAGE = "I'm not taking new clients right now. These colleagues I trust have openings, and I'd be glad for you to contact them.";

// "When you're full": a public page to put in your voicemail, email
// auto-reply and directory profile, listing trusted colleagues who have
// openings and have agreed to be listed.
export function FullView({
  sp,
  page,
  listing,
  candidates,
  base,
  suggestedSlug,
}: {
  sp: { saved?: string; error?: string };
  page: { slug: string; enabled: boolean; message: string | null; hidden: string[] } | null;
  listing: { enabled: boolean; website: string | null; phone: string | null; email: string | null; note: string | null } | null;
  candidates: Candidate[];
  base: string;
  suggestedSlug: string;
}) {
  const hidden = new Set(page?.hidden || []);
  const shown = candidates.filter((c) => c.listed && c.open && !hidden.has(c.profile_id));
  const leftOff = candidates.filter((c) => c.listed && c.open && hidden.has(c.profile_id));
  const notOpen = candidates.filter((c) => c.listed && !c.open);
  const notListed = candidates.filter((c) => !c.listed);
  const url = page ? `${base}${page.slug}` : null;
  const nameOf = (c: Candidate) => clinicianName(c.full_name, c.qualification_level, c.credential_prefix);
  const where = (c: Candidate) => [c.city, c.state].filter(Boolean).join(", ");

  return (
    <>
      <PageHead
        eyebrow="Your practice"
        title="When you're full"
        lead="One link for your voicemail, email auto-reply and directory profile: you're not taking new clients, and these colleagues you trust have openings. It updates itself as their availability changes."
        actions={page?.enabled && url ? <a className="btn secondary" href={url} target="_blank" rel="noopener">See your page</a> : undefined}
      />
      <Banner error={sp.error} ok={sp.saved === "page" ? "Your page is saved." : sp.saved === "listing" ? "Your listing is saved." : null} />

      <div className="split">
        <div className="stack">
          <section className="card full-page-card">
            <div className="row between wrap" style={{ gap: 10 }}>
              <h3 style={{ margin: 0 }}>Your page</h3>
              <Status tone={page?.enabled ? "" : "neutral"}>{page?.enabled ? "Live" : "Off"}</Status>
            </div>
            {page?.enabled && url && (
              <div style={{ marginTop: 12 }}>
                <CopyLink value={url} label="Your page's address" />
              </div>
            )}
            <form action={saveOverflowPage} className="stack" style={{ gap: 14, marginTop: 16 }}>
              <label className="checkline">
                <input type="checkbox" name="enabled" value="1" defaultChecked={page?.enabled ?? true} /> Page is live
              </label>
              <label className="field">
                Web address
                <span className="slug-field">
                  <span className="slug-base">{base}</span>
                  <input name="slug" defaultValue={page?.slug || suggestedSlug} required minLength={3} maxLength={40} pattern="[A-Za-z0-9-]+" />
                </span>
              </label>
              <label className="field">
                What it says
                <textarea name="message" rows={3} maxLength={400} defaultValue={page?.message || DEFAULT_MESSAGE} />
                <small>Visitors also see a reminder to call or text 988 in an emergency.</small>
              </label>
              <div><button type="submit" className="btn">Save your page</button></div>
            </form>
          </section>

          <section className="card" id="colleagues">
            <div className="card-title">
              <h3>Who appears</h3>
              <span className="micro-note">Trusted colleagues taking referrals, who have agreed to be listed</span>
            </div>
            {candidates.length === 0 && (
              <p className="small">Your page lists colleagues from your trusted circle. <a href="/dashboard/network">Invite colleagues you trust</a> to get started.</p>
            )}
            {shown.length > 0 && (
              <ul className="full-list">
                {shown.map((c) => (
                  <li key={c.profile_id}>
                    <span>
                      <b>{nameOf(c)}</b>
                      <small>{where(c)} &middot; {c.referral === "yes" ? "Accepting new clients" : "Taking selected referrals"}{c.confirmed_at ? `, confirmed ${shortDate(c.confirmed_at)}` : ""}</small>
                    </span>
                    <form action={toggleOverflowColleague}>
                      <input type="hidden" name="id" value={c.profile_id} />
                      <button type="submit" className="plain-button small">Leave off</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {leftOff.length > 0 && (
              <>
                <div className="full-group">Left off by you</div>
                <ul className="full-list muted-list">
                  {leftOff.map((c) => (
                    <li key={c.profile_id}>
                      <span><b>{nameOf(c)}</b><small>{where(c)}</small></span>
                      <form action={toggleOverflowColleague}>
                        <input type="hidden" name="id" value={c.profile_id} />
                        <button type="submit" className="plain-button small">Show again</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {notOpen.length > 0 && (
              <>
                <div className="full-group">Not taking referrals right now</div>
                <ul className="full-list muted-list">
                  {notOpen.map((c) => (
                    <li key={c.profile_id}><span><b>{nameOf(c)}</b><small>Appears again when they confirm openings</small></span></li>
                  ))}
                </ul>
              </>
            )}
            {notListed.length > 0 && (
              <>
                <div className="full-group">Haven&rsquo;t agreed to be listed</div>
                <ul className="full-list muted-list">
                  {notListed.map((c) => (
                    <li key={c.profile_id}>
                      <span><b>{nameOf(c)}</b><small>Clients can only see colleagues who opt in</small></span>
                      <a className="text-arrow" href={`/dashboard/messages?to=${c.profile_id}`}>Ask them &rarr;</a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card" id="listing">
            <h3>Appear on colleagues&rsquo; pages</h3>
            <p className="small">
              When you have openings, trusted colleagues&rsquo; pages can list you. You choose what clients see; you appear only while you&rsquo;re
              taking referrals and your availability is current.
            </p>
            <form action={savePublicListing} className="stack" style={{ gap: 14 }}>
              <label className="checkline">
                <input type="checkbox" name="enabled" value="1" defaultChecked={!!listing?.enabled} /> List me on trusted colleagues&rsquo; pages
              </label>
              <div className="fields">
                <label className="field">Phone for new clients<input name="phone" defaultValue={listing?.phone || ""} placeholder="e.g. (718) 555-0142" /></label>
                <label className="field">Email for new clients<input name="email" type="email" defaultValue={listing?.email || ""} placeholder="e.g. intake@yourpractice.com" /></label>
                <label className="field">Website or booking page<input name="website" defaultValue={listing?.website || ""} placeholder="e.g. yourpractice.com" /></label>
                <label className="field">A short note <span className="micro-note">(optional)</span><input name="note" maxLength={200} defaultValue={listing?.note || ""} placeholder="e.g. Evening telehealth; free 15-minute call" /></label>
              </div>
              <div><button type="submit" className="btn secondary">Save</button></div>
            </form>
          </section>
        </div>

        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">Where to use it</div>
            <h3>Put the link where people find you.</h3>
            {url ? (
              <>
                <p className="small"><b>Voicemail:</b> &ldquo;I&rsquo;m not taking new clients right now. For colleagues I recommend, visit {url.replace(/^https?:\/\//, "")}.&rdquo;</p>
                <p className="small"><b>Email auto-reply:</b> &ldquo;Thank you for reaching out. My practice is full; colleagues I trust with openings are listed here: {url}&rdquo;</p>
                <p className="small" style={{ marginBottom: 0 }}><b>Directory profile:</b> add the link to your &ldquo;not accepting new clients&rdquo; note.</p>
              </>
            ) : (
              <p className="small" style={{ marginBottom: 0 }}>Save your page and suggested wording for your voicemail, auto-reply and directory profile appears here.</p>
            )}
          </section>
          <section className="card">
            <div className="eyebrow">What visitors see</div>
            <ul className="continuity-rules">
              <li>Your name, your message, and each colleague&rsquo;s name, credentials, location, focus and the contact details they chose.</li>
              <li>Only colleagues who are taking referrals and confirmed it in the last 90 days.</li>
              <li>Nothing about your clients, and no way to message through PsyAlliance.</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
