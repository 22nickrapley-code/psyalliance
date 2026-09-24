import { confirmAvailability, reconfirmAvailability } from "./actions";
import { PageHead, Banner, Status, SummaryList } from "../_components/ui";
// Availability (Product Spec v1): three separate signals, each with its
// own status, plus approximate spaces, a pause-until date and the date
// last confirmed, which colleagues see. A never-confirmed status is never
// shown or treated as Yes: nothing is pre-selected until the member
// chooses (Sept 23 audit fix).

const REFERRAL = [
  { v: "yes", label: "Accepting" },
  { v: "limited", label: "Selected referrals only" },
  { v: "no", label: "Not accepting" },
];
const COVER = [
  { v: "yes", label: "Available" },
  { v: "ask_me", label: "Limited capacity, ask me" },
  { v: "no", label: "Not available" },
];
const CONSULT = [
  { v: "yes", label: "Open to consult" },
  { v: "no", label: "Not now" },
];

function labelFor(list: { v: string; label: string }[], v: string | null | undefined) {
  if (!v) return "Not set";
  if (list === CONSULT && v === "limited") return "Open to consult";
  return list.find((o) => o.v === v)?.label || "Not set";
}

function Signal({
  name,
  title,
  help,
  options,
  value,
  preselect,
}: {
  name: string;
  title: string;
  help: string;
  options: { v: string; label: string }[];
  value: string | null | undefined;
  preselect: boolean;
}) {
  const current = name === "consultation_availability" && value === "limited" ? "yes" : value;
  return (
    <fieldset className="signal" style={{ border: 0, margin: 0, paddingLeft: 0, paddingRight: 0 }}>
      <legend className="sr-only">{title}</legend>
      <h3>{title}</h3>
      <p className="small">{help}</p>
      <div className="seg">
        {options.map((o) => (
          <label key={o.v}>
            <input type="radio" name={name} value={o.v} required defaultChecked={preselect && current === o.v} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type AvailabilityData = {
  referral_availability: string | null;
  coverage_availability: string | null;
  consultation_availability: string | null;
  availability_confirmed_at: string | null;
  approx_spaces: number | null;
  availability_paused_until: string | null;
} | null;

export function AvailabilityView({ p, sp }: { p: AvailabilityData; sp: { confirmed?: string; reconfirmed?: string; error?: string } }) {
  const confirmedAt = p?.availability_confirmed_at ? new Date(p.availability_confirmed_at) : null;
  const age = confirmedAt ? Math.floor((Date.now() - confirmedAt.getTime()) / 86_400_000) : null;
  const stale = age === null || age > 30;
  const allSet = !!(p?.referral_availability && p?.coverage_availability && p?.consultation_availability);
  const preselect = !!confirmedAt;
  const today = new Date().toISOString().slice(0, 10);
  const paused = p?.availability_paused_until && p.availability_paused_until >= today ? p.availability_paused_until : null;
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <>
      <PageHead
        eyebrow="Your availability"
        title="Keep your signals current."
        lead="Colleagues see these when deciding whether to refer to you, ask you for cover or invite you to consult. Each one is separate: pausing one doesn't close the others."
        actions={
          allSet && preselect ? (
            <form action={reconfirmAvailability}>
              <input type="hidden" name="return_to" value="/dashboard/availability" />
              <button type="submit" className="btn">Nothing&rsquo;s changed, reconfirm</button>
            </form>
          ) : undefined
        }
      />
      <Banner error={sp.error} ok={sp.confirmed ? "Availability saved and confirmed." : sp.reconfirmed ? "Reconfirmed. Colleagues will see today's date." : null} />
      <div className="split">
        <form action={confirmAvailability} className="card">
          <div className="eyebrow">What colleagues see</div>
          <h2 style={{ marginTop: 8 }}>Choose your capacity.</h2>
          {!preselect && (
            <div className="tone-panel" style={{ margin: "12px 0 6px" }}>
              Never confirmed. Nothing is pre-selected: choose a status for each, then save.
            </div>
          )}
          <Signal
            name="referral_availability"
            title="Referrals"
            help="New patients referred to you by colleagues."
            options={REFERRAL}
            value={p?.referral_availability}
            preselect={preselect}
          />
          <Signal
            name="coverage_availability"
            title="Cover"
            help="Seeing a colleague's patients while they're away, for days or months."
            options={COVER}
            value={p?.coverage_availability}
            preselect={preselect}
          />
          <Signal
            name="consultation_availability"
            title="Consult"
            help="Answering colleagues' case questions and joining consultations."
            options={CONSULT}
            value={p?.consultation_availability}
            preselect={preselect}
          />
          <div className="signal">
            <div className="fields">
              <label className="field">
                Approximate spaces for new patients
                <input type="number" name="approx_spaces" min={0} max={99} defaultValue={p?.approx_spaces ?? ""} placeholder="Optional" />
                <small>A rough number helps colleagues pick. Leave blank if you&rsquo;d rather not say.</small>
              </label>
              <label className="field">
                Pause referrals and cover until
                <input type="date" name="paused_until" min={today} defaultValue={paused || ""} />
                <small>For a holiday or a full stretch. You drop out of suggestions until this date, then return automatically.</small>
              </label>
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="submit" className="btn">Save and confirm</button>
            <span className="micro-note">Saving also confirms your availability as of today.</span>
          </div>
        </form>

        <aside className="stack">
          <section className="card tint">
            <div className="card-title">
              <div className="eyebrow">Last confirmed</div>
              {stale ? <Status tone="warn">{confirmedAt ? "Needs a check" : "Not confirmed"}</Status> : <Status>Current</Status>}
            </div>
            <h3>{confirmedAt ? fmt(confirmedAt) : "Never"}</h3>
            <p className="small" style={{ marginBottom: 0 }}>
              {confirmedAt
                ? age === 0
                  ? "Confirmed today."
                  : `${age} day${age === 1 ? "" : "s"} ago. ${age! > 90 ? "You're out of referral and cover suggestions until you reconfirm." : age! > 30 ? "Colleagues see this as not recently confirmed, and you rank lower in suggestions." : "Reconfirm monthly to stay at the top of suggestions."}`
                : "You won't appear in referral or cover suggestions until you confirm."}
            </p>
          </section>
          <section className="card">
            <div className="eyebrow">At a glance</div>
            <SummaryList
              rows={[
                ["Referrals", paused ? "Paused" : labelFor(REFERRAL, p?.referral_availability)],
                ["Cover", paused ? "Paused" : labelFor(COVER, p?.coverage_availability)],
                ["Consult", labelFor(CONSULT, p?.consultation_availability)],
                ["Spaces", typeof p?.approx_spaces === "number" ? String(p.approx_spaces) : "Not shared"],
                ...(paused ? ([["Paused until", fmt(new Date(paused + "T12:00:00"))]] as [string, string][]) : []),
              ]}
            />
          </section>
          <section className="card">
            <div className="eyebrow">How it&rsquo;s used</div>
            <p className="small" style={{ marginBottom: 0 }}>
              Confirmed in the last 30 days ranks normally. 30 to 90 days shows as not recently confirmed. Over 90 days drops out of referral and cover suggestions until you reconfirm.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
