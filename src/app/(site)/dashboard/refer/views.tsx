import { shortDate } from "@/lib/dates";
import { startConversation } from "../messages/actions";
import { TOUR_URL } from "@/lib/env";
import { FirstVisit } from "../_components/first-visit";
import type { ReactNode } from "react";
import type { Match, ColleagueFit } from "@/lib/match-engine";
import type { ThreadMessage } from "@/lib/threads";
import { InlineThread } from "../_components/inline-thread";
import type { NeedOptions } from "@/lib/need-options";
import { needToQuery, type parseNeed } from "@/lib/need-options";
import { NavIcon } from "../icons";
import {
  type NeedValues,
  ListPanel,
  ListItem,
  PageHead,
  Banner,
  Progress,
  Empty,
  QuietEmpty,
  Status,
  MatchCard,
  NeedFields,
  SummaryList,
  PersonAvatar,
  HANDOFF_RULE,
  HistoryList,
  type HistoryTone,
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
// Referring to one colleague, from their profile: no shortlist.
const DIRECT_STEPS = ["Need", "Check and send", "Track"];

export type DirectColleague = { id: string; name: string; first: string; role: string; avatarUrl: string | null; relation: string | null };

// The colleague a direct referral goes to, with how you know them.
function ColleagueCard({ c, children }: { c: DirectColleague; children?: ReactNode }) {
  return (
    <section className="card direct-colleague">
      <div className="eyebrow">Referring to</div>
      <div className="dc-person">
        <PersonAvatar name={c.name} url={c.avatarUrl} size={52} id={c.id} />
        <div>
          <h3><a href={`/dashboard/people/${c.id}`}>{c.name}</a></h3>
          <p className="small">{c.role}</p>
          {c.relation && <span className="chip">{c.relation}</span>}
        </div>
      </div>
      {children}
    </section>
  );
}

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
    ["Setting", need.setting === "virtual" ? "Virtual" : need.setting === "in_person" ? "In person" : "Virtual or in person"],
  ];
  if (need.insurance) rows.push(["Insurance", need.insurance]);
  if (need.ageBand) rows.push(["Age band", need.ageBand]);
  if (need.languageId) rows.push(["Language", options.language.find((l) => l.id === need.languageId)?.value || "Selected"]);
  rows.push(["Client details shared", "None"]);
  return rows;
}

function ResourceAside() {
  return (
    <section className="card">
      <div className="eyebrow">From the Library</div>
      <h3>Referral &amp; Transfer Toolkit</h3>
      <p className="small">Record who took the referral and what each of you is responsible for once a colleague agrees.</p>
      <a className="btn secondary small-btn" href="/dashboard/library?resource=PA-07">View the template</a>
      <p className="small" style={{ marginTop: 12 }}>Referring for medication while you keep therapy? The Split-Treatment Agreement sets out who does what.</p>
      <a className="plain-button small" href="/dashboard/library?resource=PA-08">View the agreement &rarr;</a>
    </section>
  );
}

