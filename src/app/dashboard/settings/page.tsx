import { createClient } from "@/lib/supabase/server";
import {
  saveNotificationPreferences,
  saveEmergencyContact,
  removeEmergencyContact,
  addToBlocklist,
  removeFromBlocklist,
} from "./actions";

export default async function SettingsPage(props: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [
    { data: prefs },
    { data: emergencyContact },
    { data: blocklist },
    { data: directoryRows },
  ] = await Promise.all([
    supabase.from("notification_preferences").select("*").eq("profile_id", myself).maybeSingle(),
    supabase
      .from("emergency_contacts")
      .select("*, contact:contact_profile_id(id, full_name, credential_prefix)")
      .eq("profile_id", myself)
      .maybeSingle(),
    supabase
      .from("do_not_work_with")
      .select("*, blocked:blocked_profile_id(id, full_name, credential_prefix)")
      .eq("profile_id", myself),
    supabase.from("public_directory").select("id, full_name, credential_prefix"),
  ]);

  const blockedIds = new Set((blocklist || []).map((b: any) => b.blocked_profile_id));
  const peopleById = new Map<string, { id: string; full_name: string; credential_prefix: string | null }>();
  for (const row of directoryRows || []) {
    if (row.id === myself) continue;
    if (!peopleById.has(row.id)) {
      peopleById.set(row.id, { id: row.id, full_name: row.full_name, credential_prefix: row.credential_prefix });
    }
  }
  const selectablePeople = Array.from(peopleById.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div>
      <h1>Settings</h1>
      <p className="muted">
        Nothing on this page is visible to anyone else.
      </p>

      {/* Sept 23 audit: Settings was one long unlabeled scroll of unrelated
          controls - reorganized into named categories per the audit's
          recommendation (this is also the resolved answer to "what does
          Privacy/Data controls mean" - it's these category labels, not new
          account-deletion/export features, which aren't built yet). */}
      <nav className="settings-jump" style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "1.25rem" }}>
        <a href="#account-security" className="tag">Account &amp; security</a>
        <a href="#notifications" className="tag">Notifications</a>
        <a href="#privacy-controls" className="tag">Privacy &amp; controls</a>
        <a href="#blocked-excluded" className="tag">Blocked / Excluded</a>
        <a href="#data" className="tag">Data</a>
      </nav>

      {error && <div className="error-banner">{error}</div>}

      {saved === "1" && (
        <div className="card" style={{ borderColor: "var(--accent, #2a7)", background: "rgba(34,170,119,0.08)" }}>
          Notification preferences saved.
        </div>
      )}

      <div className="card" id="account-security">
        <h2>Account &amp; security</h2>
        <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9rem" }}>
          Signed in as <strong style={{ color: "var(--text)" }}>{user!.email}</strong>
        </p>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          To change your password, request a reset link the same way you would if you'd forgotten
          it - you'll stay signed in on this device until you use it.
        </p>
        <a href="/auth/forgot-password" className="btn secondary">Send password reset link</a>
      </div>

      <div className="card" id="notifications">
        <h2>Notifications</h2>
        <form action={saveNotificationPreferences}>
          <div className="checkbox-row">
            <input
              id="email_on_connection_request"
              name="email_on_connection_request"
              type="checkbox"
              defaultChecked={prefs?.email_on_connection_request ?? true}
            />
            <label htmlFor="email_on_connection_request" style={{ margin: 0, fontWeight: 400 }}>
              Email me when someone sends a connection request
            </label>
          </div>
          <div className="checkbox-row">
            <input
              id="email_on_referral_request"
              name="email_on_referral_request"
              type="checkbox"
              defaultChecked={prefs?.email_on_referral_request ?? true}
            />
            <label htmlFor="email_on_referral_request" style={{ margin: 0, fontWeight: 400 }}>
              Email me about new open referral/coverage requests I might be able to help with
            </label>
          </div>
          <div className="checkbox-row">
            <input
              id="email_on_referral_response"
              name="email_on_referral_response"
              type="checkbox"
              defaultChecked={prefs?.email_on_referral_response ?? true}
            />
            <label htmlFor="email_on_referral_response" style={{ margin: 0, fontWeight: 400 }}>
              Email me when someone responds to my referral request
            </label>
          </div>
          <div className="checkbox-row">
            <input
              id="email_on_message"
              name="email_on_message"
              type="checkbox"
              defaultChecked={prefs?.email_on_message ?? true}
            />
            <label htmlFor="email_on_message" style={{ margin: 0, fontWeight: 400 }}>
              Email me about new direct messages
            </label>
          </div>
          <div className="checkbox-row">
            <input
              id="email_on_town_hall_reply"
              name="email_on_town_hall_reply"
              type="checkbox"
              defaultChecked={prefs?.email_on_town_hall_reply ?? true}
            />
            <label htmlFor="email_on_town_hall_reply" style={{ margin: 0, fontWeight: 400 }}>
              Email me about replies to Town Hall threads I've posted in
            </label>
          </div>
          <div className="checkbox-row">
            <input
              id="email_on_endorsement"
              name="email_on_endorsement"
              type="checkbox"
              defaultChecked={prefs?.email_on_endorsement ?? false}
            />
            <label htmlFor="email_on_endorsement" style={{ margin: 0, fontWeight: 400 }}>
              Email me when I receive a reaction or endorsement
            </label>
          </div>
          <h3 style={{ fontSize: "0.95rem", marginTop: "1.25rem" }}>New colleague notifications</h3>
          <div className="checkbox-row">
            <input
              id="email_on_new_colleague_in_location"
              name="email_on_new_colleague_in_location"
              type="checkbox"
              defaultChecked={prefs?.email_on_new_colleague_in_location ?? true}
            />
            <label htmlFor="email_on_new_colleague_in_location" style={{ margin: 0, fontWeight: 400 }}>
              A new verified colleague joins in my location
            </label>
          </div>
          <div className="checkbox-row">
            <input
              id="email_on_new_colleague_matching_specialism"
              name="email_on_new_colleague_matching_specialism"
              type="checkbox"
              defaultChecked={prefs?.email_on_new_colleague_matching_specialism ?? true}
            />
            <label htmlFor="email_on_new_colleague_matching_specialism" style={{ margin: 0, fontWeight: 400 }}>
              A new colleague joins matching one of my specialisms
            </label>
          </div>
          <div className="checkbox-row">
            <input
              id="email_on_new_colleague_matching_caseload"
              name="email_on_new_colleague_matching_caseload"
              type="checkbox"
              defaultChecked={prefs?.email_on_new_colleague_matching_caseload ?? true}
            />
            <label htmlFor="email_on_new_colleague_matching_caseload" style={{ margin: 0, fontWeight: 400 }}>
              A new colleague joins matching one of my current caseload needs
            </label>
          </div>
          <div className="field" style={{ maxWidth: 260, marginTop: "0.75rem" }}>
            <label htmlFor="digest_frequency">How often should we email you, at most?</label>
            <select id="digest_frequency" name="digest_frequency" defaultValue={prefs?.digest_frequency || "realtime"}>
              <option value="realtime">As it happens</option>
              <option value="daily">Daily digest</option>
              <option value="weekly">Weekly digest</option>
              <option value="off">Don't email me at all</option>
            </select>
          </div>
          <button type="submit" style={{ marginTop: "1rem" }}>Save notification preferences</button>
        </form>
      </div>

      <div className="card" id="privacy-controls">
        <h2>Privacy &amp; controls</h2>
        <p className="muted">
          Who's designated to coordinate on your behalf if you're ever unexpectedly unavailable.
        </p>
        <h3 style={{ fontSize: "0.95rem" }}>Emergency-cover contact</h3>
        <p className="muted">
          The one colleague who should be looped in if you're ever unexpectedly unavailable and your
          caseload needs covering. This is a plain designation. It doesn't share any client
          information automatically.
        </p>
        {emergencyContact ? (
          <div className="person-row">
            <span className="person-row-info">
              {emergencyContact.contact?.credential_prefix} {emergencyContact.contact?.full_name}
              {emergencyContact.notes ? `, ${emergencyContact.notes}` : ""}
            </span>
            <span className="person-row-actions">
              <form action={removeEmergencyContact}>
                <button type="submit" className="secondary">Remove</button>
              </form>
            </span>
          </div>
        ) : (
          <p className="muted">No emergency contact set yet.</p>
        )}
        <form action={saveEmergencyContact} className="field-row" style={{ alignItems: "flex-end", marginTop: "0.75rem" }}>
          <div className="field">
            <label htmlFor="contact_profile_id">Colleague</label>
            <select id="contact_profile_id" name="contact_profile_id" defaultValue="">
              <option value="" disabled>Choose a colleague…</option>
              {selectablePeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.credential_prefix} {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="notes">Note (optional)</label>
            <input id="notes" name="notes" type="text" placeholder="e.g. has my caseload overview" defaultValue={emergencyContact?.notes || ""} />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>

      <div className="card" id="blocked-excluded">
        <h2>Blocked / Excluded</h2>
        <p className="muted">
          Colleagues you add here are quietly excluded from your own recommendations, matching
          results, and predictive search. This is on your side only; they're never notified.
        </p>
        {(blocklist || []).map((b: any) => (
          <div key={b.blocked_profile_id} className="person-row">
            <span className="person-row-info">{b.blocked?.credential_prefix} {b.blocked?.full_name}</span>
            <span className="person-row-actions">
              <form action={removeFromBlocklist}>
                <input type="hidden" name="blocked_profile_id" value={b.blocked_profile_id} />
                <button type="submit" className="secondary">Remove</button>
              </form>
            </span>
          </div>
        ))}
        {(blocklist || []).length === 0 && <p className="muted">Nobody on this list.</p>}
        <form action={addToBlocklist} className="field-row" style={{ alignItems: "flex-end", marginTop: "0.75rem" }}>
          <div className="field">
            <label htmlFor="blocked_profile_id">Add a colleague</label>
            <select id="blocked_profile_id" name="blocked_profile_id" defaultValue="">
              <option value="" disabled>Choose a colleague…</option>
              {selectablePeople
                .filter((p) => !blockedIds.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.credential_prefix} {p.full_name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="submit" className="secondary">Add to list</button>
          </div>
        </form>
      </div>

      <div className="card" id="data">
        <h2>Data</h2>
        <p className="muted">
          Your profile and credential information is used to verify your identity and connect you
          with other verified clinicians on the network - never sold, never used for advertising.
          A full self-serve data export or account-deletion tool isn't built yet; until it is,
          email <a href="mailto:hello@psyalliance.org">hello@psyalliance.org</a> for either one and
          we'll handle it directly.
        </p>
      </div>
    </div>
  );
}
