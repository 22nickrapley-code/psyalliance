import { shortDate } from "@/lib/dates";
import { libraryHref } from "@/lib/library";
import type { ReactNode } from "react";
import { SearchableSelect } from "../_components/searchable-select";
import type { Match } from "@/lib/match-engine";
import type { NeedOptions } from "@/lib/need-options";
import { QuietEmpty, PageHead, Banner, Progress, Empty, Status, MatchCard, SummaryList, PersonAvatar, HANDOFF_RULE } from "../_components/ui";
import {
  createPlanAction,
  addCaseAction,
  removeCaseAction,
  sendInvitesAction,
  askColleagueAction,
  respondCoverAction,
  completePlanAction,
  cancelPlanAction,
} from "./actions";
import { rateCollaborationAction } from "../refer/actions";

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
  invited: { name: string; status: string }[];
  assignedName: string | null;
  assignedId: string | null;
  queueCount: number;
};

export type PlanSummary = {
  id: number;
  title: string;
  absenceType: string | null;
  starts: string | null;
  ends: string | null;
  state: string | null;
  status: string;
  counts: { total: number; covered: number; invited: number; open: number };
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
  discussing: { label: "interested, not yet accepted", tone: "warn" },
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
            ["Jurisdiction", plan.state || "Not set"],
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

// ---------- Index ----------
export type IncomingPlan = {
  planId: number;
  ownerId: string;
  ownerName: string;
  ownerRole: string;
  ownerAvatar: string | null;
  absence: string;
  planTitle: string;
  dates: string;
  length: string;
  location: string;
  outreach: string;
  note: string | null;
  urgent: boolean;
  sentAt: string | null;
  cases: { requestId: number; status?: string; reference: string | null; focus: string; details: [string, string][] }[];
};

function IncomingCard({ r }: { r: IncomingPlan }) {
  const n = r.cases.length;
  return (
    <section className={`card incoming-cover${r.urgent ? " urgent" : ""}`}>
      <div className="incoming-head">
        <PersonAvatar name={r.ownerName} url={r.ownerAvatar} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>
              <a href={`/dashboard/people/${r.ownerId}`}>{r.ownerName}</a> asked you to cover {n === 1 ? "one client" : `${n} clients`}
            </h3>
            <span className="row" style={{ gap: 6 }}>
              {r.urgent && <Status tone="danger">Urgent</Status>}
              {r.cases.every((c) => c.status === "discussing") ? (
                <Status tone="neutral">In discussion</Status>
              ) : (
                <Status tone="warn">Needs your reply</Status>
              )}
            </span>
          </div>
          <p className="small" style={{ margin: "3px 0 0" }}>{r.ownerRole}</p>
        </div>
      </div>
      <ul className="glance incoming-glance">
        <li><span>Clients</span><strong>{n}</strong></li>
        <li><span>Client location</span><strong>{r.location}</strong></li>
        <li><span>Absence</span><strong>{r.absence}</strong></li>
        <li><span>Dates</span><strong>{r.dates}{r.length ? ` · ${r.length}` : ""}</strong></li>
        <li><span>How colleagues are asked</span><strong>{r.outreach}</strong></li>
      </ul>
      {r.note && <blockquote className="request-note">&ldquo;{r.note}&rdquo;</blockquote>}
      <div className="incoming-cases">
        {r.cases.map((c, i) => {
          // Keep the owner's numbering, so "Client 2" stays Client 2 after Client 1 is answered.
          const label = c.reference ? c.reference.trim().replace(/^case\s*(\d+)$/i, "Client $1") : `Client ${i + 1}`;
          const ownerFirst = r.ownerName.replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0];
          const draft = `Hi ${ownerFirst}, I may be able to cover ${label} (${c.focus}) for ${r.dates}. Before I accept, could we talk through the schedule and how you'd like the handoff to work?`;
          return (
          <div key={c.requestId} className={`incoming-case${c.status === "discussing" ? " is-discussing" : ""}`}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <strong>
                {label} &middot; {c.focus}
              </strong>
              {c.status === "discussing" && <span className="status warn">You&rsquo;re discussing this one</span>}
            </div>
            <dl className="case-facts">
              {c.details.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            <form action={respondCoverAction} className="row wrap" style={{ marginTop: 12, gap: 8 }}>
              <input type="hidden" name="coverage_request_id" value={c.requestId} />
              <input type="hidden" name="owner_id" value={r.ownerId} />
              <input type="hidden" name="thread_title" value={`Cover · ${r.planTitle} · ${label} · ${c.focus}`} />
              <input type="hidden" name="draft" value={draft} />
              <button type="submit" name="response" value="accepted" className="btn small-btn resp-accept">Accept {label}</button>
              {c.status !== "discussing" && (
                <button type="submit" name="response" value="discussing" className="btn small-btn resp-discuss">Discuss first</button>
              )}
              <button type="submit" name="response" value="declined" className="btn small-btn resp-decline">Decline</button>
            </form>
          </div>
          );
        })}
      </div>
      <p className="micro-note" style={{ margin: "12px 0 0" }}>{HANDOFF_RULE}</p>
    </section>
  );
}

export type CoveringItem = { planId: number; ownerId: string; ownerName: string; dates: string; clients: string[] };

export function CoverIndexView({
  plans,
  incoming,
  covering = [],
  ok,
  error,
}: {
  plans: PlanSummary[];
  incoming: IncomingPlan[];
  covering?: CoveringItem[];
  ok?: string;
  error?: string;
}) {
  const active = plans.filter((p) => p.status === "draft" || p.status === "active");
  const past = plans.filter((p) => p.status === "completed" || p.status === "cancelled");
  return (
    <>
      <PageHead
        eyebrow="Cover"
        title="Cover"
        lead="Plan cover for one client or your whole caseload, and answer colleagues who need cover."
        actions={<a className="btn" href="/dashboard/cover/new">Plan cover</a>}
      />
      <Banner ok={ok} error={error} />
      {incoming.length > 0 && (
        <>
          <div className="section-heading" style={{ marginTop: 0 }}>
            <h2>Cover requests for you</h2>
            <Status tone="warn">{incoming.reduce((n, r) => n + r.cases.filter((c) => c.status !== "discussing").length, 0)} waiting</Status>
          </div>
          <div className="stack" style={{ marginBottom: 26 }}>
            {incoming.map((r) => <IncomingCard key={r.planId} r={r} />)}
          </div>
        </>
      )}
      {covering.length > 0 && (
        <section className="card covering-card" style={{ marginBottom: 26 }}>
          <div className="card-title">
            <h3>You&rsquo;re covering</h3>
            <span className="micro-note">What you&rsquo;ve agreed to, until each plan ends</span>
          </div>
          {covering.map((c) => (
            <div key={c.planId} className="list-row covering-row">
              <span>
                <strong>
                  For <a href={`/dashboard/people/${c.ownerId}`}>{c.ownerName}</a>
                </strong>
                <small>{c.dates} &middot; {c.clients.join(" · ")}</small>
              </span>
              <a className="btn secondary small-btn" href={`/dashboard/messages?to=${c.ownerId}`}>Message</a>
            </div>
          ))}
        </section>
      )}
      <div className="split">
        <section className="card">
          <div className="card-title"><h3>Your cover plans</h3></div>
          {active.length === 0 ? (
            <QuietEmpty
              title="No cover planned."
              body="Going away, closing a practice, or just want a backup? A plan tracks every client from need to a confirmed colleague."
              action={<a className="btn secondary small-btn" href="/dashboard/cover/new">Plan cover</a>}
            />
          ) : (
            active.map((p) => (
              <a key={p.id} href={`/dashboard/cover/${p.id}?step=${p.status === "draft" ? "needs" : "track"}`} className="list-row" style={{ textDecoration: "none", color: "inherit" }}>
                <span>
                  <strong>{p.title}</strong>
                  <small>{ABSENCE[p.absenceType || ""]?.label || "Cover"} &middot; {fmt(p.starts)} &ndash; {fmt(p.ends)}</small>
                </span>
                {p.status === "draft" ? (
                  <Status tone="neutral">Draft</Status>
                ) : (
                  <Status tone={p.counts.open > 0 ? "warn" : ""}>{p.counts.covered} of {p.counts.total} covered</Status>
                )}
              </a>
            ))
          )}
          {past.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary className="small">Past plans ({past.length})</summary>
              {past.map((p) => (
                <a key={p.id} href={`/dashboard/cover/${p.id}?step=track`} className="list-row" style={{ textDecoration: "none", color: "inherit" }}>
                  <span><strong>{p.title}</strong><small>{fmt(p.starts)} &ndash; {fmt(p.ends)}</small></span>
                  <Status tone="neutral">{p.status === "completed" ? "Closed, completed" : "Closed, cancelled"}</Status>
                </a>
              ))}
            </details>
          )}
        </section>
        <aside className="stack">
          <section className="card dark">
            <div className="eyebrow" style={{ color: "#e2c49c" }}>How it works</div>
            <h3>Plan, invite, confirm.</h3>
            <p className="small">Describe each client by need, without identifiers. PsyAlliance suggests colleagues with the right license, focus and fresh availability. You choose who&rsquo;s asked, and in what order. A case only counts as covered when someone accepts.</p>
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
}: {
  options: NeedOptions;
  error?: string;
  preset?: { absenceType: string; title: string; starts: string; ends: string };
}) {
  return (
    <>
      <PageHead eyebrow="Cover / new plan" title="Start with the time away." lead="Choose the kind of cover and the dates. Describe each client&rsquo;s needs next, without identifiers." actions={<a className="btn secondary" href="/dashboard/cover">Cancel</a>} />
      <Progress steps={STEPS} current={0} />
      <Banner error={error} />
      <form className="split" action={createPlanAction}>
        <section className="card">
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
              <input name="title" required maxLength={80} placeholder="e.g. October leave" defaultValue={preset?.title} />
              <small>For your own reference. Never a client name.</small>
            </label>
            <label className="field">First day<input type="date" name="starts_on" defaultValue={preset?.starts} /></label>
            <label className="field">Return date<input type="date" name="ends_on" defaultValue={preset?.ends} /></label>
            <label className="field full">
              Jurisdiction
              <select name="state" required defaultValue={options.homeState || ""}>
                <option value="">State your clients are in</option>
                {options.states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
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
              <button type="submit" className="btn secondary">Add client</button>
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
}: {
  plan: PlanSummary;
  cases: CaseItem[];
  suggestions: Record<number, Match[]>;
  avatarUrls: Record<string, string | null>;
  preselected?: Record<number, string[]>;
}) {
  const openCases = cases.filter((c) => c.status === "needs_cover" || c.status === "declined_all");
  return (
    <>
      <PlanHead plan={plan} step={2} lead="Review the facts on file, then tick who could be asked for each client, in order of preference." />
      <form method="get" action={`/dashboard/cover/${plan.id}`} className="split">
        <input type="hidden" name="step" value="invite" />
        <input type="hidden" name="plan_id" value={plan.id} />
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
                  list.map((m, i) => (
                    <MatchCard
                      key={m.profileId}
                      m={m}
                      rank={i + 1}
                      avatarUrl={avatarUrls[m.profileId]}
                      select={{ name: `pick_${c.id}`, checked: preselected ? (preselected[c.id] || []).includes(m.profileId) : i === 0 }}
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
                  ))
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
}: {
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
      <form className="split" action={sendInvitesAction}>
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
                placeholder="e.g. Weekly sessions, mostly Tuesday evenings. Happy to talk it through."
                autoFocus={fix === "message"}
                aria-invalid={fix === "message" || undefined}
                className={fix === "message" ? "field-invalid" : undefined}
              />
              <small>{fix === "message" ? "Leave out names, initials, dates, phone numbers and addresses." : "No client-identifying details."}</small>
            </label>
            <label className="checkline" style={{ marginTop: 12 }}>
              <input type="checkbox" name="reviewed" required defaultChecked={reviewed} autoFocus={fix === "reviewed"} /> I&rsquo;ve reviewed who receives each request.
            </label>
            <div className="step-actions">
              <a className="btn ghost" href={`/dashboard/cover/${plan.id}?step=candidates`}>&larr; Candidates</a>
              <button type="submit" className="btn" disabled={total === 0}>Send cover requests</button>
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
                <div key={c.id} className="pa-case">
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
                  {c.status === "confirmed" && (
                    <div className="handoff-note">
                      <b>Accepted. Next, the handoff.</b>
                      <ul>
                        <li>Agree the start date and how urgent contacts reach them.</li>
                        <li>Share the coverage summary through your own secure channel, not PsyAlliance.</li>
                        <li>Tell the client who is covering and how to reach them.</li>
                      </ul>
                    </div>
                  )}
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
                  <span className="row"><PersonAvatar name={p.name} /><strong>{p.name}</strong></span>
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
                <h3>When you&rsquo;re back</h3>
                <p className="small">Complete the plan to hand clients back and record who covered for you.</p>
                <div className="row wrap">
                  <form action={completePlanAction} className="inline">
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <button type="submit" className="btn small-btn">Complete plan</button>
                  </form>
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
