import type { ReactNode } from "react";
import { Glyph } from "../icons";
import { SearchableSelect } from "./searchable-select";
import type { Match } from "@/lib/match-engine";
import type { NeedOptions } from "@/lib/need-options";
import { professionFor, professionLabel, clinicianName, roleLabel } from "@/lib/profession";

// Presentational building blocks for the rebuilt member screens, all in
// the premium concept's vocabulary (.pa design system). No data fetching
// here, so each screen can also be rendered from fixtures in /dev/preview.

// The one rule about patient details, worded the same everywhere.
export const HANDOFF_RULE =
  "Don't enter details that identify a client on PsyAlliance. Once a colleague accepts, you arrange the handoff between you through your own secure channel.";

export function initialsOf(name: string) {
  return (
    name
      .replace(/^(dr\.?|mr\.?|ms\.?|mrs\.?)\s+/i, "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

const AVATAR_TONES = ["", "gold", "blue", "lilac"];
export function PersonAvatar({ name, url, size }: { name: string; url?: string | null; size?: number }) {
  const tone = AVATAR_TONES[name.length % AVATAR_TONES.length];
  const style = size ? { width: size, height: size, flexBasis: size, fontSize: Math.round(size * 0.38) } : undefined;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="avatar" style={{ ...style, objectFit: "cover" }} />;
  }
  return (
    <span className={`avatar ${tone}`} style={style} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

export function PageHead({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {/* A plain title says it already; the eyebrow only adds context. */}
        {!(typeof title === "string" && title.toLowerCase() === eyebrow.toLowerCase()) && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}

export function Banner({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <div className="banner error" role="alert">{error}</div>;
  if (ok) return <div className="banner ok" role="status">{ok}</div>;
  return null;
}

// One progression: the steps as a continuous bar with labels on wide
// screens, and "Step 3 of 5 · Candidates" on a phone. Completed steps can
// link back when the flow allows revisiting them.
export function Progress({ steps, current, hrefs }: { steps: string[]; current: number; hrefs?: (string | null)[] }) {
  return (
    <nav className="progress" aria-label="Steps">
      <div className="progress-compact" aria-hidden="true">
        <b>Step {current + 1} of {steps.length}</b> &middot; {steps[current]}
        <span className="progress-bar"><span style={{ width: `${((current + 1) / steps.length) * 100}%` }} /></span>
      </div>
      <ol className="progress-steps">
        {steps.map((s, i) => {
          const cls = `progress-step${i === current ? " active" : i < current ? " done" : ""}`;
          const href = hrefs?.[i];
          return (
            <li key={s} className={cls} aria-current={i === current ? "step" : undefined}>
              {href && i !== current ? <a href={href}>{i + 1}. {s}</a> : <span>{i + 1}. {s}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Empty({ symbol = "◎", title, body, action }: { symbol?: string; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="symbol" aria-hidden="true"><Glyph symbol={symbol} size={30} /></div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Status({ tone = "", children }: { tone?: "" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  return <span className={`status ${tone}`}>{children}</span>;
}

const TIER_LABEL: Record<Match["tier"], string> = {
  trusted: "Trusted colleague",
  worked_with: "Worked with before",
  saved: "Saved",
  none: "Verified network",
};

// The relationship is already shown as the pill, so it isn't repeated
// in the reasons list.
const TIER_REASON: Record<Match["tier"], string> = {
  trusted: "Trusted colleague",
  worked_with: "Worked together before",
  saved: "Saved clinician",
  none: "",
};

export function displayName(m: { fullName: string; credentialPrefix?: string | null; qualification?: string | null }) {
  return clinicianName(m.fullName, m.qualification, m.credentialPrefix);
}

// One ranked colleague with the reasons they're suggested.
export function MatchCard({
  m,
  avatarUrl,
  select,
  actions,
  rank,
}: {
  m: Match;
  avatarUrl?: string | null;
  select?: { name: string; checked?: boolean };
  actions?: ReactNode;
  rank?: number;
}) {
  const where = [m.city, m.state].filter(Boolean).join(", ");
  const body = (
    <>
      <PersonAvatar name={m.fullName} url={avatarUrl} />
      <div className="content">
        <div className="row between">
          <h3>
            {rank ? <span className="rank">{rank}</span> : null}
            <a href={`/dashboard/people/${m.profileId}`}>{displayName(m)}</a>
          </h3>
          <Status tone={m.tier === "none" ? "neutral" : ""}>{TIER_LABEL[m.tier]}</Status>
        </div>
        <p>
          {roleLabel(m.qualification)}
          {where ? ` · ${where}` : ""}
        </p>
        <ul className="reasons" aria-label="Why they're suggested">
          {m.reasons.filter((r) => r !== TIER_REASON[m.tier]).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </>
  );
  if (select) {
    return (
      <label className="mini-person selectable">
        <input type="checkbox" name={select.name} value={m.profileId} defaultChecked={select.checked} aria-label={`Select ${m.fullName}`} />
        {body}
      </label>
    );
  }
  return <div className="mini-person">{body}</div>;
}

type NeedValues = {
  focusIds?: number[];
  state?: string | null;
  city?: string | null;
  insurance?: string | null;
  ageBand?: string | null;
  setting?: string | null;
  languageId?: number | null;
  prescribing?: boolean;
};

// The shared "describe the need" fields. Field names match parseNeed().
export function NeedFields({
  options,
  values = {},
  compact,
  showPrescribing,
}: {
  options: NeedOptions;
  values?: NeedValues;
  compact?: boolean;
  showPrescribing?: boolean;
}) {
  const f = values.focusIds || [];
  const focusOptions = options.focus.map((o) => ({ value: String(o.id), label: o.value }));
  const mainFocus = (
    <SearchableSelect
      name="focus"
      label="Main need"
      options={focusOptions}
      defaultValue={f[0] ? String(f[0]) : ""}
      required
      emptyLabel="Choose a treatment focus"
      searchPlaceholder="Search, e.g. OCD, trauma, eating"
    />
  );
  const stateSelect = (
    <label className="field">
      State the client is in
      <select name="state" defaultValue={values.state || options.homeState || ""} required>
        <option value="">Choose a state</option>
        {options.states.map((s) => (
          <option key={s.code} value={s.code}>{s.name}</option>
        ))}
      </select>
    </label>
  );
  const settingSelect = (
    <label className="field">
      Setting
      <select name="setting" defaultValue={values.setting || "either"}>
        <option value="either">Virtual or in person</option>
        <option value="virtual">Virtual only</option>
        <option value="in_person">In person only</option>
      </select>
    </label>
  );
  const insuranceSelect = (
    <label className="field">
      Insurance
      <select name="insurance" defaultValue={values.insurance || ""}>
        <option value="">Any or not sure</option>
        {options.insurance.map((o) => (
          <option key={o.id} value={o.value}>{o.value}</option>
        ))}
      </select>
    </label>
  );
  if (compact) {
    return (
      <div className="fields four">
        {mainFocus}
        {stateSelect}
        {insuranceSelect}
        {settingSelect}
      </div>
    );
  }
  const refined = !!(f[1] || values.city || values.ageBand || values.languageId || values.prescribing);
  return (
    <div className="need-fields">
      <div className="fields">
        {mainFocus}
        {stateSelect}
        {settingSelect}
        {insuranceSelect}
      </div>
      <details className="refine-fit" open={refined}>
        <summary>
          <span>Refine fit</span>
          <small>Second focus, city, age band, language{showPrescribing ? ", prescribing" : ""}. Optional.</small>
        </summary>
        <div className="fields">
          <label className="field">
            Also (optional)
            <select name="focus" defaultValue={f[1] ? String(f[1]) : ""}>
              <option value="">None</option>
              {options.focus.map((o) => (
                <option key={o.id} value={o.id}>{o.value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            City (optional)
            <input name="city" defaultValue={values.city || ""} placeholder="e.g. Brooklyn" autoComplete="off" />
          </label>
          <label className="field">
            Age band
            <select name="age" defaultValue={values.ageBand || ""}>
              <option value="">Any</option>
              {options.ageBands.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Language
            <select name="language" defaultValue={values.languageId ? String(values.languageId) : ""}>
              <option value="">Any</option>
              {options.language.map((o) => (
                <option key={o.id} value={o.id}>{o.value}</option>
              ))}
            </select>
          </label>
          {showPrescribing && (
            <label className="checkline full">
              <input type="checkbox" name="prescribing" value="1" defaultChecked={values.prescribing} />
              Prescribing needed (suggests psychiatrists only)
            </label>
          )}
        </div>
      </details>
    </div>
  );
}

export function SummaryList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <ul className="summary-list">
      {rows.map(([k, v]) => (
        <li key={k}>
          <span>{k}</span>
          <strong>{v}</strong>
        </li>
      ))}
    </ul>
  );
}

// A short, purposeful empty state for lists that sit beside other content
// (the large Empty is for pages that are empty as a whole).
export function QuietEmpty({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="quiet-panel">
      <strong className="small">{title}</strong>
      <p className="small" style={{ margin: "5px 0 0" }}>{body}</p>
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

// Shown once, right after a trusted-circle invitation is accepted: what
// changed, and the obvious next things to do together.
export function ConnectedNote({ name, profileId }: { name: string; profileId?: string }) {
  const first = name.replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0] || name;
  return (
    <section className="connected-note" role="status">
      <span className="connected-seal" aria-hidden="true">&#10003;</span>
      <div>
        <div className="eyebrow">Trusted circle</div>
        <h3>You and {first} are now trusted colleagues.</h3>
        <p>
          You&rsquo;ll each come first in the other&rsquo;s matches for referrals, cover and questions. We&rsquo;ve let {first} know.
        </p>
        <div className="connected-actions">
          {profileId && <a className="btn small-btn" href={`/dashboard/messages?to=${profileId}`}>Say hello</a>}
          <a className="btn secondary small-btn" href="/dashboard/network?tab=trusted">See your circle</a>
        </div>
      </div>
    </section>
  );
}
