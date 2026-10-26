import { shortDate } from "@/lib/dates";
import { libraryHref } from "@/lib/library";
import type { ReactNode } from "react";
import { SearchableSelect } from "../_components/searchable-select";
import type { Match } from "@/lib/match-engine";
import type { NeedOptions } from "@/lib/need-options";
import { FirstVisit } from "../_components/first-visit";
import { TOUR_URL } from "@/lib/env";
import { QuietEmpty, PageHead, Banner, Progress, Empty, Status, MatchCard, SummaryList, PersonAvatar, HANDOFF_RULE, ListPanel, HistoryList, type HistoryTone } from "../_components/ui";
import { incomingState, type IncomingRequest } from "./incoming-data";
import { NavIcon } from "../icons";
import {
  createPlanAction,
  addCaseAction,
  removeCaseAction,
  sendInvitesAction,
  askColleagueAction,
  completePlanAction,
  cancelPlanAction,
} from "./actions";
import { rateCollaborationAction } from "../refer/actions";
import { startConversation } from "../messages/actions";
import { InlineThread } from "../_components/inline-thread";
import type { ThreadMessage } from "@/lib/threads";
import { coverThreadTitle, stateName } from "./labels";
import { IncomingCase, type CaseStatus } from "./incoming-case";

const STEPS = ["Plan", "Needs", "Candidates", "Invite", "Track"];

export const ABSENCE: Record<string, { label: string; blurb: string }> = {
  short_planned: { label: "Short planned absence", blurb: "A holiday or conference. One backup colleague is often enough." },
  extended_leave: { label: "Extended leave", blurb: "Maternity, illness or sabbatical. A staged handoff per client." },
  unexpected: { label: "Unexpected absence", blurb: "Illness or emergency. Trusted colleagues are asked first." },
  closing_practice: { label: "Closing or reducing practice", blurb: "Retirement or relocation. Each client is placed with a colleague permanently." },
  reciprocal: { label: "Reciprocal arrangement", blurb: "A standing cover agreement with a colleague." },
};

export type CaseItem = {
  id: number;
  reference: string;
  focus: string;
  details: string[];
  status: "needs_cover" | "awaiting_response" | "confirmed" | "declined_all";
  invited: { name: string; status: string; profileId?: string; requestId?: number }[];
  assignedName: string | null;
  assignedId: string | null;
  queueCount: number;
  // The state this client is in (their own, or the plan's).
  state?: string | null;
  // Questions colleagues have asked about this client, shown in place.
  conversations?: CaseConversation[];
};

export type CaseConversation = { profileId: string; name: string; requestId: number; conversationId: number | null; messages: ThreadMessage[] };

export type PlanSummary = {
  id: number;
  title: string;
  absenceType: string | null;
  starts: string | null;
  ends: string | null;
  state: string | null;
  // Every state the plan's clients are in.
  states?: string[];
  status: string;
  counts: { total: number; covered: number; invited: number; open: number; declined?: number };
  createdAt?: string;
};

// One vocabulary for cover, used on every screen: asked, awaiting reply,
// interested (never shown as cover), accepted, covered, closed.
const CASE_STATUS: Record<CaseItem["status"], { label: string; tone: "" | "warn" | "danger" | "neutral" }> = {
  needs_cover: { label: "Not asked yet", tone: "warn" },
  awaiting_response: { label: "Asked, awaiting reply", tone: "warn" },
  confirmed: { label: "Covered", tone: "" },
  declined_all: { label: "No one left to ask", tone: "danger" },
};

const INVITE_STATUS: Record<string, { label: string; tone: "" | "warn" | "neutral" }> = {
  sent: { label: "asked, awaiting reply", tone: "warn" },
  discussing: { label: "has a question", tone: "warn" },
  accepted: { label: "accepted", tone: "" },
  declined: { label: "declined", tone: "neutral" },
  expired: { label: "closed", tone: "neutral" },
  cancelled: { label: "closed", tone: "neutral" },
};

function fmt(d: string | null) {
  return d ? shortDate(d) : "Not set";
}

function PLAN_RESOURCE(type: string | null) {
  if (type === "reciprocal" || type === "short_planned")
    return { code: "PA-01", title: "Reciprocal Coverage Agreement", purpose: "Agree roles and response times with the colleague covering, with a per-client summary." };
  if (type === "closing_practice")
    return { code: "PA-03", title: "Professional Will & Succession Plan", purpose: "Plan records custody, client notice and the handoff of your practice." };
  return { code: "PA-02", title: "Extended Leave & Handoff Pack", purpose: "Keep continuity while you're away: client letters, who does what, and a plan for your return." };
}

