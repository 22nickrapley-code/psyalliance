import type { ReactNode } from "react";
import type { Match } from "@/lib/match-engine";
import type { NeedOptions } from "@/lib/need-options";
import { QuietEmpty, PageHead, Banner, Progress, Empty, Status, MatchCard, SummaryList, PersonAvatar } from "../_components/ui";
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
  extended_leave: { label: "Extended leave", blurb: "Maternity, illness or sabbatical. A staged handoff per case." },
  unexpected: { label: "Unexpected absence", blurb: "Illness or emergency. Trusted colleagues are asked first." },
  closing_practice: { label: "Closing or reducing practice", blurb: "Retirement or relocation. Each case is placed permanently." },
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

const CASE_STATUS: Record<CaseItem["status"], { label: string; tone: "" | "warn" | "danger" | "neutral" }> = {
  needs_cover: { label: "Needs a colleague", tone: "danger" },
  awaiting_response: { label: "Invited", tone: "warn" },
  confirmed: { label: "Covered", tone: "" },
  declined_all: { label: "No one left to ask", tone: "danger" },
};

function fmt(d: string | null) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Not set";
}

function PLAN_RESOURCE(type: string | null) {
  if (type === "reciprocal" || type === "short_planned")
    return { code: "PA-01", title: "Reciprocal Coverage Agreement", purpose: "PA-01 sets out roles, response expectations and a per-case summary for the colleague covering." };
  if (type === "closing_practice")
    return { code: "PA-03", title: "Professional Will & Succession Plan", purpose: "PA-03 covers records custody, patient notice and handing over a practice." };
  return { code: "PA-02", title: "Extended Leave & Handoff Pack", purpose: "PA-02 covers plan continuity, patient letters, responsibilities and the return." };
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
            ["Cases", plan.counts.total],
            ["Invited, awaiting reply", plan.counts.invited],
            ["Covered", plan.counts.covered],
            ["Still unresolved", plan.counts.open],
          ]}
        />
      </section>
      <section className="card">
        <div className="eyebrow">From the Practice Library</div>
        <h3>{PLAN_RESOURCE(plan.absenceType).title}</h3>
        <p className="small">{PLAN_RESOURCE(plan.absenceType).purpose}</p>
        <a className="btn secondary small-btn" href={`/dashboard/documents/${PLAN_RESOURCE(plan.absenceType).code}`}>
          View {PLAN_RESOURCE(plan.absenceType).code}
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
      <Progress steps={STEPS} current={step} />
      <nav className="tabs" style={{ marginBottom: 18 }} aria-label="Plan steps">
        {[
          ["needs", "Needs"],
          ["candidates", "Candidates"],
          ["invite", "Invite"],
          ["track", "Track"],
        ].map(([k, l], i) => (
          <a key={k} className={`tab${i + 1 === step ? " active" : ""}`} href={`/dashboard/cover/${plan.id}?step=${k}`}>
            {l}
          </a>
        ))}
      </nav>
    </>
  );
}

// ---------- Index ----------
export function CoverIndexView({
  plans,
  incoming,
  ok,
  error,
}: {
  plans: PlanSummary[];
  incoming: {
    requestId: number;
    ownerId: string;
    ownerName: string;
    planTitle: string;
    dates: string;
    caseLabel: string;
    details: string[];
    urgent: boolean;
  }[];
  ok?: string;
  error?: string;
}) {
  const active = plans.filter((p) => p.status === "draft" || p.status === "active");
  const past = plans.filter((p) => p.status === "completed" || p.status === "cancelled");
  return (
    <>
      <PageHead
        eyebrow="Cover"
        title="Time away, thoughtfully covered."
        lead="Plan cover for one case or your whole caseload, and answer colleagues who need cover."
        actions={<a className="btn" href="/dashboard/cover/new">Plan cover</a>}
      />
      <Banner ok={ok} error={error} />
      {incoming.length > 0 && (
        <section className="card" style={{ marginBottom: 20 }}>
          <div className="card-title"><h3>Cover requests for you</h3><Status tone="warn">{incoming.length} waiting</Status></div>
          {incoming.map((r) => (
            <div key={r.requestId} className="pa-case">
              <div className="row between wrap">
                <div>
                  <strong>{r.ownerName} &middot; {r.planTitle}</strong>
                  <p className="small" style={{ margin: "3px 0 0" }}>{r.dates} &middot; {r.caseLabel}</p>
                </div>
                {r.urgent && <Status tone="danger">Urgent</Status>}
              </div>
              <div className="kv">{r.details.map((d) => <span key={d} className="chip">{d}</span>)}</div>
              <form action={respondCoverAction} className="row wrap" style={{ marginTop: 12 }}>
                <input type="hidden" name="coverage_request_id" value={r.requestId} />
                <input type="hidden" name="owner_id" value={r.ownerId} />
                <input type="hidden" name="thread_title" value={`Cover · ${r.planTitle}`} />
                <button type="submit" name="response" value="accepted" className="btn small-btn">Accept</button>
                <button type="submit" name="response" value="discussing" className="btn secondary small-btn">Discuss first</button>
                <button type="submit" name="response" value="declined" className="btn ghost small-btn">Decline</button>
              </form>
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
              body="Going away, closing a practice, or just want a backup? A plan tracks every case from need to a confirmed colleague."
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
                  <Status tone="neutral">{p.status === "completed" ? "Completed" : "Cancelled"}</Status>
                </a>
              ))}
            </details>
          )}
        </section>
        <aside className="stack">
          <section className="card dark">
            <div className="eyebrow" style={{ color: "#e2c49c" }}>How it works</div>
            <h3>Plan, invite, confirm.</h3>
            <p className="small">Describe each case without identifiers. PsyAlliance suggests colleagues with the right licence, focus and fresh availability. You choose who&rsquo;s asked, and in what order. A case only counts as covered when someone accepts.</p>
          </section>
        </aside>
      </div>
    </>
  );
}

