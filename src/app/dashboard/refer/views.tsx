import type { ReactNode } from "react";
import type { Match } from "@/lib/match-engine";
import type { NeedOptions } from "@/lib/need-options";
import { needToQuery, type parseNeed } from "@/lib/need-options";
import {
  PageHead,
  Banner,
  Progress,
  Empty,
  Status,
  MatchCard,
  NeedFields,
  SummaryList,
  PersonAvatar,
} from "../_components/ui";
import {
  sendReferralAction,
  respondReferralAction,
  chooseReferralColleagueAction,
  closeReferralAction,
  rateCollaborationAction,
} from "./actions";

type Need = ReturnType<typeof parseNeed>;
const STEPS = ["Need", "Shortlist", "Review", "Track"];

export function describeNeed(need: Need, options: Pick<NeedOptions, "focus" | "language" | "states">) {
  const focus = need.focusIds.map((id) => options.focus.find((f) => f.id === id)?.value).filter(Boolean).join(" + ");
  const state = options.states.find((s) => s.code === need.state)?.name || need.state || "";
  return { focus: focus || "Any focus", where: [need.city, state].filter(Boolean).join(", ") || "Anywhere" };
}

function needRows(need: Need, options: Pick<NeedOptions, "focus" | "language" | "states">): [string, ReactNode][] {
  const d = describeNeed(need, options);
  const rows: [string, ReactNode][] = [
    ["Focus", d.focus],
    ["Where", d.where],
    ["Setting", need.setting === "virtual" ? "Virtual" : need.setting === "in_person" ? "In person" : "Either"],
  ];
  if (need.insurance) rows.push(["Insurance", need.insurance]);
  if (need.ageBand) rows.push(["Age band", need.ageBand]);
  if (need.languageId) rows.push(["Language", options.language.find((l) => l.id === need.languageId)?.value || "Selected"]);
  rows.push(["Patient details shared", "None"]);
  return rows;
}

function ResourceAside() {
  return (
    <section className="card">
      <div className="eyebrow">From the Practice Library</div>
      <h3>Referral &amp; Transfer Toolkit</h3>
      <p className="small">PA-07 gives a framework for referral outcomes and handoff responsibilities once a colleague agrees.</p>
      <a className="btn secondary small-btn" href="/dashboard/documents?q=PA-07">View PA-07</a>
    </section>
  );
}

// ---------- Step 1: Need ----------
export function ReferNeedView({ options, need, error }: { options: NeedOptions; need: Need; error?: string }) {
  return (
    <>
      <PageHead
        eyebrow="Refer / new referral"
        title="A thoughtful route to the right colleague."
        lead="Start with the service need. Review a shortlist before anyone is contacted."
        actions={<a className="btn secondary" href="/dashboard/refer">Back to referrals</a>}
      />
      <Progress steps={STEPS} current={0} />
      <Banner error={error} />
      <div className="split">
        <form className="card" method="get" action="/dashboard/refer/new">
          <input type="hidden" name="step" value="shortlist" />
          <div className="eyebrow">Step 1 &middot; Define the need</div>
          <h2>Who could be a good fit?</h2>
          <p>Use broad, non-identifying details. The clinical handoff happens through your own secure channel after a colleague agrees.</p>
          <NeedFields options={options} values={need} />
          <div className="tone-panel" style={{ marginTop: 18 }}>
            Do not enter names, dates of birth, contact details or other patient-identifying information.
          </div>
          <div className="step-actions">
            <a className="btn ghost" href="/dashboard/refer">Cancel</a>
            <button type="submit" className="btn">See shortlist &rarr;</button>
          </div>
        </form>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">How it works</div>
            <h3>You stay in control.</h3>
            <p className="small">The shortlist is ranked by your relationships first, then fit, then how recently each colleague confirmed they&rsquo;re taking referrals. Nobody sees anything until you review and send.</p>
          </section>
          <ResourceAside />
        </aside>
      </div>
    </>
  );
}

