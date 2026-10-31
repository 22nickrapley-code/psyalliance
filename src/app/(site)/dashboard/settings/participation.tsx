import { saveSituationsAction, saveApproachAction, saveAlertsAction } from "./participation-actions";
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

const SERVICES = [
  { k: "referrals", key: "Referrals", label: "Referral requests", what: "Colleagues can send you a request to take on a client. Pausing stops new requests; ones already sent stay open." },
  { k: "cover", key: "Cover", label: "Cover requests", what: "Colleagues can ask you to cover their practice. Pausing stops new requests; plans already agreed carry on." },
  { k: "consult", key: "Consult", label: "Consult invitations", what: "Colleagues can invite you into a consultation. Pausing stops new invitations; discussions you are in carry on." },
];

export function ParticipationSections({ part, vapid = "", smsOn = false, alertsOn = false }: { part: any; vapid?: string; smsOn?: boolean; alertsOn?: boolean }) {
  const sit: string[] = part?.situations || [];
  return (
    <>
      <details className="card settings-group" id="situations">
        <summary><span><h3>What would be useful to you at the moment?</h3><small>Optional. Only you can see this</small></span></summary>
        <form action={saveSituationsAction}>
          <p className="small">Choose any that apply, or skip. This only shapes what we suggest first; it never limits what you can do and nobody else sees it.</p>
          {SITUATION_OPTIONS.map(([v, l]) => (
            <label key={v} className="item row" style={{ gap: 10, cursor: "pointer" }}>
              <input type="checkbox" name="situation" value={v} defaultChecked={sit.includes(v)} style={{ accentColor: "var(--forest)", width: 18, height: 18 }} />
              <span>{l}</span>
            </label>
          ))}
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button type="submit" className="btn small-btn">Save</button>
            <button type="submit" name="intent" value="skip" className="btn secondary small-btn">Skip for now</button>
          </div>
        </form>
      </details>

      <details className="card settings-group" id="approach">
        <summary><span><h3>How would you like colleagues to approach you?</h3><small>Each one is separate. Pausing never cancels work already under way</small></span></summary>
        <form action={saveApproachAction}>
          <p className="small">You choose each one on its own. You do not need to give a reason. Pausing or closing one does not change the others or your availability confirmation.</p>
          {SERVICES.map((s) => {
            const open = part?.[`open${s.key}`] !== false;
            const paused = !!part?.[`paused${s.key}`];
            const until: string | null = part?.[`pause${s.key}Until`] || null;
            const review = !!part?.[`review${s.key}`];
            const state = !open ? "Not taking new requests" : paused ? (review ? "Pause has ended: please review" : `Paused${until ? ` until ${until}` : ""}`) : "Taking new requests";
            return (
              <div key={s.k} className="item" data-service={s.k}>
                <strong>{s.label}</strong>
                <p>{s.what}</p>
                <p className="micro-note" data-state={s.k} role="status">{state}</p>
                {review ? <p className="small" data-review={s.k}>Your pause on {s.label.toLowerCase()} has ended. Choose whether to take new requests again or pause again.</p> : null}
                <div className="row wrap" style={{ gap: 8, alignItems: "end" }}>
                  <label className="field" style={{ maxWidth: 190 }}>Pause until (optional)
                    <input type="date" name={`${s.k}_until`} defaultValue={until || ""} />
                  </label>
                  {open && !paused ? <button type="submit" name={`${s.k}_action`} value="pause" className="btn secondary small-btn">Pause new {s.label.toLowerCase()}</button> : null}
                  {open && paused ? <button type="submit" name={`${s.k}_action`} value="resume" className="btn small-btn">Resume {s.label.toLowerCase()}</button> : null}
                  {open ? <button type="submit" name={`${s.k}_action`} value="close" className="btn secondary small-btn">Stop taking {s.label.toLowerCase()}</button> : <button type="submit" name={`${s.k}_action`} value="open" className="btn small-btn">Take {s.label.toLowerCase()} again</button>}
                </div>
              </div>
            );
          })}
        </form>
      </details>

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
