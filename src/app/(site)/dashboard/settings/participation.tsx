import { saveAlertsAction } from "./participation-actions";
import { PushControl } from "./push-control";

export const SITUATION_OPTIONS: [string, string][] = [
  ["starting_practice", "Starting independent practice"],
  ["building_caseload", "Establishing or rebuilding a caseload"],
  ["professional_perspective", "Finding a professional perspective"],
  ["time_away", "Planning time away"],
  ["returning_relocating", "Returning or relocating"],
  ["reducing_closing", "Reducing or closing practice"],
  ["something_else", "Something else"],
  ["prefer_not_to_say", "Prefer not to say"],
];


export function ParticipationSections({ part, vapid = "", smsOn = false, alertsOn = false }: { part: any; vapid?: string; smsOn?: boolean; alertsOn?: boolean }) {
  return (
    <>
      {alertsOn && (
      <details className="card settings-group" id="alerts">
        <summary><span><h3>Alerts on your phone</h3><small>Optional. They only tell you something is waiting</small></span></summary>
        <PushControl enabled={!!part?.alertPush} vapid={vapid} />
        <form action={saveAlertsAction}>
          <p className="small">An alert names the colleague&apos;s first name and the kind of request, then says &ldquo;Review request.&rdquo; It never includes a client or anything clinical, and opening it only takes you to the app.</p>
          <div className="item">
            <label className="field" style={{ maxWidth: 320 }}>Phone number for text alerts (optional)
              <input type="tel" name="sms_phone" defaultValue={part?.smsPhone || ""} placeholder="+1 555 010 0199" autoComplete="tel" />
              <small>Include the country code. Message and data rates may apply. Reply STOP to any text to stop.{smsOn ? "" : " Text alerts are not switched on yet; we will keep your number and start using it when they are."}</small>
            </label>
            <label className="row" style={{ gap: 10, cursor: "pointer" }}>
              <input type="checkbox" name="sms_consent" style={{ accentColor: "var(--forest)", width: 18, height: 18 }} />
              <span>I agree to PsyAlliance texting this number with request alerts.</span>
            </label>
            {part?.smsPhone ? (
              <label className="row" style={{ gap: 10, cursor: "pointer", marginTop: 8 }}>
                <input type="checkbox" name="alert_sms" defaultChecked={!!part?.alertSms} style={{ accentColor: "var(--forest)", width: 18, height: 18 }} />
                <span>Send text alerts to {part.smsPhone}</span>
              </label>
            ) : null}
          </div>
          <div className="item row wrap" style={{ gap: 12 }}>
            <label className="field" style={{ maxWidth: 160 }}>Quiet from
              <input type="time" name="quiet_start" defaultValue={(part?.quietStart || "").slice(0, 5)} />
            </label>
            <label className="field" style={{ maxWidth: 160 }}>Quiet until
              <input type="time" name="quiet_end" defaultValue={(part?.quietEnd || "").slice(0, 5)} />
            </label>
            <small className="micro-note">Times are US Eastern. Alerts held during quiet hours are sent afterwards. Leave blank for none.</small>
          </div>
          <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
            <button type="submit" className="btn small-btn">Save alert settings</button>
            {part?.smsPhone ? <button type="submit" name="intent" value="remove-phone" className="btn secondary small-btn">Remove my phone number</button> : null}
          </div>
        </form>
      </details>
      )}
    </>
  );
}