// ---------- Step 2: Shortlist ----------
export function ReferShortlistView({
  options,
  need,
  matches,
  widen,
  avatarUrls,
}: {
  options: NeedOptions;
  need: Need;
  matches: Match[];
  widen: { key: string; label: string }[];
  avatarUrls: Record<string, string | null>;
}) {
  const d = describeNeed(need, options);
  const widenHref = (key: string) => {
    const n = { ...need } as any;
    if (key === "focus") n.focusIds = [];
    else if (key === "setting") n.setting = "either";
    else n[key] = null;
    return `/dashboard/refer/new?${needToQuery(n, { step: "shortlist" })}`;
  };
  return (
    <>
      <PageHead eyebrow="Refer / new referral" title="Who could be a good fit?" lead={`${d.focus} · ${d.where}`} />
      <Progress steps={STEPS} current={1} />
      <div className="split">
        <form method="get" action="/dashboard/refer/new">
          <input type="hidden" name="step" value="review" />
          {need.focusIds.map((f) => <input key={f} type="hidden" name="focus" value={f} />)}
          {need.state && <input type="hidden" name="state" value={need.state} />}
          {need.city && <input type="hidden" name="city" value={need.city} />}
          {need.insurance && <input type="hidden" name="insurance" value={need.insurance} />}
          {need.ageBand && <input type="hidden" name="age" value={need.ageBand} />}
          {need.setting && <input type="hidden" name="setting" value={need.setting} />}
          {need.languageId && <input type="hidden" name="language" value={need.languageId} />}
          <section className="card">
            <div className="card-title">
              <div>
                <div className="eyebrow">Step 2 &middot; Shortlist</div>
                <h3>{matches.length ? `${matches.length} colleague${matches.length === 1 ? "" : "s"} match` : "No one matches yet"}</h3>
              </div>
              <a className="plain-button" href={`/dashboard/refer/new?${needToQuery(need)}`}>Edit need</a>
            </div>
            {matches.length === 0 ? (
              <Empty
                title="No verified colleague fits all of this yet."
                body="Widen one criterion below, or send it to your trusted circle or the verified network on the next step."
              />
            ) : (
              <>
                <p className="small">Tick who should receive this referral. The top three are selected for you.</p>
                {matches.map((m, i) => (
                  <MatchCard key={m.profileId} m={m} rank={i + 1} avatarUrl={avatarUrls[m.profileId]} select={{ name: "pick", checked: i < 3 }} />
                ))}
              </>
            )}
            {widen.length > 0 && (
              <div className="quiet-panel" style={{ marginTop: 14 }}>
                <b className="small">Widen the search</b>
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {widen.map((w) => (
                    <a key={w.key} className="chip" href={widenHref(w.key)}>{w.label}</a>
                  ))}
                </div>
              </div>
            )}
            <div className="step-actions">
              <a className="btn ghost" href={`/dashboard/refer/new?${needToQuery(need)}`}>&larr; Back</a>
              <button type="submit" className="btn">Review before sending &rarr;</button>
            </div>
          </section>
        </form>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">Request summary</div>
            <h3>{d.focus}</h3>
            <SummaryList rows={needRows(need, options)} />
          </section>
          <ResourceAside />
        </aside>
      </div>
    </>
  );
}

