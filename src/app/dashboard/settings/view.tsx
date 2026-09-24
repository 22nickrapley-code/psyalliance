import {
  saveNotificationPreferences,
  saveEmergencyContact,
  removeEmergencyContact,
  removeFromBlocklist,
  unblockMemberAction,
  savePrivacyAction,
  setDemoViewAction,
} from "./actions";
import { PageHead, Banner } from "../_components/ui";

// Settings (Product Spec v1): account, notification channels, digest
// frequency, privacy (who can see your profile, Exclude and Block lists),
// sign-in and data export.

const TRIGGERS: { key: string; label: string; when: string; col: string; always?: boolean }[] = [
  { key: "n_cover_request", label: "A colleague asks you for cover", when: "Straight away. Urgent absences get a reminder after 24 hours.", col: "email_on_coverage_request" },
  { key: "n_referral_match", label: "A referral matches your practice", when: "Straight away", col: "email_on_referral_request" },
  { key: "n_replies", label: "Replies to your referral, cover request or question", when: "Straight away", col: "email_on_referral_response" },
  { key: "n_invitations", label: "Invitations to a trusted circle or group", when: "Straight away", col: "email_on_trusted_invitation" },
  { key: "n_messages", label: "New messages", when: "Only if still unread after an hour", col: "email_on_message" },
  { key: "n_availability", label: "Monthly availability check", when: "Once a month, answer in one click", col: "email_on_availability_reminder" },
  { key: "n_credentials", label: "Licence and renewal reminders", when: "90, 30 and 7 days before", col: "email_on_credential_reminder" },
];

function nameOf(p: any) {
  return p ? `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}` : "Member";
}