// ---------- Step 1: Plan ----------
export function CoverPlanStepView({ options, error }: { options: NeedOptions; error?: string }) {
  return (
    <>
      <PageHead eyebrow="Cover / new plan" title="Start with the time away." lead="Choose the kind of cover and the dates. Add non-identifying case needs next." actions={<a className="btn secondary" href="/dashboard/cover">Cancel</a>} />
      <Progress steps={STEPS} current={0} />
      <Banner error={error} />
      <form className="split" action={createPlanAction}>
        <section className="card">
          <div className="eyebrow">Step 1 &middot; Plan</div>
          <h2>What kind of cover do you need?</h2>
          <div className="choose-grid">
            {Object.entries(ABSENCE).map(([k, v]) => (
              <label key={k} className="radio-card">
                <input type="radio" name="absence_type" value={k} required />
                <b>{v.label}</b>
                <span>{v.blurb}</span>
              </label>
            ))}
          </div>
          <div className="fields">
            <label className="field full">
              Plan name
              <input name="title" required maxLength={80} placeholder="e.g. October leave" />
              <small>For your own reference. Never a patient name.</small>
            </label>
            <label className="field">First day<input type="date" name="starts_on" /></label>
            <label className="field">Return date<input type="date" name="ends_on" /></label>
            <label className="field full">
              Jurisdiction
              <select name="state" required defaultValue="">
                <option value="">State your patients are in</option>
                {options.states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <div className="tone-panel" style={{ marginTop: 16 }}>
            <b>Private by design.</b> Leave out patient names, dates of birth and clinical details. Coordinate protected information through an appropriate clinical channel.
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
            <p className="small">Add each case that needs cover. PsyAlliance suggests colleagues per case; you review and choose who&rsquo;s asked before anything is sent.</p>
          </section>
        </aside>
      </form>
    </>
  );
}

// ---------- Step 2: Needs ----------
export function CoverNeedsView({ plan, cases, options, error }: { plan: PlanSummary; cases: CaseItem[]; options: NeedOptions; error?: string }) {
  return (
    <>
      <PlanHead plan={plan} step={1} lead="Describe the cover required, one row per case. Non-identifying details only." />
      <Banner error={error} />
      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="card-title"><h3>Cases needing cover ({cases.length})</h3></div>
            {cases.length === 0 && <p className="small">Add the first case below. One case is fine.</p>}
            {cases.map((c) => (
              <div key={c.id} className="pa-case">
                <div className="row between">
                  <strong>{c.reference} &middot; {c.focus}</strong>
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
          <form className="card" action={addCaseAction}>
            <input type="hidden" name="plan_id" value={plan.id} />
            <div className="eyebrow">Add a case</div>
            <h3>Case {cases.length + 1}</h3>
            <div className="fields three">
              <label className="field">
                Treatment focus
                <select name="focus" required defaultValue="">
                  <option value="">Choose a focus</option>
                  {options.focus.map((o) => <option key={o.id} value={o.id}>{o.value}</option>)}
                </select>
              </label>
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
                  <option value="Self-pay">Self-pay</option>
                  {options.insurance.map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
                </select>
              </label>
              <label className="field">
                Session frequency
                <select name="frequency" defaultValue="Weekly">
                  <option>Weekly</option>
                  <option>Fortnightly</option>
                  <option>Monthly</option>
                  <option>As needed</option>
                </select>
              </label>
              <label className="checkline full">
                <input type="checkbox" name="prescribing" value="1" /> Prescribing or medication management needed
              </label>
            </div>
            <div className="step-actions">
              <span className="micro-note">Saved as &ldquo;Case {cases.length + 1}&rdquo;. No names, initials or dates.</span>
              <button type="submit" className="btn secondary">Add case</button>
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
}: {
  plan: PlanSummary;
  cases: CaseItem[];
  suggestions: Record<number, Match[]>;
  avatarUrls: Record<string, string | null>;
}) {
  const openCases = cases.filter((c) => c.status === "needs_cover" || c.status === "declined_all");
  return (
    <>
      <PlanHead plan={plan} step={2} lead="Review the facts on file, then tick who could be asked for each case, in order of preference." />
      <form method="get" action={`/dashboard/cover/${plan.id}`} className="split">
        <input type="hidden" name="step" value="invite" />
        <input type="hidden" name="plan_id" value={plan.id} />
        <div className="stack">
          {openCases.length === 0 && (
            <Empty title="Every case already has someone asked or confirmed." body="Track replies on the Track step." action={<a className="btn secondary small-btn" href={`/dashboard/cover/${plan.id}?step=track`}>Track replies</a>} />
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
                  <Empty title="No colleague matches this case yet." body="Nobody with an active licence in this state, the right focus and current availability is left to ask. Try widening the case, or invite a colleague you trust to join." />
                ) : (
                  list.map((m, i) => (
                    <MatchCard
                      key={m.profileId}
                      m={m}
                      rank={i + 1}
                      avatarUrl={avatarUrls[m.profileId]}
                      select={{ name: `pick_${c.id}`, checked: i === 0 }}
                      actions={
                        <button
                          type="submit"
                          formAction={`/dashboard/cover/${plan.id}/not-fit`}
                          formMethod="post"
                          name="not_fit"
                          value={`${c.id}:${m.profileId}`}
                          className="plain-button small"
                          style={{ color: "var(--danger)" }}
                        >
                          Not a fit for this case
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
}: {
  plan: PlanSummary;
  rows: { caseId: number; reference: string; focus: string; picks: { id: string; name: string }[] }[];
  error?: string;
}) {
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
            <h3>{total === 0 ? "No one selected yet" : `${total} colleague${total === 1 ? "" : "s"} across ${rows.filter((r) => r.picks.length).length} case${rows.filter((r) => r.picks.length).length === 1 ? "" : "s"}`}</h3>
            {rows.length === 0 && <p className="small">Go back to Candidates and tick at least one colleague for a case.</p>}
            {rows.map((r) => (
              <div key={r.caseId} className="pa-case">
                <strong>{r.reference} &middot; {r.focus}</strong>
                {r.picks.length === 0 ? (
                  <p className="small" style={{ margin: "6px 0 0" }}>Nobody selected. This case won&rsquo;t be sent yet.</p>
                ) : (
                  <ol className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {r.picks.map((p) => (
                      <li key={p.id}>
                        {p.name}
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
              <input type="radio" name="outreach_mode" value="sequential" defaultChecked={plan.absenceType !== "unexpected"} />
              <span><b>One at a time, in order</b><span>If someone declines, the next colleague is asked automatically.</span></span>
            </label>
            <label className="radio-card">
              <input type="radio" name="outreach_mode" value="parallel" defaultChecked={plan.absenceType === "unexpected"} />
              <span><b>Everyone at once</b><span>Fastest. The first to accept covers the case; tell the others you&rsquo;re sorted.</span></span>
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              Short message (optional)
              <textarea name="message" maxLength={400} placeholder="e.g. Weekly sessions, mostly Tuesday evenings. Happy to talk it through." />
              <small>No patient-identifying details.</small>
            </label>
            <label className="checkline" style={{ marginTop: 12 }}>
              <input type="checkbox" name="reviewed" required /> I&rsquo;ve reviewed who receives each request.
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
      <PlanHead plan={plan} step={4} lead="A request is not a confirmed plan. Each case stays open until a colleague accepts." />
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
              {plan.counts.invited} awaiting reply &middot; {plan.counts.open} need{plan.counts.open === 1 ? "s" : ""} a colleague
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
                        <span key={i.name} className="chip">{i.name}: {i.status === "sent" ? "asked" : i.status}</span>
                      ))}
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
            {exceptions.length === 0 && cases.length > 0 && <p className="small" style={{ marginTop: 10 }}>Every case is covered.</p>}
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
                <p className="small">Complete the plan to hand cases back and record who covered for you.</p>
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