// ---------- Step 3: Review ----------
export function ReferReviewView({
  options,
  need,
  picked,
  trustedCount,
  networkCount,
  error,
}: {
  options: NeedOptions;
  need: Need;
  picked: { profileId: string; name: string }[];
  trustedCount: number;
  networkCount: number;
  error?: string;
}) {
  const d = describeNeed(need, options);
  return (
    <>
      <PageHead eyebrow="Refer / new referral" title="Review before you reach out." lead="Choose exactly who receives this. Nothing is sent until you confirm." />
      <Progress steps={STEPS} current={2} />
      <Banner error={error} />
      <form className="split" action={sendReferralAction}>
        {need.focusIds.map((f) => <input key={f} type="hidden" name="focus" value={f} />)}
        {need.state && <input type="hidden" name="state" value={need.state} />}
        {need.city && <input type="hidden" name="city" value={need.city} />}
        {need.insurance && <input type="hidden" name="insurance" value={need.insurance} />}
        {need.ageBand && <input type="hidden" name="age" value={need.ageBand} />}
        {need.setting && <input type="hidden" name="setting" value={need.setting} />}
        {need.languageId && <input type="hidden" name="language" value={need.languageId} />}
        {picked.map((p) => <input key={p.profileId} type="hidden" name="pick" value={p.profileId} />)}
        <section className="card">
          <div className="eyebrow">Step 3 &middot; Audience</div>
          <h3>Who receives this referral?</h3>
          <label className="radio-card">
            <input type="radio" name="audience" value="selected" defaultChecked={picked.length > 0} disabled={picked.length === 0} />
            <span>
              <b>Selected colleagues ({picked.length})</b>
              <span>{picked.length ? picked.map((p) => p.name).join(", ") : "Go back to the shortlist to pick people."}</span>
            </span>
          </label>
          <label className="radio-card">
            <input type="radio" name="audience" value="trusted" defaultChecked={picked.length === 0 && trustedCount > 0} disabled={trustedCount === 0} />
            <span>
              <b>My trusted colleagues ({trustedCount})</b>
              <span>{trustedCount ? "Every trusted colleague can see it; those who fit are notified." : "You haven't added trusted colleagues yet."}</span>
            </span>
          </label>
          <label className="radio-card">
            <input type="radio" name="audience" value="wider_network" defaultChecked={picked.length === 0 && trustedCount === 0} />
            <span>
              <b>The verified network ({networkCount})</b>
              <span>Visible to all {networkCount} verified member{networkCount === 1 ? "" : "s"}; only those who match are notified.</span>
            </span>
          </label>

          <div className="fields" style={{ marginTop: 16 }}>
            <label className="field">
              Timeframe
              <select name="timeframe" defaultValue="within_month">
                <option value="urgent">Urgent (this week)</option>
                <option value="within_month">Within a month</option>
                <option value="flexible">Flexible</option>
              </select>
            </label>
            <label className="field full">
              Note for colleagues (optional)
              <textarea name="notes" maxLength={500} placeholder="e.g. Prefers evening telehealth. Has tried CBT before." />
              <small>Broad context only. No names, dates, contact details or clinical notes.</small>
            </label>
          </div>
          <label className="checkline" style={{ marginTop: 14 }}>
            <input type="checkbox" name="deidentified" required />
            This referral contains no patient-identifying information.
          </label>
          <div className="step-actions">
            <a className="btn ghost" href={`/dashboard/refer/new?${needToQuery(need, { step: "shortlist" })}`}>&larr; Back to shortlist</a>
            <button type="submit" className="btn">Send referral</button>
          </div>
        </section>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">Request summary</div>
            <h3>{d.focus}</h3>
            <SummaryList rows={needRows(need, options)} />
          </section>
          <ResourceAside />
        </aside>
      </form>
    </>
  );
}

// ---------- Index ----------
export type ReferralListItem = {
  id: number;
  focus: string;
  where: string;
  status: string;
  createdAt: string;
  interested: number;
  responses: number;
  audience: string;
};

const STATUS_LABEL: Record<string, { label: string; tone: "" | "warn" | "neutral" }> = {
  sent: { label: "Awaiting replies", tone: "warn" },
  open: { label: "Awaiting replies", tone: "warn" },
  connected: { label: "Colleague chosen", tone: "" },
  handoff: { label: "Handoff under way", tone: "" },
  closed: { label: "Closed", tone: "neutral" },
  matched: { label: "Placed", tone: "" },
};