// ---------- Step 1: Need ----------
export function ReferNeedView({ options, need, error, to }: { options: NeedOptions; need: Need; error?: string; to?: DirectColleague | null }) {
  return (
    <>
      <PageHead
        eyebrow={to ? "Refer / to a colleague" : "Refer / new referral"}
        title={to ? `Refer a client to ${to.name}` : "Refer"}
        lead={
          to
            ? `Describe what the client needs. You'll see how ${to.first} fits before anything is sent, and it goes to ${to.first} only.`
            : "Start with the service need. Review a shortlist before anyone is contacted."
        }
        actions={<a className="btn secondary" href={to ? `/dashboard/people/${to.id}` : "/dashboard/refer"}>{to ? `Back to ${to.first}` : "Back to referrals"}</a>}
      />
      <Progress steps={to ? DIRECT_STEPS : STEPS} current={0} />
      <Banner error={error} />
      {to ? (
        // The same green card as on Refer, so a referral from a profile looks
        // and works like every other referral (Nick, 13 Oct).
        <>
          <form className="quick-search" method="get" action="/dashboard/refer/new" id="start-referral">
            <input type="hidden" name="step" value="review" />
            <input type="hidden" name="to" value={to.id} />
            <h3>What does the client need?</h3>
            <NeedFields options={options} values={need} compact refineInline />
            <div className="row wrap" style={{ marginTop: 14, gap: 12 }}>
              <button type="submit" className="btn">Check the fit &rarr;</button>
            </div>
            <p className="small" style={{ color: "#cfe0d4", margin: "10px 0 0" }}>
              No client details. You&rsquo;ll see how {to.first} fits before anything is sent, and it goes to {to.first} only.
            </p>
          </form>
          <div className="split equal" style={{ marginTop: 20 }}>
            <ColleagueCard c={to}>
              <p className="small" style={{ marginTop: 12 }}>
                Want to see everyone who fits instead? <a href="/dashboard/refer/new">Start an open referral</a>.
              </p>
            </ColleagueCard>
            <section className="card tint">
              <div className="eyebrow">How it works</div>
              <h3>You stay in control.</h3>
              <p className="small">{to.first} sees the need only after you review it. No client names, dates or other details that identify someone.</p>
              <div className="tone-panel" style={{ marginTop: 12 }}>{HANDOFF_RULE}</div>
            </section>
          </div>
        </>
      ) : (
      <div className="split">
        <form className="card" method="get" action="/dashboard/refer/new">
          <input type="hidden" name="step" value="shortlist" />
          <div className="eyebrow">Step 1 &middot; Define the need</div>
          <h2>Who could be a good fit?</h2>
          <p>Start with the main need and where the client is. Everything else is optional.</p>
          <NeedFields options={options} values={need} />
          <div className="tone-panel" style={{ marginTop: 18 }}>
            {HANDOFF_RULE}
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
      )}
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
  pinned,
  chosen = null,
}: {
  options: NeedOptions;
  need: Need;
  matches: Match[];
  widen: { key: string; label: string }[];
  avatarUrls: Record<string, string | null>;
  // The colleague the member started from, first and ticked.
  pinned?: { id: string; canAsk: boolean; gaps: string[] } | null;
  // Back from Review: exactly who the member had ticked, even if that's
  // nobody (release review N02). Null on a first visit: the defaults apply.
  chosen?: string[] | null;
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
                body="Widen one criterion below, or send it to your trusted colleagues or the verified network on the next step."
              />
            ) : (
              <>
                <p className="small">{chosen ? "Your choices are kept. Change who should receive this referral." : pinned ? "Your colleague is first. Tick anyone else who should receive it." : "Tick who should receive this referral. The top three are selected for you."}</p>
                {matches.map((m, i) => {
                  const isPinned = pinned?.id === m.profileId;
                  return (
                    <MatchCard
                      key={m.profileId}
                      m={m}
                      rank={i + 1}
                      avatarUrl={avatarUrls[m.profileId]}
                      flag={isPinned ? "Your choice" : undefined}
                      note={isPinned ? pinned!.gaps : undefined}
                      select={{ name: "pick", checked: chosen ? chosen.includes(m.profileId) : pinned ? isPinned && pinned.canAsk : i < 3, disabled: isPinned && !pinned!.canAsk }}
                    />
                  );
                })}
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
  direct,
}: {
  options: NeedOptions;
  need: Need;
  picked: { profileId: string; name: string }[];
  trustedCount: number;
  networkCount: number;
  error?: string;
  // A referral to one colleague, from their profile.
  direct?: { colleague: DirectColleague; fit: ColleagueFit | null } | null;
}) {
  const d = describeNeed(need, options);
  if (direct) return <DirectReview options={options} need={need} colleague={direct.colleague} fit={direct.fit} error={error} />;
  return (
    <>
      <PageHead eyebrow="Refer / new referral" title="Review before you reach out." lead="Choose exactly who receives this. Nothing is sent until you confirm." />
      <Progress steps={STEPS} current={2} />
      <Banner error={error} />
      <form className="split" action={sendReferralAction} data-deidentify="" data-draft={`refer:${needToQuery(need)}`}>
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
            <input type="radio" name="audience" value="wider_network" defaultChecked={picked.length === 0 && trustedCount === 0 && networkCount > 0} disabled={networkCount === 0} />
            <span>
              <b>The verified network{networkCount > 0 ? ` (${networkCount.toLocaleString()})` : ""}</b>
              <span>
                {networkCount > 0
                  ? `Visible to the ${networkCount.toLocaleString()} verified member${networkCount === 1 ? "" : "s"} who can see referrals; only those who match are notified.`
                  : "Not available yet: no other verified members can receive it. Choose colleagues from the shortlist instead."}
              </span>
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
            This referral contains no client-identifying information.
          </label>
          <div className="step-actions">
            <a className="btn ghost" href={`/dashboard/refer/new?${needToQuery(need, { step: "shortlist", kept: "1" })}${picked.map((p) => `&pick=${encodeURIComponent(p.profileId)}`).join("")}`}>&larr; Back to shortlist</a>
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

// ---------- Direct referral: check the fit, then send to one colleague ----------
function DirectReview({ options, need, colleague, fit, error }: { options: NeedOptions; need: Need; colleague: DirectColleague; fit: ColleagueFit | null; error?: string }) {
  const d = describeNeed(need, options);
  const first = colleague.first;
  const canAsk = !fit || fit.canAsk;
  const shortlistHref = `/dashboard/refer/new?${needToQuery(need, { step: "shortlist" })}&to=${colleague.id}`;
  const needHref = `/dashboard/refer/new?${needToQuery(need)}&to=${colleague.id}`;
  return (
    <>
      <PageHead
        eyebrow="Refer / to a colleague"
        title={canAsk ? `Check and send to ${first}` : `${first} can't take this client`}
        lead={canAsk ? `How ${first} fits ${d.focus.toLowerCase() === "any focus" ? "this client" : `a client with ${d.focus}`} in ${d.where}. Nothing is sent until you confirm.` : "Here's why, and who could."}
        actions={<a className="btn secondary" href={`/dashboard/people/${colleague.id}`}>Back to {first}</a>}
      />
      <Progress steps={DIRECT_STEPS} current={1} />
      <Banner error={error} />
      <form className="split" action={sendReferralAction} data-deidentify="">
        {need.focusIds.map((f) => <input key={f} type="hidden" name="focus" value={f} />)}
        {need.state && <input type="hidden" name="state" value={need.state} />}
        {need.city && <input type="hidden" name="city" value={need.city} />}
        {need.insurance && <input type="hidden" name="insurance" value={need.insurance} />}
        {need.ageBand && <input type="hidden" name="age" value={need.ageBand} />}
        {need.setting && <input type="hidden" name="setting" value={need.setting} />}
        {need.languageId && <input type="hidden" name="language" value={need.languageId} />}
        <input type="hidden" name="pick" value={colleague.id} />
        <input type="hidden" name="to" value={colleague.id} />
        <input type="hidden" name="audience" value="selected" />
        <section className="card">
          <div className="eyebrow">Step 2 &middot; Check and send</div>
          {fit && fit.fits && (
            <div className="fit-panel is-good">
              <b>Why {first} fits</b>
              <ul>{fit.match.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
          {fit && !fit.fits && canAsk && (
            <div className="fit-panel is-warn">
              <b>Worth knowing before you send</b>
              <ul>{fit.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
              <p className="small">You can still send it to {first}, or <a href={shortlistHref}>see colleagues who fit</a>.</p>
            </div>
          )}
          {!canAsk && fit && (
            <div className="fit-panel is-stop">
              <b>{first} can&rsquo;t take this client.</b>
              <ul>{fit.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
              <div className="row wrap" style={{ marginTop: 12 }}>
                <a className="btn small-btn" href={shortlistHref}>See colleagues who can &rarr;</a>
                <a className="btn ghost small-btn" href={needHref}>Change the need</a>
              </div>
            </div>
          )}
          {canAsk && (
            <>
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
                  Note for {first} (optional)
                  <textarea name="notes" maxLength={500} placeholder="e.g. Prefers evening telehealth. Has tried CBT before." />
                  <small>Broad context only. No names, dates, contact details or clinical notes.</small>
                </label>
              </div>
              <label className="checkline" style={{ marginTop: 14 }}>
                <input type="checkbox" name="deidentified" required />
                This referral contains no client-identifying information.
              </label>
              <div className="step-actions">
                <a className="btn ghost" href={needHref}>&larr; Change the need</a>
                <button type="submit" className="btn">Send to {first}</button>
              </div>
              <p className="micro-note" style={{ marginTop: 10 }}>
                Want others to see it too? <a href={shortlistHref}>Add colleagues who fit</a>.
              </p>
            </>
          )}
        </section>
        <aside className="stack">
          <ColleagueCard c={colleague} />
          <section className="card tint">
            <div className="eyebrow">What {first} will see</div>
            <h3>{d.focus}</h3>
            <SummaryList rows={needRows(need, options)} />
          </section>
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
  audienceCount?: number | null;
  // A colleague was chosen at some point (for "Completed" once closed).
  placed?: boolean;
};

export type ReceivedItem = ReferralListItem & { from: string; myResponse: string | null };

// Where a referral you sent stands (Nick, 18 Oct): amber while you're
// waiting or choosing, green once a colleague is chosen, red when no one
// could take it, grey when it's finished or closed.
export function sentState(r: ReferralListItem): { tone: HistoryTone; label: string; action: string } {
  const open = r.status === "sent" || r.status === "open";
  if (open) {
    const everyone = !!r.audienceCount && r.responses >= r.audienceCount;
    if (r.interested > 0 && everyone) return { tone: "amber", label: "Ready to choose", action: "Choose a colleague" };
    if (r.interested > 0) return { tone: "amber", label: `${r.interested} interested`, action: "Review replies" };
    if (everyone) return { tone: "red", label: "No one available", action: "Widen the search" };
    if (r.responses > 0) return { tone: "amber", label: "Replies coming in", action: "View replies" };
    return { tone: "amber", label: "Waiting for replies", action: "View" };
  }
  if (r.status === "connected") return { tone: "green", label: "Colleague chosen", action: "Complete handoff" };
  if (r.status === "handoff") return { tone: "green", label: "Handoff under way", action: "Open handoff" };
  if (r.status === "matched" || (r.status === "closed" && r.placed)) return { tone: "grey", label: "Completed", action: "View" };
  return { tone: "grey", label: "Closed", action: "View" };
}

// Where a referral sent to you stands: amber while it needs your reply or
// you're waiting for their choice, green when they chose you, red when you
// said you're not available, grey once it's finished, closed or went to
// someone else.
export function receivedState(r: ReceivedItem): { tone: HistoryTone; label: string; action: string } {
  const open = r.status === "sent" || r.status === "open";
  const resp = r.myResponse;
  if (resp === "accepted") {
    if (r.status === "matched" || r.status === "closed") return { tone: "grey", label: "Completed", action: "View" };
    return { tone: "green", label: "They chose you", action: "Open" };
  }
  if (resp === "unavailable" || resp === "declined") return { tone: "red", label: "You said not available", action: "View" };
  if (resp === "withdrawn") return { tone: "grey", label: "You withdrew", action: "View" };
  if (!open) return { tone: "grey", label: resp && r.status !== "closed" ? "They chose someone else" : "Closed", action: "View" };
  if (!resp) return { tone: "amber", label: "Needs your reply", action: "Reply" };
  return { tone: "amber", label: resp === "question" ? "You asked a question" : "You replied, waiting", action: "View" };
}

// Precise status with the next action beside it. "Awaiting" only while the
// member is genuinely waiting; once colleagues have answered, the decision
// is theirs to make.
export function referralStatus(r: { status: string; interested: number; responses: number; audienceCount?: number | null }): {
  label: string;
  tone: "" | "warn" | "neutral";
  next: string;
} {
  const open = r.status === "sent" || r.status === "open";
  if (open) {
    const everyone = !!r.audienceCount && r.responses >= r.audienceCount;
    if (r.interested > 0 && everyone) return { label: "Ready to choose", tone: "", next: "Choose a colleague" };
    if (r.interested > 0) return { label: `${r.interested} interested`, tone: "warn", next: "Review replies" };
    if (everyone) return { label: "No one available", tone: "warn", next: "Widen the search" };
    if (r.responses > 0) return { label: "Replies coming in", tone: "warn", next: "View replies" };
    return { label: "Awaiting replies", tone: "warn", next: "View" };
  }
  const s = STATUS_LABEL[r.status] || { label: r.status, tone: "neutral" as const };
  const next = r.status === "connected" ? "Complete handoff" : r.status === "handoff" ? "Open handoff" : "View";
  return { ...s, next };
}

const STATUS_LABEL: Record<string, { label: string; tone: "" | "warn" | "neutral" }> = {
  sent: { label: "Awaiting replies", tone: "warn" },
  open: { label: "Awaiting replies", tone: "warn" },
  connected: { label: "Accepted", tone: "" },
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
  start,
}: {
  // Values to show in the green card (the demos use this; the page doesn't).
  start?: NeedValues;
  options: NeedOptions;
  mine: ReferralListItem[];
  offered: ReceivedItem[];
  ok?: string;
  error?: string;
}) {
  return (
    <>
      <FirstVisit id="refer" what="Refer" length="90-second" exampleHref={`${TOUR_URL}/refer`} />
      <PageHead
        eyebrow="Refer"
        title="Refer"
        lead="Describe the need and the state, see colleagues who fit and why, then choose who receives it. No client details, and nothing is sent until you review."
      />
      <Banner ok={ok} error={error} />
      <form className="quick-search" method="get" action="/dashboard/refer/new" id="start-referral">
        <input type="hidden" name="step" value="shortlist" />
        <h3>Start a referral</h3>
        <NeedFields options={options} values={start} compact refineInline />
        <div className="row wrap" style={{ marginTop: 14, gap: 12 }}>
          <button type="submit" className="btn">Find colleagues</button>
        </div>
        <p className="small" style={{ color: "#cfe0d4", margin: "10px 0 0" }}>No client details. Nothing is sent until you review.</p>
      </form>
      <div className="split equal list-pair" style={{ marginTop: 20 }}>
        <ListPanel
          icon={<NavIcon name="refer" size={19} />}
          title="Referrals You’ve Sent Out"
          description="Clients you’ve passed on, and how colleagues replied."
          count={mine.length}
          empty={<QuietEmpty title="No referrals yet." body="When you can't take a client, start above: describe the need and PsyAlliance shortlists the right colleagues." />}
        >
          {mine.length > 0 && (
            <HistoryList
              items={mine.map((r) => {
                const s = sentState(r);
                return {
                  key: r.id,
                  href: `/dashboard/refer/${r.id}`,
                  title: r.focus,
                  meta: [r.where, `${r.responses}${r.audienceCount ? ` of ${r.audienceCount}` : ""} replied`, `Sent ${shortDate(r.createdAt)}`],
                  tone: s.tone,
                  label: s.label,
                  action: s.action,
                  date: r.createdAt,
                };
              })}
            />
          )}
        </ListPanel>
        <ListPanel
          icon={<NavIcon name="messages" size={19} />}
          tone="brass"
          title="Referrals You’ve Received"
          description="Clients colleagues asked you to take, and what happened."
          count={offered.length}
          empty={
            <QuietEmpty
              title="Nothing waiting for you."
              body="Referrals that fit your profile and availability, sent to you by colleagues, appear here. Keeping your availability current helps colleagues find you."
              action={<a className="btn secondary small-btn" href="/dashboard/availability?back=%2Fdashboard%2Frefer">Update availability</a>}
            />
          }
        >
          {offered.length > 0 && (
            <HistoryList
              items={offered.map((r) => {
                const s = receivedState(r);
                return {
                  key: r.id,
                  href: `/dashboard/refer/${r.id}`,
                  title: r.focus,
                  meta: [`From ${r.from}`, r.where, shortDate(r.createdAt)],
                  tone: s.tone,
                  label: s.label,
                  action: s.action,
                  date: r.createdAt,
                };
              })}
            />
          )}
        </ListPanel>
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
  requesterId?: string;
  chosen: { profileId: string; name: string } | null;
  rated: boolean;
  audienceCount?: number | null;
  // Conversations about this referral, by the other person's profile id.
  threads?: Record<string, { conversationId: number | null; messages: ThreadMessage[] }>;
  meId?: string;
};

// Interested is green, a question amber, not available red: the same
// colours as availability (Nick, 18 Oct).
const RESPONSE_LABEL: Record<string, { label: string; tone: "" | "warn" | "neutral" | "danger" }> = {
  interested: { label: "Interested", tone: "" },
  accepted: { label: "Chosen", tone: "" },
  question: { label: "Has a question", tone: "warn" },
  unavailable: { label: "Not available", tone: "danger" },
  offered: { label: "Offered to help", tone: "" },
  declined: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};
const ANSWER_TONE: Record<string, string> = { interested: "green", accepted: "green", offered: "green", question: "amber", unavailable: "red", declined: "red" };

// "final": after a question, the answer is Interested or Not available.
function ReplyForm({ id, current, heading, threadTitle, final = false }: { id: number; current: string; heading?: string; threadTitle: string; final?: boolean }) {
  return (
    <form action={respondReferralAction} data-deidentify="">
      <input type="hidden" name="referral_request_id" value={id} />
      <input type="hidden" name="thread_title" value={threadTitle} />
      {heading && <h3>{heading}</h3>}
      {/* The same colours as setting your availability (Nick, 18 Oct). */}
      <label className="radio-card answer-green"><input type="radio" name="response" value="interested" defaultChecked={current === "interested"} /><span><b>Interested</b><span>I have capacity and this fits my practice.</span></span></label>
      {!final && (
        <label className="radio-card answer-amber"><input type="radio" name="response" value="question" defaultChecked={current === "question"} /><span><b>I have a question</b><span>Ask before deciding. The conversation stays here, on this referral.</span></span></label>
      )}
      <label className="radio-card answer-red"><input type="radio" name="response" value="unavailable" defaultChecked={current === "unavailable"} /><span><b>Not available</b><span>No capacity right now.</span></span></label>
      <label className="field" style={{ marginTop: 10 }}>
        {final ? "Message (optional)" : "Message or question"}
        <textarea name="message" maxLength={500} placeholder={final ? "e.g. I have two openings on Tuesday evenings." : "e.g. I have two openings on Tuesday evenings. Or your question."} />
        <small>No client-identifying details.</small>
      </label>
      <div className="step-actions"><span /><button type="submit" className="btn">Send reply</button></div>
    </form>
  );
}

export function referralThreadTitle(focus: string, where: string) {
  return `Referral · ${focus} · ${where}`;
}

export function ReferTrackView({ r, ok, error }: { r: ReferralDetail; ok?: string; error?: string }) {
  const s = referralStatus({
    status: r.status,
    interested: r.responses.filter((x) => x.status === "interested" || x.status === "question").length,
    responses: r.responses.length,
    audienceCount: r.audienceCount,
  });
  const open = r.status === "sent" || r.status === "open";
  const threadTitle = referralThreadTitle(r.focus, r.where);
  const firstOf = (name: string) => name.replace(/^(dr\.?)\s+/i, "").split(/[\s,]+/)[0];
  const needCard = (
    <section className="card tint">
      <div className="eyebrow">The need</div>
      <h3>{r.focus}</h3>
      <SummaryList rows={r.rows} />
      {r.notes && <p className="small" style={{ marginTop: 10 }}>&ldquo;{r.notes}&rdquo;</p>}
    </section>
  );
  return (
    <>
      <PageHead
        eyebrow={r.isMine ? "Refer / your referral" : `Refer / from ${r.requesterName}`}
        title={r.focus}
        lead={`${r.where} · sent ${shortDate(r.createdAt)}`}
        actions={<a className="btn secondary" href="/dashboard/refer">All referrals</a>}
      />
      {r.isMine && <Progress steps={STEPS} current={3} />}
      <Banner ok={ok} error={error} />
      <div className="split">
        <div className="stack">
          {/* A colleague who received it reads the need first, then replies (Nick, 13 Oct). */}
          {!r.isMine && needCard}
          {r.isMine ? (
            <section className="card">
              <div className="card-title">
                <h3>Responses</h3>
                <Status tone={s.tone}>{s.label}</Status>
              </div>
              {r.responses.length === 0 ? (
                open ? (
                  <Empty symbol={"✉"} title="No replies yet." body="Colleagues who receive this referral can reply Interested, Not available, or ask a question. You'll be notified." />
                ) : (
                  <Empty symbol={"✉"} title="Closed with no replies." body="No one replied before this referral was closed. Start a new referral if the client still needs someone." action={<a className="btn secondary small-btn" href="/dashboard/refer">Start a referral</a>} />
                )
              ) : (
                r.responses.map((resp) => {
                  const rl = RESPONSE_LABEL[resp.status] || { label: resp.status, tone: "neutral" as const };
                  return (
                    <div key={resp.profileId} className="mini-person" id={`resp-${resp.profileId}`}>
                      <PersonAvatar name={resp.name} url={resp.avatarUrl} id={resp.profileId} />
                      <div className="content">
                        <div className="row between">
                          <h3><a href={`/dashboard/people/${resp.profileId}`}>{resp.name}</a></h3>
                          <Status tone={rl.tone}>{rl.label}</Status>
                        </div>
                        {(() => {
                          const t = r.threads?.[resp.profileId];
                          // A question, or any conversation already under way, shows here.
                          if (resp.status === "question" || (t && t.messages.length > 0)) {
                            return (
                              <InlineThread
                                messages={t?.messages.length ? t.messages : resp.message ? [{ id: 0, mine: false, author: resp.name, body: resp.message, at: r.createdAt }] : []}
                                conversationId={t?.conversationId}
                                otherName={resp.name}
                                otherIds={[resp.profileId]}
                                title={threadTitle}
                                heading={resp.status === "question" ? `${firstOf(resp.name)} has a question` : `Conversation with ${firstOf(resp.name)}`}
                                returnTo={`/dashboard/refer/${r.id}`}
                                anchor={`resp-${resp.profileId}`}
                                link={`/dashboard/refer/${r.id}#your-reply`}
                                placeholder={resp.status === "question" ? `Answer ${firstOf(resp.name)}…` : undefined}
                              />
                            );
                          }
                          return resp.message ? <p>&ldquo;{resp.message}&rdquo;</p> : null;
                        })()}
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
            <section className="card" id="your-reply">
              <div className="eyebrow">Your reply</div>
              {r.myResponse && r.myResponse.status === "question" && open && !r.chosen ? (
                // After a question: the conversation with the colleague who
                // referred, in place, and (folded away) the final answer.
                <div className="reply-summary is-question tone-amber">
                  <h3>You asked {firstOf(r.requesterName)} a question</h3>
                  {r.requesterId ? (
                    <InlineThread
                      messages={
                        r.threads?.[r.requesterId]?.messages.length
                          ? r.threads[r.requesterId].messages
                          : r.myResponse.message
                            ? [{ id: 0, mine: true, author: "You", body: r.myResponse.message, at: r.createdAt }]
                            : []
                      }
                      conversationId={r.threads?.[r.requesterId]?.conversationId}
                      otherName={r.requesterName}
                      otherIds={[r.requesterId]}
                      title={threadTitle}
                      heading={`Your conversation with ${firstOf(r.requesterName)}`}
                      returnTo={`/dashboard/refer/${r.id}`}
                      anchor="your-reply"
                      link={`/dashboard/refer/${r.id}${r.meId ? `#resp-${r.meId}` : ""}`}
                    />
                  ) : (
                    r.myResponse.message && <blockquote className="reply-quote">&ldquo;{r.myResponse.message}&rdquo;</blockquote>
                  )}
                  <p className="micro-note">Once you&rsquo;ve talked it through, give your final answer.</p>
                  <details className="final-answer">
                    <summary>Give your final answer</summary>
                    <ReplyForm id={r.id} current="interested" threadTitle={threadTitle} final />
                  </details>
                </div>
              ) : r.myResponse ? (
                <div className={`reply-summary tone-${ANSWER_TONE[r.myResponse.status] || "grey"}`}>
                  <h3>You replied: {(RESPONSE_LABEL[r.myResponse.status] || { label: r.myResponse.status }).label}</h3>
                  {r.myResponse.message && <blockquote className="reply-quote">&ldquo;{r.myResponse.message}&rdquo;</blockquote>}
                  {r.requesterId && (r.threads?.[r.requesterId]?.messages.length || 0) > 0 && (
                    <InlineThread
                      messages={r.threads![r.requesterId].messages}
                      conversationId={r.threads![r.requesterId].conversationId}
                      otherName={r.requesterName}
                      otherIds={[r.requesterId]}
                      title={threadTitle}
                      heading={`Your conversation with ${firstOf(r.requesterName)}`}
                      returnTo={`/dashboard/refer/${r.id}`}
                      anchor="your-reply"
                      link={`/dashboard/refer/${r.id}${r.meId ? `#resp-${r.meId}` : ""}`}
                    />
                  )}
                  {r.chosen && <p className="small">{r.requesterName} has chosen a colleague for this referral.</p>}
                  {open && !r.chosen && (
                    <details className="final-answer">
                      <summary>Change your reply</summary>
                      <ReplyForm id={r.id} current={r.myResponse.status} threadTitle={threadTitle} final />
                    </details>
                  )}
                </div>
              ) : open ? (
                <ReplyForm id={r.id} current="interested" heading="Can you take this referral?" threadTitle={threadTitle} />
              ) : (
                <p>This referral is no longer open.</p>
              )}
            </section>
          )}

          {r.isMine && r.chosen && r.status !== "closed" && (
            <section className="card tint">
              <div className="eyebrow">Handoff</div>
              <h3>You chose {r.chosen.name}.</h3>
              <p className="small">{HANDOFF_RULE} Close the referral once the client is placed.</p>
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
          {r.isMine && needCard}
          {r.isMine && open && (
            <section className="card">
              <h3>Close without placing</h3>
              <p className="small">If the client no longer needs a referral, close it so colleagues stop seeing it.</p>
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
