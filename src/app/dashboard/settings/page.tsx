import { createClient } from "@/lib/supabase/server";
import {
  saveNotificationPreferences,
  saveEmergencyContact,
  removeEmergencyContact,
  addToBlocklist,
  removeFromBlocklist,
} from "./actions";

export default async function SettingsPage(props: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await props.searchParams;
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
        Notification preferences, your emergency-cover contact, and a private list of colleagues to
        exclude from your own search and recommendations. None of this is visible to anyone else.
      </p>

      {saved === "1" && (
        <div className="card" style={{ borderColor: "var(--accent, #2a7)", background: "rgba(34,170,119,0.08)" }}>
          Notification preferences saved.
        </div>
      )}

      <div className="card">
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

      <div className="card">
        <h2>Emergency-cover contact</h2>
        <p className="muted">
          The one colleague who should be looped in if you're ever unexpectedly unavailable and your
          caseload needs covering. This is a plain designation. It doesn't share any client
          information automatically.
        </p>
        {emergencyContact ? (
          <div className="checkbox-row" style={{ justifyContent: "space-between" }}>
            <span>
              {emergencyContact.contact?.credential_prefix} {emergencyContact.contact?.full_name}
              {emergencyContact.notes ? `, ${emergencyContact.notes}` : ""}
            </span>
            <form action={removeEmergencyContact}>
              <button type="submit" className="secondary">Remove</button>
            </form>
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

      <div className="card">
        <h2>Do-not-work-with list</h2>
        <p className="muted">
          Colleagues you add here are quietly excluded from your own recommendations, matching
          results, and predictive search. This is on your side only; they're never notified.
        </p>
        {(blocklist || []).map((b: any) => (
          <div key={b.blocked_profile_id} className="checkbox-row" style={{ justifyContent: "space-between" }}>
            <span>{b.blocked?.credential_prefix} {b.blocked?.full_name}</span>
            <form action={removeFromBlocklist}>
              <input type="hidden" name="blocked_profile_id" value={b.blocked_profile_id} />
              <button type="submit" className="secondary">Remove</button>
            </form>
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
    </div>
  );
}