export function ReferIndexView({
  options,
  mine,
  offered,
  ok,
  error,
}: {
  options: NeedOptions;
  mine: ReferralListItem[];
  offered: (ReferralListItem & { from: string; myResponse: string | null })[];
  ok?: string;
  error?: string;
}) {
  return (
    <>
      <PageHead
        eyebrow="Refer"
        title="A thoughtful route to the right colleague."
        lead="Hand a patient to someone you trust, and see referrals that fit your practice."
        actions={<a className="btn" href="/dashboard/refer/new">New referral</a>}
      />
      <Banner ok={ok} error={error} />
      <form className="quick-search" method="get" action="/dashboard/refer/new">
        <input type="hidden" name="step" value="shortlist" />
        <h3>Quick referral search</h3>
        <NeedFields options={options} compact />
        <div className="row" style={{ marginTop: 14 }}>
          <button type="submit" className="btn">Search colleagues</button>
          <span className="small" style={{ color: "#cfe0d4" }}>No patient details. Nothing is sent until you review.</span>
        </div>
      </form>
      <div className="split equal" style={{ marginTop: 20 }}>
        <section className="card">
          <div className="card-title"><h3>Your referrals</h3><span className="micro-note">{mine.length} total</span></div>
          {mine.length === 0 ? (
            <Empty symbol={"↗"} title="No referrals yet." body="When you can't take a patient, start here: describe the need and PsyAlliance shortlists the right colleagues." action={<a className="btn secondary small-btn" href="/dashboard/refer/new">Make a referral</a>} />
          ) : (
            mine.map((r) => {
              const s = STATUS_LABEL[r.status] || { label: r.status, tone: "neutral" as const };
              return (
                <a key={r.id} className="list-row" href={`/dashboard/refer/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <span>
                    <strong>{r.focus}</strong>
                    <small>{r.where} &middot; {r.interested} interested of {r.responses} repl{r.responses === 1 ? "y" : "ies"} &middot; {new Date(r.createdAt).toLocaleDateString()}</small>
                  </span>
                  <Status tone={s.tone}>{s.label}</Status>
                </a>
              );
            })
          )}
        </section>
        <section className="card">
          <div className="card-title"><h3>Offered to you</h3><span className="micro-note">Matched to your practice</span></div>
          {offered.length === 0 ? (
            <Empty symbol={"◎"} title="Nothing waiting for you." body="Referrals that fit your profile and availability appear here. Keeping your availability current helps colleagues find you." action={<a className="btn secondary small-btn" href="/dashboard/availability">Update availability</a>} />
          ) : (
            offered.map((r) => (
              <a key={r.id} className="list-row" href={`/dashboard/refer/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <span>
                  <strong>{r.focus}</strong>
                  <small>From {r.from} &middot; {r.where} &middot; {new Date(r.createdAt).toLocaleDateString()}</small>
                </span>
                {r.myResponse ? <Status tone="neutral">You replied</Status> : <Status tone="warn">Needs your reply</Status>}
              </a>
            ))
          )}
        </section>
      </div>
    </>
  );
}

// ---------- Track (owner) and respond (recipient) ----------
export type ReferralDetail = {
  id: number;
  isMine: boolean;
  focus: string;
  where: string;
  status: string;
  audience: string;
  timeframe: string | null;
  notes: string | null;
  createdAt: string;
  requesterName: string;
  rows: [string, ReactNode][];
  responses: {
    profileId: string;
    name: string;
    status: string;
    message: string | null;
    avatarUrl: string | null;
  }[];
  myResponse: { status: string; message: string | null } | null;
  chosen: { profileId: string; name: string } | null;
  rated: boolean;
};

const RESPONSE_LABEL: Record<string, { label: string; tone: "" | "warn" | "neutral" | "danger" }> = {
  interested: { label: "Interested", tone: "" },
  accepted: { label: "Chosen", tone: "" },
  question: { label: "Has a question", tone: "warn" },
  unavailable: { label: "Not available", tone: "neutral" },
  offered: { label: "Offered to help", tone: "" },
  declined: { label: "Declined", tone: "neutral" },
};

export function ReferTrackView({ r, ok, error }: { r: ReferralDetail; ok?: string; error?: string }) {
  const s = STATUS_LABEL[r.status] || { label: r.status, tone: "neutral" as const };
  const open = r.status === "sent" || r.status === "open";
  const threadTitle = `Referral · ${r.focus} · ${r.where}`;
  return (
    <>
      <PageHead
        eyebrow={r.isMine ? "Refer / your referral" : `Refer / from ${r.requesterName}`}
        title={r.focus}
        lead={`${r.where} · sent ${new Date(r.createdAt).toLocaleDateString()}`}
        actions={<a className="btn secondary" href="/dashboard/refer">All referrals</a>}
      />
      {r.isMine && <Progress steps={STEPS} current={3} />}
      <Banner ok={ok} error={error} />
      <div className="split">
        <div className="stack">
          {r.isMine ? (
            <section className="card">
              <div className="card-title">
                <h3>Responses</h3>
                <Status tone={s.tone}>{s.label}</Status>
              </div>
              {r.responses.length === 0 ? (
                <Empty symbol={"✉"} title="No replies yet." body="Colleagues who receive this referral can reply Interested, Not available, or ask a question. You'll be notified." />
              ) : (
                r.responses.map((resp) => {
                  const rl = RESPONSE_LABEL[resp.status] || { label: resp.status, tone: "neutral" as const };
                  return (
                    <div key={resp.profileId} className="mini-person">
                      <PersonAvatar name={resp.name} url={resp.avatarUrl} />
                      <div className="content">
                        <div className="row between">
                          <h3><a href={`/dashboard/people/${resp.profileId}`}>{resp.name}</a></h3>
                          <Status tone={rl.tone}>{rl.label}</Status>
                        </div>
                        {resp.message && <p>&ldquo;{resp.message}&rdquo;</p>}
                        {open && (resp.status === "interested" || resp.status === "question") && (
                          <div className="actions">
                            <form action={chooseReferralColleagueAction} className="inline">
                              <input type="hidden" name="referral_request_id" value={r.id} />
                              <input type="hidden" name="responding_profile_id" value={resp.profileId} />
                              <input type="hidden" name="thread_title" value={threadTitle} />
                              <button type="submit" className="btn small-btn">Choose and start handoff</button>
                            </form>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          ) : (
            <section className="card">
              <div className="eyebrow">Your reply</div>
              {r.myResponse ? (
                <>
                  <h3>You replied: {(RESPONSE_LABEL[r.myResponse.status] || { label: r.myResponse.status }).label}</h3>
                  {r.myResponse.message && <p>&ldquo;{r.myResponse.message}&rdquo;</p>}
                  {r.chosen && <p className="small">{r.requesterName} has chosen a colleague for this referral.</p>}
                </>
              ) : open ? (
                <form action={respondReferralAction}>
                  <input type="hidden" name="referral_request_id" value={r.id} />
                  <h3>Can you take this referral?</h3>
                  <label className="radio-card"><input type="radio" name="response" value="interested" defaultChecked /><span><b>Interested</b><span>I have capacity and this fits my practice.</span></span></label>
                  <label className="radio-card"><input type="radio" name="response" value="question" /><span><b>I have a question</b><span>Ask before deciding.</span></span></label>
                  <label className="radio-card"><input type="radio" name="response" value="unavailable" /><span><b>Not available</b><span>No capacity right now.</span></span></label>
                  <label className="field" style={{ marginTop: 10 }}>
                    Message (optional)
                    <textarea name="message" maxLength={500} placeholder="e.g. I have two openings on Tuesday evenings." />
                    <small>No patient-identifying details.</small>
                  </label>
                  <div className="step-actions"><span /><button type="submit" className="btn">Send reply</button></div>
                </form>
              ) : (
                <p>This referral is no longer open.</p>
              )}
            </section>
          )}

          {r.isMine && r.chosen && r.status !== "closed" && (
            <section className="card tint">
              <div className="eyebrow">Handoff</div>
              <h3>You chose {r.chosen.name}.</h3>
              <p className="small">Share clinical details and patient identity through your own secure channel, not in PsyAlliance. Close the referral once the patient is placed.</p>
              <div className="row wrap">
                <form action={chooseReferralColleagueAction} className="inline">
                  <input type="hidden" name="referral_request_id" value={r.id} />
                  <input type="hidden" name="responding_profile_id" value={r.chosen.profileId} />
                  <input type="hidden" name="thread_title" value={threadTitle} />
                  <button type="submit" className="btn secondary small-btn">Open conversation</button>
                </form>
                <form action={closeReferralAction} className="inline">
                  <input type="hidden" name="referral_request_id" value={r.id} />
                  <input type="hidden" name="outcome" value="placed" />
                  <button type="submit" className="btn small-btn">Mark placed and close</button>
                </form>
              </div>
            </section>
          )}

          {r.isMine && r.status === "closed" && r.chosen && !r.rated && (
            <section className="card">
              <div className="eyebrow">Private</div>
              <h3>Would you work with {r.chosen.name} again?</h3>
              <p className="small">Only you see this. It helps rank future suggestions.</p>
              <form action={rateCollaborationAction} className="row">
                <input type="hidden" name="context_type" value="referral" />
                <input type="hidden" name="context_id" value={r.id} />
                <input type="hidden" name="colleague_id" value={r.chosen.profileId} />
                <input type="hidden" name="return_to" value={`/dashboard/refer/${r.id}`} />
                <button type="submit" name="would_work_again" value="yes" className="btn small-btn">Yes</button>
                <button type="submit" name="would_work_again" value="no" className="btn secondary small-btn">Not again</button>
              </form>
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">The need</div>
            <h3>{r.focus}</h3>
            <SummaryList rows={r.rows} />
            {r.notes && <p className="small" style={{ marginTop: 10 }}>&ldquo;{r.notes}&rdquo;</p>}
          </section>
          {r.isMine && open && (
            <section className="card">
              <h3>Close without placing</h3>
              <p className="small">If the patient no longer needs a referral, close it so colleagues stop seeing it.</p>
              <form action={closeReferralAction}>
                <input type="hidden" name="referral_request_id" value={r.id} />
                <input type="hidden" name="outcome" value="closed" />
                <button type="submit" className="btn secondary small-btn">Close referral</button>
              </form>
            </section>
          )}
          <ResourceAside />
        </aside>
      </div>
    </>
  );
}