function PlanAside({ plan, extra }: { plan: PlanSummary; extra?: ReactNode }) {
  return (
    <aside className="stack">
      <section className="card tint">
        <div className="eyebrow">Plan at a glance</div>
        <h3>{plan.title}</h3>
        <SummaryList
          rows={[
            ["Type", ABSENCE[plan.absenceType || ""]?.label || "Cover"],
            ["Dates", `${fmt(plan.starts)} – ${fmt(plan.ends)}`],
            [plan.states && plan.states.length > 1 ? "States" : "State", (plan.states?.length ? plan.states : plan.state ? [plan.state] : []).map((c) => stateName(c)).join(", ") || "Not set"],
            ["Clients", plan.counts.total],
            ["Asked, awaiting reply", plan.counts.invited],
            ["Covered", plan.counts.covered],
            ["No one asked yet", plan.counts.open],
          ]}
        />
      </section>
      <section className="card">
        <div className="eyebrow">From the Practice Library</div>
        <h3>{PLAN_RESOURCE(plan.absenceType).title}</h3>
        <p className="small">{PLAN_RESOURCE(plan.absenceType).purpose}</p>
        <a className="btn secondary small-btn" href={libraryHref(PLAN_RESOURCE(plan.absenceType).code)}>
          View the template
        </a>
      </section>
      {extra}
    </aside>
  );
}

function PlanHead({ plan, step, lead }: { plan: PlanSummary; step: number; lead: string }) {
  return (
    <>
      <PageHead
        eyebrow="Cover / plan"
        title={plan.title}
        lead={lead}
        actions={<a className="btn secondary" href="/dashboard/cover">All plans</a>}
      />
      <Progress
        steps={STEPS}
        current={step}
        hrefs={[null, `/dashboard/cover/${plan.id}?step=needs`, `/dashboard/cover/${plan.id}?step=candidates`, `/dashboard/cover/${plan.id}?step=invite`, `/dashboard/cover/${plan.id}?step=track`]}
      />
    </>
  );
}

// ---------- Index (the Cover home) ----------
// Kept for the demos' older fixtures; the home now takes IncomingRequest.
export type IncomingPlan = IncomingRequest;
export type CoveringItem = { planId: number; ownerId: string; ownerName: string; ownerAvatar?: string | null; dates: string; clients: string[] };

// Where one of your own plans stands: amber while it needs work or replies,
// green when every client is covered, red when someone has no one left to
// ask, grey once it's completed or cancelled.
export function planState(p: PlanSummary): { tone: HistoryTone; label: string; action: string } {
  if (p.status === "draft") return { tone: "amber", label: "Draft, not sent yet", action: "Continue" };
  if (p.status === "completed") return { tone: "grey", label: "Completed", action: "View" };
  if (p.status === "cancelled") return { tone: "grey", label: "Cancelled", action: "View" };
  if (p.counts.total > 0 && p.counts.covered === p.counts.total) return { tone: "green", label: "All covered", action: "Open" };
  if ((p.counts.declined || 0) > 0) return { tone: "red", label: `No one left to ask for ${p.counts.declined === 1 ? "1 client" : `${p.counts.declined} clients`}`, action: "Find someone" };
  if (p.counts.open > 0 && p.counts.invited === 0) return { tone: "amber", label: "Choose who to ask", action: "Continue" };
  return { tone: "amber", label: `${p.counts.covered} of ${p.counts.total} covered`, action: "Open" };
}