export function SettingsView({ sp, email, me, prefs, profile, emergency, excluded, blocked, blockedProfiles, circle }: { sp: { saved?: string; error?: string }; email: string; me: string; prefs: any; profile: any; emergency: any; excluded: any[] | null; blocked: { blocked_profile_id: string }[] | null; blockedProfiles: any[] | null; circle: any[] | null }) {
  const blockedNames = new Map((blockedProfiles || []).map((p: any) => [p.id, nameOf(p)]));

  const people = new Map<string, any>();
  for (const r of circle || []) if (r.id !== me && !people.has(r.id)) people.set(r.id, r);
  const colleagues = Array.from(people.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const on = (col: string) => (prefs ? prefs[col] !== false : true);
  const listed = profile?.directory_visible !== false;

  const okMsg =
    sp.saved === "demo-on" ? "Demo network on. You're now seeing the fake demo members, not the real network." : sp.saved === "demo-off" ? "Demo network off. You're back on the real network." : sp.saved === "privacy" ? "Privacy setting saved." : sp.saved === "blocked" ? "Blocked. They can't contact you and you're hidden from each other." : sp.saved ? "Notification settings saved." : null;

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Your account and privacy."
        lead="Nothing on this page is visible to anyone else."
      />
      <Banner error={sp.error} ok={okMsg} />
      <nav className="chip-row" aria-label="Sections" style={{ marginBottom: 18 }}>
        <a className="chip" href="#account">Account</a>
        <a className="chip" href="#notifications">Notifications</a>
        <a className="chip" href="#privacy">Privacy</a>
        <a className="chip" href="#cover-contact">Emergency cover contact</a>
        <a className="chip" href="#data">Your data</a>
      </nav>

      <div className="split">
        <div className="stack">
          <section className="card" id="account">
            <h3>Account and sign-in</h3>
            <ul className="summary-list">
              <li><span>Signed in as</span><strong>{email}</strong></li>
            </ul>
            <p className="small" style={{ marginTop: 12 }}>To change your password we send you a reset link. You stay signed in on this device until you use it.</p>
            <a className="btn secondary small-btn" href="/auth/forgot-password">Send a password reset link</a>
          </section>

          <form action={saveNotificationPreferences} className="card" id="notifications">
            <h3>Notifications</h3>
            <p className="small">Everything always shows in-app and on Home. Choose what also comes by email.</p>
            {TRIGGERS.map((t) => (
              <label key={t.key} className="item row between" style={{ cursor: "pointer" }}>
                <span>
                  <strong>{t.label}</strong>
                  <p>{t.when}</p>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <span className="micro-note">Email</span>
                  <input type="checkbox" name={t.key} defaultChecked={on(t.col)} style={{ accentColor: "var(--forest)", width: 18, height: 18 }} />
                </span>
              </label>
            ))}
            <div className="item">
              <label className="field" style={{ maxWidth: 320 }}>
                Weekly digest
                <select name="digest_frequency" defaultValue={prefs?.digest_frequency && ["weekly", "fortnightly", "off"].includes(prefs.digest_frequency) ? prefs.digest_frequency : "weekly"}>
                  <option value="weekly">Every week</option>
                  <option value="fortnightly">Every two weeks</option>
                  <option value="off">Off</option>
                </select>
                <small>One email: referral needs that matched you, colleagues looking for cover, discussions in tags you follow, and anything waiting on you.</small>
              </label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="submit" className="btn small-btn">Save notification settings</button>
            </div>
          </form>

          <section className="card" id="privacy">
            <h3>Privacy</h3>
            <form action={savePrivacyAction} className="item">
              <strong>Who can see your profile</strong>
              <p>Only verified, signed-in members. Never the public, and never search engines.</p>
              <div className="seg">
                <label>
                  <input type="radio" name="directory_visible" value="listed" defaultChecked={listed} />
                  Listed in the directory and suggestions
                </label>
                <label>
                  <input type="radio" name="directory_visible" value="hidden" defaultChecked={!listed} />
                  Hidden
                </label>
              </div>
              <p className="micro-note" style={{ marginTop: 8 }}>Hidden: you can still send referrals, cover requests and questions, but colleagues won&rsquo;t find or be suggested you.</p>
              <button type="submit" className="btn secondary small-btn" style={{ marginTop: 8 }}>Save</button>
            </form>

            <div className="item">
              <strong>Excluded from your suggestions</strong>
              <p>People you&rsquo;d rather not be suggested. They aren&rsquo;t told. Add someone from their profile.</p>
              {(excluded || []).length === 0 ? (
                <p className="micro-note">Nobody excluded.</p>
              ) : (
                (excluded || []).map((b: any) => (
                  <div key={b.blocked_profile_id} className="row between" style={{ marginTop: 6 }}>
                    <span className="small">{nameOf(b.blocked)}</span>
                    <form action={removeFromBlocklist} className="inline">
                      <input type="hidden" name="blocked_profile_id" value={b.blocked_profile_id} />
                      <button type="submit" className="plain-button small">Include again</button>
                    </form>
                  </div>
                ))
              )}
            </div>

            <div className="item">
              <strong>Blocked</strong>
              <p>They can&rsquo;t message or invite you, and you&rsquo;re hidden from each other. They aren&rsquo;t told. Block someone from their profile.</p>
              {(blocked || []).length === 0 ? (
                <p className="micro-note">Nobody blocked.</p>
              ) : (
                (blocked || []).map((b) => (
                  <div key={b.blocked_profile_id} className="row between" style={{ marginTop: 6 }}>
                    <span className="small">{blockedNames.get(b.blocked_profile_id) || "A former member"}</span>
                    <form action={unblockMemberAction} className="inline">
                      <input type="hidden" name="blocked_profile_id" value={b.blocked_profile_id} />
                      <button type="submit" className="plain-button small">Unblock</button>
                    </form>
                  </div>
                ))
              )}
            </div>
            <p className="micro-note" style={{ marginBottom: 0 }}>Saved colleagues, Exclude, Block and your private &ldquo;would work with again&rdquo; answers are never visible to the other person.</p>
          </section>

          <section className="card" id="cover-contact">
            <h3>Emergency cover contact</h3>
            <p className="small">The colleague to loop in if you&rsquo;re suddenly unavailable. A designation only: nothing about your patients is shared.</p>
            {emergency ? (
              <div className="row between">
                <span className="small"><strong>{nameOf(emergency.contact)}</strong>{emergency.notes ? ` · ${emergency.notes}` : ""}</span>
                <form action={removeEmergencyContact} className="inline">
                  <button type="submit" className="plain-button small">Remove</button>
                </form>
              </div>
            ) : (
              <p className="micro-note">Not set.</p>
            )}
            <form action={saveEmergencyContact} className="fields" style={{ marginTop: 12 }}>
              <label className="field">
                Colleague
                <select name="contact_profile_id" defaultValue="" required>
                  <option value="" disabled>Choose a colleague</option>
                  {colleagues.map((p) => (
                    <option key={p.id} value={p.id}>{nameOf(p)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Note (optional)
                <input name="notes" placeholder="e.g. knows where my practice files are" defaultValue={emergency?.notes || ""} />
              </label>
              <div><button type="submit" className="btn secondary small-btn">Save</button></div>
            </form>
          </section>

          {(profile?.is_admin || profile?.demo_view) && (
            <form action={setDemoViewAction} className="card" id="demo">
              <h3>Demo network</h3>
              <p className="small">
                See PsyAlliance filled with fake, clearly-labelled demo members so you can try every feature. Real members never see the demo network, and demo activity never reaches them.
              </p>
              <div className="seg">
                <label>
                  <input type="radio" name="demo_view" value="on" defaultChecked={!!profile?.demo_view} disabled={!profile?.is_admin && !profile?.demo_view} />
                  Show the demo network
                </label>
                <label>
                  <input type="radio" name="demo_view" value="off" defaultChecked={!profile?.demo_view} />
                  Show the real network
                </label>
              </div>
              <button type="submit" className="btn secondary small-btn" style={{ marginTop: 10 }}>Save</button>
            </form>
          )}

          <section className="card" id="data">
            <h3>Your data</h3>
            <p className="small">Your profile and credentials are used to verify you and connect you with verified colleagues. Never sold, never used for advertising.</p>
            <div className="row wrap">
              <a className="btn secondary small-btn" href="/dashboard/settings/export">Download my data (JSON)</a>
              <a className="plain-button small" href="mailto:hello@psyalliance.org?subject=Delete%20my%20account">Ask us to delete my account</a>
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">Private by default</div>
            <h3>What others never see</h3>
            <ul className="note-list" style={{ paddingLeft: 16, margin: 0 }}>
              <li>Who you&rsquo;ve saved, excluded or blocked</li>
              <li>Your &ldquo;would work with again&rdquo; answers</li>
              <li>Your My Library files</li>
              <li>Your renewals and CE log</li>
            </ul>
          </section>
          <section className="card">
            <div className="eyebrow">Elsewhere</div>
            <ul className="summary-list">
              <li><span>Availability</span><strong><a href="/dashboard/availability">Update</a></strong></li>
              <li><span>Profile</span><strong><a href="/dashboard/profile">Edit</a></strong></li>
              <li><span>Licences</span><strong><a href="/dashboard/credentials">Credentials</a></strong></li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