// The Cover home mirrors Refer (Nick, 18 Oct): a green box to plan cover,
// then cover requests sent to you and the plans you've set up, each a
// colour-coded history. Nothing opens a request by itself; each row opens
// its own page.
export function CoverIndexView({
  plans,
  incoming,
  ok,
  error,
  start,
}: {
  plans: PlanSummary[];
  incoming: IncomingRequest[];
  covering?: CoveringItem[];
  ok?: string;
  error?: string;
  // Values for the green box (the demos use this).
  start?: { absence?: string; starts?: string; ends?: string };
}) {
  const waiting = incoming.filter((r) => incomingState(r).label.includes("answer")).length;
  return (
    <>
      <FirstVisit id="cover" what="Cover" length="90-second" exampleHref={`${TOUR_URL}/cover`} />
      <PageHead
        eyebrow="Cover"
        title="Cover"
        lead="Plan time away, describe each client by need, then choose which colleagues are asked. Nothing is sent until you confirm. Colleagues' requests for cover are here too."
      />
      <Banner ok={ok} error={error} />
      {waiting > 0 && (
        <a className="cover-waiting" href={incoming.length ? `/dashboard/cover/requests/${incoming.find((r) => incomingState(r).label.includes("answer"))!.planId}` : "#requests"}>
          <span className="cover-waiting-dot" aria-hidden="true" />
          <b>{waiting === 1 ? "A colleague is waiting for your answer on a cover request." : `${waiting} colleagues are waiting for your answer on cover requests.`}</b>
          <span className="cover-waiting-go">Answer &rarr;</span>
        </a>
      )}
      <form className="quick-search cover-start" method="get" action="/dashboard/cover/new" id="plan-cover">
        <h3>Plan cover for time away</h3>
        <div className="cover-start-fields">
          <label className="field">
            Reason
            <select name="absence" defaultValue={start?.absence || "short_planned"}>
              {Object.entries(ABSENCE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            First day away
            <input type="date" name="starts" defaultValue={start?.starts} />
          </label>
          <label className="field">
            Back on
            <input type="date" name="ends" defaultValue={start?.ends} />
          </label>
        </div>
        <div className="row wrap" style={{ marginTop: 14, gap: 12 }}>
          <button type="submit" className="btn">Plan cover</button>
        </div>
        <p className="small" style={{ color: "#cfe0d4", margin: "10px 0 0" }}>Next you describe each client by need, with no identifying details. Nothing is sent until you review.</p>
      </form>
      <div className="split equal list-pair" style={{ marginTop: 20 }}>
        <ListPanel
          id="requests"
          icon={<NavIcon name="messages" size={19} />}
          tone="brass"
          title="Cover Requests Sent to You"
          description="Colleagues who asked you to cover their clients, and what you said."
          count={incoming.length}
          empty={<QuietEmpty title="No cover requests yet." body="When a colleague asks you to cover a client while they're away, it appears here." />}
        >
          {incoming.length > 0 && (
            <HistoryList
              items={incoming.map((r) => {
                const s = incomingState(r);
                const n = r.cases.length;
                return {
                  key: r.planId,
                  href: `/dashboard/cover/requests/${r.planId}`,
                  title: `${r.ownerName}, ${n === 1 ? "1 client" : `${n} clients`}`,
                  meta: [r.absence, r.dates, `Asked ${shortDate(r.sentAt)}`],
                  tone: s.tone,
                  label: s.label,
                  action: s.action,
                  date: r.sentAt,
                };
              })}
            />
          )}
        </ListPanel>
        <ListPanel
          icon={<NavIcon name="cover" size={19} />}
          title="Cover Plans You’ve Set Up"
          description="Your own time away, and who's covering your clients."
          count={plans.length}
          empty={<QuietEmpty title="No cover planned." body="Going away, closing a practice, or just want a backup? Start above: a plan tracks every client from need to a confirmed colleague." />}
        >
          {plans.length > 0 && (
            <HistoryList
              items={plans.map((p) => {
                const s = planState(p);
                return {
                  key: p.id,
                  href: `/dashboard/cover/${p.id}?step=${p.status === "draft" ? "needs" : "track"}`,
                  title: p.title,
                  meta: [ABSENCE[p.absenceType || ""]?.label || "Cover", `${fmt(p.starts)} to ${fmt(p.ends)}`, `${p.counts.total} client${p.counts.total === 1 ? "" : "s"}`],
                  tone: s.tone,
                  label: s.label,
                  action: s.action,
                  date: p.createdAt || p.starts || new Date().toISOString(),
                };
              })}
            />
          )}
        </ListPanel>
      </div>
    </>
  );
}

// ---------- A cover request sent to you ----------
// The same family as an incoming referral (the need first, then the
// details), with a band that says this is temporary (Nick, 18 Oct).
export function CoverRequestView({ r, error }: { r: IncomingRequest; error?: string }) {
  const first = r.ownerName.replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0];
  const n = r.cases.length;
  const permanent = r.absenceType === "closing_practice";
  return (
    <>
      <PageHead
        eyebrow={`Cover / from ${r.ownerName}`}
        title={n === 1 ? "Cover for one client" : `Cover for ${n} clients`}
        lead={`${r.location} · asked ${shortDate(r.sentAt)}`}
        actions={<a className="btn secondary" href="/dashboard/cover">All cover</a>}
      />
      <Banner error={error} />
      <div className={`cover-band${permanent ? " permanent" : ""}`} role="note">
        <span className="cover-band-icon" aria-hidden="true">
          <NavIcon name="cover" size={22} />
        </span>
        <span className="cover-band-copy">
          <b>{permanent ? "Long-term: moving clients on" : "Temporary cover"}</b>
          <span>
            {permanent
              ? `${first} is closing or reducing their practice. Each client you accept would move to you.`
              : `${r.dates}${r.length ? ` (${r.length})` : ""}. Clients go back to ${first} afterwards.`}
          </span>
        </span>
        {r.urgent && <span className="hist-chip tone-red">Urgent</span>}
      </div>
      <div className="split">
        <div className="stack">
          {r.cases.map((c) => (
            <IncomingCase
              key={c.requestId}
              requestId={c.requestId}
              label={c.reference}
              focus={c.focus}
              details={c.details}
              ownerId={r.ownerId}
              ownerName={r.ownerName}
              threadTitle={c.threadTitle}
              initialStatus={(c.status as CaseStatus) || "sent"}
              thread={c.thread}
              link={`/dashboard/cover/${r.planId}?step=track#case-${c.caseId}`}
              returnTo={`/dashboard/cover/requests/${r.planId}`}
            />
          ))}
          <p className="micro-note">{HANDOFF_RULE}</p>
        </div>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">About the absence</div>
            <div className="row" style={{ gap: 12, margin: "6px 0 12px" }}>
              <PersonAvatar name={r.ownerName} url={r.ownerAvatar} size={44} id={r.ownerId} />
              <span>
                <a href={`/dashboard/people/${r.ownerId}`}><b>{r.ownerName}</b></a>
                <small className="micro-note" style={{ display: "block" }}>{r.ownerRole}</small>
              </span>
            </div>
            <SummaryList
              rows={[
                ["Reason", r.absence],
                ["Dates", r.dates],
                ["Clients", n],
                ["How colleagues are asked", r.outreach],
              ]}
            />
            {r.note && <blockquote className="request-note">&ldquo;{r.note}&rdquo;</blockquote>}
          </section>
          <section className="card">
            <div className="eyebrow">From the Practice Library</div>
            <h3>Reciprocal Coverage Agreement</h3>
            <p className="small">Agree roles and response times with the colleague you cover for, with a per-client summary.</p>
            <a className="btn secondary small-btn" href={libraryHref("PA-01")}>View the template</a>
          </section>
        </aside>
      </div>
    </>
  );
}

// ---------- Step 1: Plan ----------
export function CoverPlanStepView({
  options,
  error,
  preset,
  fix,
  withColleague,
}: {
  options: NeedOptions;
  error?: string;
  preset?: { absenceType: string; title: string; starts: string; ends: string; state?: string };
  fix?: string;
  // From "Ask for cover" on a colleague's profile: asked first for each client.
  withColleague?: { id: string; name: string } | null;
}) {
  const withFirst = withColleague ? withColleague.name.replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0] : "";
  return (
    <>
      <PageHead eyebrow="Cover / new plan" title="Start with the time away." lead="Choose the kind of cover and the dates. Describe each client&rsquo;s needs next, without identifiers." actions={<a className="btn secondary" href="/dashboard/cover">Cancel</a>} />
      <Progress steps={STEPS} current={0} />
      <Banner error={error} />
      <form className="split cover-plan-form" action={createPlanAction} data-deidentify="">
        <section className="card">
          {withColleague && (
            <>
              <input type="hidden" name="with" value={withColleague.id} />
              <div className="ask-first-note">
                <b>{withColleague.name} will be asked first.</b> Once you&rsquo;ve described each client, {withFirst} is at the top of that client&rsquo;s colleagues, already ticked. You can change it.
              </div>
            </>
          )}
          <div className="eyebrow">Step 1 &middot; Plan</div>
          <h2>What kind of cover do you need?</h2>
          <div className="choose-grid">
            {Object.entries(ABSENCE).map(([k, v]) => (
              <label key={k} className="radio-card">
                <input type="radio" name="absence_type" value={k} required defaultChecked={preset?.absenceType === k} aria-label={`${v.label}: ${v.blurb}`} />
                <b>{v.label}</b>
                <span>{v.blurb}</span>
              </label>
            ))}
          </div>
          <div className="fields">
            <label className="field full">
              Plan name
              <input name="title" required maxLength={80} placeholder="e.g. October leave" defaultValue={preset?.title} autoFocus={fix === "title"} className={fix === "title" ? "field-invalid" : undefined} />
              <small>For your own reference. Never a client name.</small>
            </label>
            <label className="field">
              <span className="when-start">First day</span>
              <span className="when-close">Last day of practice</span>
              <input type="date" name="starts_on" defaultValue={preset?.starts} />
            </label>
            <label className="field return-date">Return date<input type="date" name="ends_on" defaultValue={preset?.ends} autoFocus={fix === "ends"} className={fix === "ends" ? "field-invalid" : undefined} /></label>
            <label className="field full">
              State your clients are in
              <select name="state" required defaultValue={preset?.state || options.homeState || ""} autoFocus={fix === "state"}>
                <option value="">Choose a state</option>
                {options.states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
              <small>Clients in more than one state? Choose the main one; you can set a different state for any client next.</small>
            </label>
          </div>
          <div className="tone-panel" style={{ marginTop: 16 }}>
            <b>Private by design.</b> Leave out client names, dates of birth and clinical details. Coordinate protected information through an appropriate clinical channel.
          </div>
          <div className="step-actions">
            <a className="btn ghost" href="/dashboard/cover">Cancel</a>
            <button type="submit" className="btn">Define the needs &rarr;</button>
          </div>
        </section>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">What happens next</div>
            <h3>Needs, then colleagues.</h3>
            <p className="small">Add each client who needs cover. PsyAlliance suggests colleagues for each client; you review and choose who&rsquo;s asked before anything is sent.</p>
          </section>
        </aside>
      </form>
    </>
  );
}

// ---------- Step 2: Needs ----------
export function CoverNeedsView({ plan, cases, options, error, addedId }: { plan: PlanSummary; cases: CaseItem[]; options: NeedOptions; error?: string; addedId?: number | null }) {
  // A new client starts in the state of the last one added, or the plan's.
  const nextState = cases[cases.length - 1]?.state || plan.state || "";
  return (
    <>
      <PlanHead plan={plan} step={1} lead="Describe each client who needs cover, by need. No names, initials or dates." />
      <Banner error={error} />
      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="card-title"><h3>Clients needing cover ({cases.length})</h3></div>
            {cases.length === 0 && <p className="small">Add the first client below. One is fine.</p>}
            {cases.map((c) => (
              <div key={c.id} className={`pa-case${c.id === addedId ? " just-added" : ""}`} data-just-added={c.id === addedId ? "" : undefined}>
                <div className="row between">
                  <strong>
                    {c.reference} &middot; {c.focus} {c.id === addedId && <span className="added-tag">&#10003; Added</span>}
                  </strong>
                  {c.status === "needs_cover" ? (
                    <form action={removeCaseAction} className="inline">
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <input type="hidden" name="case_id" value={c.id} />
                      <button type="submit" className="plain-button small">Remove</button>
                    </form>
                  ) : (
                    <Status tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</Status>
                  )}
                </div>
                <div className="kv">{c.details.map((d) => <span key={d} className="chip">{d}</span>)}</div>
              </div>
            ))}
          </section>
          <form className="card new-case-form" action={addCaseAction} id="add-client" key={`add-${cases.length}`}>
            <input type="hidden" name="plan_id" value={plan.id} />
            <div className="eyebrow">{cases.length ? "Add another client" : "Add a client"}</div>
            <h3>Client {cases.length + 1}</h3>
            <div className="fields three">
              <SearchableSelect
                name="focus"
                label="Main need"
                options={options.focus.map((o) => ({ value: String(o.id), label: o.value }))}
                required
                emptyLabel="Choose a treatment focus"
                searchPlaceholder="Search, e.g. OCD, trauma, eating"
              />
              <label className="field">
                Also (optional)
                <select name="focus" defaultValue="">
                  <option value="">None</option>
                  {options.focus.map((o) => <option key={o.id} value={o.id}>{o.value}</option>)}
                </select>
              </label>
              <label className="field">
                State this client is in
                <select name="client_state" defaultValue={nextState}>
                  {options.states.map((st) => <option key={st.code} value={st.code}>{st.name}</option>)}
                </select>
              </label>
              <label className="field">
                Age band
                <select name="age" defaultValue="">
                  <option value="">Any</option>
                  {options.ageBands.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label className="field">
                Setting
                <select name="setting" defaultValue="either">
                  <option value="either">Virtual or in person</option>
                  <option value="virtual">Virtual</option>
                  <option value="in_person">In person</option>
                </select>
              </label>
              <label className="field">
                Insurance
                <select name="insurance" defaultValue="">
                  <option value="">Any or not sure</option>
                  {options.insurance.map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
                </select>
              </label>
              <label className="field">
                Session frequency
                <select name="frequency" defaultValue="Weekly">
                  <option>Weekly</option>
                  <option>Every two weeks</option>
                  <option>Monthly</option>
                  <option>As needed</option>
                </select>
              </label>
              <label className="checkline full">
                <input type="checkbox" name="prescribing" value="1" /> Prescribing or medication management needed
              </label>
            </div>
            <div className="step-actions">
              <span className="micro-note">Saved as &ldquo;Client {cases.length + 1}&rdquo;. No names, initials or dates.</span>
              <button type="submit" className="btn add-client-btn">+ Save and add client</button>
            </div>
          </form>
          <div className="step-actions" style={{ borderTop: 0, marginTop: 0 }}>
            <a className="btn ghost" href="/dashboard/cover">Save and exit</a>
            {cases.length > 0 ? (
              <a className="btn" href={`/dashboard/cover/${plan.id}?step=candidates`}>Find colleagues &rarr;</a>
            ) : (
              <span className="btn" aria-disabled="true" style={{ opacity: 0.5 }}>Find colleagues &rarr;</span>
            )}
          </div>
        </div>
        <PlanAside plan={plan} />
      </div>
    </>
  );
}

// ---------- Step 3: Candidates ----------
export function CoverCandidatesView({
  plan,
  cases,
  suggestions,
  avatarUrls,
  preselected,
  preferred,
  carry,
}: {
  plan: PlanSummary;
  cases: CaseItem[];
  suggestions: Record<number, Match[]>;
  avatarUrls: Record<string, string | null>;
  preselected?: Record<number, string[]>;
  // Coming back from the review step (R17-04): how to ask and the message
  // travel with the picks, so nothing chosen there is lost.
  carry?: { mode?: string; message?: string };
  // The colleague chosen from their profile: first for every client, with
  // anything that stops them fitting a client said plainly.
  preferred?: { id: string; perCase: Record<number, { canAsk: boolean; gaps: string[] }> } | null;
}) {
  const openCases = cases.filter((c) => c.status === "needs_cover" || c.status === "declined_all");
  return (
    <>
      <PlanHead plan={plan} step={2} lead="Review the facts on file, then tick who could be asked for each client, in order of preference." />
      <form method="get" action={`/dashboard/cover/${plan.id}`} className="split">
        <input type="hidden" name="step" value="invite" />
        <input type="hidden" name="plan_id" value={plan.id} />
        {carry?.mode && <input type="hidden" name="mode" value={carry.mode} />}
        {carry?.message && <input type="hidden" name="message" value={carry.message} />}
        <div className="stack">
          {openCases.length === 0 && (
            <Empty title="Every client already has someone asked or confirmed." body="Track replies on the Track step." action={<a className="btn secondary small-btn" href={`/dashboard/cover/${plan.id}?step=track`}>Track replies</a>} />
          )}
          {openCases.map((c) => {
            const list = suggestions[c.id] || [];
            return (
              <section key={c.id} className="card">
                <div className="card-title">
                  <div>
                    <div className="eyebrow">{c.reference}</div>
                    <h3>{c.focus}</h3>
                  </div>
                  <div className="kv">{c.details.slice(0, 3).map((d) => <span key={d} className="chip">{d}</span>)}</div>
                </div>
                {list.length === 0 ? (
                  <Empty title="No colleague matches this client yet." body="Nobody with an active license in this state, the right focus and current availability is left to ask. Try widening the case, or invite a colleague you trust to join." />
                ) : (
                  list.map((m, i) => {
                    const pin = preferred && m.profileId === preferred.id ? preferred.perCase[c.id] : undefined;
                    const pinBlocked = !!(preferred && preferred.perCase[c.id] && !preferred.perCase[c.id].canAsk);
                    // Ticked: the chosen colleague when they can be asked,
                    // otherwise the first suggestion.
                    const firstOther = list.find((x) => !preferred || x.profileId !== preferred.id)?.profileId;
                    const checked = preselected
                      ? (preselected[c.id] || []).includes(m.profileId)
                      : preferred && preferred.perCase[c.id]
                        ? pin
                          ? pin.canAsk
                          : pinBlocked && m.profileId === firstOther
                        : i === 0;
                    return (
                    <MatchCard
                      key={m.profileId}
                      m={m}
                      rank={i + 1}
                      avatarUrl={avatarUrls[m.profileId]}
                      flag={pin ? "Your choice" : undefined}
                      note={pin?.gaps}
                      select={{ name: `pick_${c.id}`, checked, disabled: pin ? !pin.canAsk : false }}
                      actions={
                        <button
                          type="submit"
                          formAction={`/dashboard/cover/${plan.id}/not-fit`}
                          formMethod="post"
                          name="not_fit"
                          value={`${c.id}:${m.profileId}`}
                          className="plain-button small not-fit-btn"
                          title="Not a fit for this client: remove them from these suggestions"
                        >
                          Remove from suggestions
                        </button>
                      }
                    />
                    );
                  })
                )}
              </section>
            );
          })}
          <div className="step-actions" style={{ borderTop: 0, marginTop: 0 }}>
            <a className="btn ghost" href={`/dashboard/cover/${plan.id}?step=needs`}>&larr; Needs</a>
            <button type="submit" className="btn">Review invitations &rarr;</button>
          </div>
        </div>
        <PlanAside plan={plan} />
      </form>
    </>
  );
}

// ---------- Step 4: Invite ----------
export function CoverInviteView({
  plan,
  rows,
  error,
  mode,
  reviewed,
  fix,
  canSend = true,
  message,
}: {
  canSend?: boolean;
  message?: string;
  plan: PlanSummary;
  rows: { caseId: number; reference: string; focus: string; picks: { id: string; name: string; why?: string[] }[] }[];
  error?: string;
  mode?: string;
  reviewed?: boolean;
  fix?: string;
}) {
  const parallel = mode ? mode === "parallel" : plan.absenceType === "unexpected";
  const total = rows.reduce((n, r) => n + r.picks.length, 0);
  return (
    <>
      <PlanHead plan={plan} step={3} lead="Know exactly who receives each request, and in what order, before anything is sent." />
      <Banner error={error} />
      <form className="split" action={sendInvitesAction} data-deidentify="">
        <input type="hidden" name="plan_id" value={plan.id} />
        <div className="stack">
          <section className="card">
            <div className="eyebrow">Step 4 &middot; Recipients</div>
            <h3>
              {total === 0
                ? "No one selected yet"
                : (() => {
                    const people = new Set(rows.flatMap((r) => r.picks.map((x) => x.id))).size;
                    const clients = rows.filter((r) => r.picks.length).length;
                    return `${total} request${total === 1 ? "" : "s"} to ${people} colleague${people === 1 ? "" : "s"}, for ${clients} client${clients === 1 ? "" : "s"}`;
                  })()}
            </h3>
            {rows.length === 0 && <p className="small">Go back to Candidates and tick at least one colleague for a client.</p>}
            {rows.map((r) => (
              <div key={r.caseId} className="pa-case">
                <strong>{r.reference} &middot; {r.focus}</strong>
                {r.picks.length === 0 ? (
                  <p className="small" style={{ margin: "6px 0 0" }}>Nobody selected. Nothing will be sent for this client yet.</p>
                ) : (
                  <ol className="invite-picks">
                    {r.picks.map((p, n) => (
                      <li key={p.id}>
                        <span className="pick-order">{n + 1}</span>
                        <div>
                          <b>{p.name}</b>
                          {n === 0 ? <small> &middot; asked first</small> : <small> &middot; asked if the colleague before declines</small>}
                          {p.why && p.why.length > 0 && (
                            <ul className="reasons" aria-label={`Why ${p.name} fits`}>
                              {p.why.map((w) => <li key={w}>{w}</li>)}
                            </ul>
                          )}
                        </div>
                        <input type="hidden" name={`pick_${r.caseId}`} value={p.id} />
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </section>
          <section className="card">
            <h3>How should they be asked?</h3>
            <label className="radio-card">
              <input type="radio" name="outreach_mode" value="sequential" defaultChecked={!parallel} />
              <span><b>One at a time, in order</b><span>If someone declines, the next colleague is asked automatically.</span></span>
            </label>
            <label className="radio-card">
              <input type="radio" name="outreach_mode" value="parallel" defaultChecked={parallel} />
              <span><b>Everyone at once</b><span>Fastest. The first to accept covers the client; let the others know it&rsquo;s covered.</span></span>
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              Short message (optional)
              <textarea
                name="message"
                maxLength={400}
                defaultValue={message}
                placeholder="e.g. Weekly sessions, mostly Tuesday evenings. Happy to talk it through."
                autoFocus={fix === "message"}
                aria-invalid={fix === "message" || undefined}
                className={fix === "message" ? "field-invalid" : undefined}
              />
              <small>{fix === "message" ? "Leave out names, initials, dates, phone numbers and addresses." : "No client-identifying details."}</small>
            </label>
            {!canSend && (
              <p className="next-step-note small" style={{ marginTop: 12 }}>
                Your plan is saved. Sending requests to colleagues opens once your license has been reviewed; you&rsquo;ll be able to send from here.
              </p>
            )}
            <label className="checkline" style={{ marginTop: 12 }}>
              <input type="checkbox" name="reviewed" required defaultChecked={reviewed} autoFocus={fix === "reviewed"} /> I&rsquo;ve reviewed who receives each request.
            </label>
            <div className="step-actions">
              {/* Back keeps who was picked, the order, how to ask and the message (R17-04). */}
              <button type="submit" className="btn ghost" formAction={`/dashboard/cover/${plan.id}`} formMethod="get" formNoValidate name="step" value="candidates">
                &larr; Candidates
              </button>
              <button type="submit" className="btn" disabled={total === 0 || !canSend}>Send cover requests</button>
            </div>
          </section>
        </div>
        <PlanAside plan={plan} />
      </form>
    </>
  );
}

// ---------- Step 5: Track ----------
export function CoverTrackView({
  plan,
  cases,
  nextSuggestion,
  toRate,
  ok,
  error,
}: {
  plan: PlanSummary;
  cases: CaseItem[];
  nextSuggestion: Record<number, { id: string; name: string } | null>;
  toRate: { id: string; name: string }[];
  ok?: string;
  error?: string;
}) {
  const done = plan.status === "completed" || plan.status === "cancelled";
  const exceptions = cases.filter((c) => c.status !== "confirmed");
  return (
    <>
      <PlanHead plan={plan} step={4} lead="A request is not a confirmed plan. Each client stays open until a colleague accepts." />
      <Banner ok={ok} error={error} />
      <div className="split">
        <div className="stack">
          {plan.counts.total === 0 && !done && (
            <section className="card tint">
              <div className="eyebrow">Next step</div>
              <h3>Add the clients who need cover.</h3>
              <p className="small">Describe each one by need. PsyAlliance then suggests colleagues for each.</p>
              <a className="btn" href={`/dashboard/cover/${plan.id}?step=needs`}>Add a client need</a>
            </section>
          )}
          <section className="card">
            <div className="card-title">
              <div>
                <div className="eyebrow">Status</div>
                <h3>{plan.counts.covered} of {plan.counts.total} covered</h3>
              </div>
              <span className="metric">{plan.counts.total ? Math.round((plan.counts.covered / plan.counts.total) * 100) : 0}%</span>
            </div>
            <p className="small">
              {plan.counts.covered} accepted &middot; {plan.counts.invited} asked, awaiting reply &middot; {plan.counts.open} with no one asked yet
            </p>
            {(exceptions.length ? exceptions : cases).map((c) => {
              const s = CASE_STATUS[c.status];
              const next = nextSuggestion[c.id];
              return (
                <div key={c.id} className="pa-case" id={`case-${c.id}`}>
                  <div className="row between">
                    <strong>{c.reference} &middot; {c.focus}</strong>
                    <Status tone={s.tone}>{s.label}</Status>
                  </div>
                  {c.invited.length > 0 && (
                    <div className="kv">
                      {c.invited.map((i) => (
                        <span key={i.name} className={`chip invite-${INVITE_STATUS[i.status] ? INVITE_STATUS[i.status].tone || "ok" : "neutral"}`}>{i.name}: {INVITE_STATUS[i.status]?.label || i.status}</span>
                      ))}
                    </div>
                  )}
                  {(c.conversations || []).map((t) => {
                    const first = t.name.replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0];
                    return (
                      <div key={t.profileId} className="case-question">
                        <InlineThread
                          messages={t.messages}
                          conversationId={t.conversationId}
                          otherName={t.name}
                          otherIds={[t.profileId]}
                          title={coverThreadTitle(plan.title, c.reference, c.focus)}
                          heading={`${first} has a question about ${c.reference || "this client"}`}
                          returnTo={`/dashboard/cover/${plan.id}?step=track`}
                          anchor={`case-${c.id}`}
                          link={`/dashboard/cover/requests/${plan.id}#request-${t.requestId}`}
                          placeholder={`Answer ${first}…`}
                        />
                        <p className="micro-note">{first} accepts or declines once you&rsquo;ve talked it through.</p>
                      </div>
                    );
                  })}
                  {c.status === "confirmed" && (() => {
                    // The thread is the one the colleague used for this
                    // client (same title), so any earlier question is there.
                    const label = c.reference ? c.reference.trim().replace(/^case\s*(\d+)$/i, "Client $1") : "the client";
                    const first = (c.assignedName || "").replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0] || "them";
                    return (
                      <div className="handoff-note">
                        <b>Accepted. Next, the handoff.</b>
                        <ul>
                          <li>Agree the start date and how urgent contacts reach them.</li>
                          <li>Share the coverage summary through your own secure channel, not PsyAlliance.</li>
                          <li>Tell the client who is covering and how to reach them.</li>
                        </ul>
                        {c.assignedId && (
                          <form action={startConversation} className="handoff-actions">
                            <input type="hidden" name="participant_ids" value={c.assignedId} />
                            <input type="hidden" name="title" value={coverThreadTitle(plan.title, label, c.focus)} />
                            <input type="hidden" name="body" value="" />
                            <input
                              type="hidden"
                              name="draft"
                              value={`Hi ${first}, thank you for covering ${label}. Could we agree the start date and how urgent contacts should reach you? I'll send the coverage summary through our secure channel.`}
                            />
                            <button type="submit" className="btn small-btn">Message {first} &rarr;</button>
                          </form>
                        )}
                      </div>
                    );
                  })()}
                  {c.status === "awaiting_response" && c.queueCount > 0 && (
                    <p className="micro-note" style={{ marginTop: 6 }}>{c.queueCount} more colleague{c.queueCount === 1 ? "" : "s"} queued if this is declined.</p>
                  )}
                  {!done && (c.status === "needs_cover" || c.status === "declined_all") && (
                    <div className="row wrap" style={{ marginTop: 10 }}>
                      {next ? (
                        <form action={askColleagueAction} className="inline">
                          <input type="hidden" name="plan_id" value={plan.id} />
                          <input type="hidden" name="case_id" value={c.id} />
                          <input type="hidden" name="candidate_id" value={next.id} />
                          <button type="submit" className="btn small-btn">Ask {next.name}</button>
                        </form>
                      ) : null}
                      <a className="btn secondary small-btn" href={`/dashboard/cover/${plan.id}?step=candidates`}>See all candidates</a>
                    </div>
                  )}
                </div>
              );
            })}
            {exceptions.length === 0 && cases.length > 0 && <p className="small" style={{ marginTop: 10 }}>Every client is covered.</p>}
          </section>

          {plan.status === "completed" && toRate.length > 0 && (
            <section className="card">
              <div className="eyebrow">Private</div>
              <h3>Would you work with them again?</h3>
              <p className="small">Only you see this. It helps rank future suggestions.</p>
              {toRate.map((p) => (
                <form key={p.id} action={rateCollaborationAction} className="list-row">
                  <input type="hidden" name="context_type" value="cover" />
                  <input type="hidden" name="context_id" value={plan.id} />
                  <input type="hidden" name="colleague_id" value={p.id} />
                  <input type="hidden" name="return_to" value={`/dashboard/cover/${plan.id}?step=track`} />
                  <span className="row"><PersonAvatar name={p.name} id={p.id} /><strong>{p.name}</strong></span>
                  <span className="row">
                    <button type="submit" name="would_work_again" value="yes" className="btn small-btn">Yes</button>
                    <button type="submit" name="would_work_again" value="no" className="btn secondary small-btn">Not again</button>
                  </span>
                </form>
              ))}
            </section>
          )}
        </div>
        <PlanAside
          plan={plan}
          extra={
            !done ? (
              <section className="card">
                <h3>{plan.counts.total === 0 ? "Not going ahead?" : "When you’re back"}</h3>
                <p className="small">
                  {plan.counts.total === 0
                    ? "Cancel the plan if you no longer need cover."
                    : "Complete the plan to hand clients back and record who covered for you."}
                </p>
                <div className="row wrap">
                  {plan.counts.total > 0 && (
                    <form action={completePlanAction} className="inline">
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <button type="submit" className="btn small-btn">Complete plan</button>
                    </form>
                  )}
                  <form action={cancelPlanAction} className="inline">
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <button type="submit" className="btn ghost small-btn">Cancel plan</button>
                  </form>
                </div>
              </section>
            ) : undefined
          }
        />
      </div>
    </>
  );
}
