import type { NeedOptions } from "@/lib/need-options";
import { libraryHref } from "@/lib/library";
import { stateName, stateList } from "@/lib/open-states";
import { openSandboxAction } from "./sandbox/actions";
import { Banner, Status } from "./_components/ui";
import { reconfirmAvailability } from "./availability/actions";
import { HomeTiles } from "./home-client";
import { OnceNote } from "./_components/once-note";
import type { CircleNode } from "./_components/orbit";

export type { CircleNode };

// Home answers two questions and nothing else: what would you like to do,
// and does anything need you? Five tiles carry both. The four jobs lead;
// the fifth, Actions, shows how many things are waiting and opens the
// list in place. Availability sits underneath as one line.

export type NextStep = {
  key: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  urgent?: boolean;
  rank?: number;
  // The colleague this is about, when there's one: their name links to them.
  person?: { id: string; name: string };
};

export type Tone = "open" | "limited" | "closed" | "unset";

export type CircleSnapshot = {
  trusted: number;
  referrals: number;
  cover: number;
  people: { id: string; name: string; avatarUrl: string | null; open: boolean }[];
};

export type HomeData = {
  firstName: string;
  today?: string;
  greeting?: string;
  steps: NextStep[];
  statusLine?: string;
  gettingStarted: { label: string; done: boolean; href: string; waiting?: boolean }[] | null;
  setupNote?: string | null;
  justVerified?: string | null;
  awaitingVerification?: boolean;
  access?: { verified: boolean; openStates: string[]; waitlist: { state: string; position: number; waiting: number }[] } | null;
  error?: string | null;
  availability: {
    referrals: string;
    cover: string;
    consult: string;
    confirmedLabel: string;
    stale: boolean;
    canReconfirm: boolean;
    tones?: { referrals: Tone; cover: Tone; consult: Tone };
  };
  circleSnapshot?: CircleSnapshot;
  ledger?: string[];
  ledgerYear?: number;
  options?: NeedOptions;
  notice?: string;
  sandbox?: boolean;
  // Older fields some previews still pass; Home no longer shows them.
  startHere?: unknown;
  relevant?: unknown;
  circle?: unknown;
  resources?: unknown;
};

const initialsOf = (name: string) =>
  name
    .replace(/^(dr\.?)\s+/i, "")
    .replace(/,.*$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

// "Cover: ask me" reads oddly beside a "Cover" label.
const plain = (label: string) => {
  const t = label.replace(/^Cover:\s*/i, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function AvailabilityCard({ a }: { a: HomeData["availability"] }) {
  const rows: [string, string, Tone][] = [
    ["Referrals", plain(a.referrals), a.tones?.referrals || "unset"],
    ["Cover", plain(a.cover), a.tones?.cover || "unset"],
    ["Consult", plain(a.consult), a.tones?.consult || "unset"],
  ];
  return (
    <section className="card home-card avail-card" aria-labelledby="avail-title">
      <div className="home-card-head">
        <div>
          <div className="eyebrow">What colleagues see</div>
          <h3 id="avail-title">Your availability</h3>
        </div>
        <span className={`avail-when${a.stale ? " stale" : ""}`}>{a.confirmedLabel}</span>
      </div>
      <ul className="avail-rows">
        {rows.map(([k, v, tone]) => (
          <li key={k}>
            <span className={`avail-dot ${tone}`} aria-hidden="true" />
            <span className="k">{k}</span>
            <span className="v">{v}</span>
          </li>
        ))}
      </ul>
      <div className="home-card-actions">
        {a.canReconfirm && (
          <form action={reconfirmAvailability} className="inline">
            <input type="hidden" name="return_to" value="/dashboard" />
            <button type="submit" className="btn secondary small-btn">Still accurate</button>
          </form>
        )}
        <a className="btn ghost small-btn" href="/dashboard/availability?back=%2Fdashboard">Update &rarr;</a>
      </div>
    </section>
  );
}

function CircleCard({ c }: { c?: CircleSnapshot }) {
  if (!c || c.trusted === 0) {
    return (
      <section className="card home-card circle-snap empty" aria-labelledby="circle-title">
        <div className="eyebrow">Your network</div>
        <h3 id="circle-title">Start with the colleagues you already trust</h3>
        <p className="small">Trusted colleagues come first in every match, for referrals, cover and questions. Add two or three to begin, the way you&rsquo;d count the colleagues in a group practice.</p>
        <div className="home-card-actions">
          <a className="btn small-btn" href="/dashboard/clinicians">Find clinicians</a>
        </div>
      </section>
    );
  }
  const extra = c.trusted - c.people.length;
  return (
    <section className="card home-card circle-snap" aria-labelledby="circle-title">
      <div className="home-card-head">
        <div>
          <div className="eyebrow">Your network today</div>
          <h3 id="circle-title">
            {c.trusted} trusted colleague{c.trusted === 1 ? "" : "s"}
          </h3>
        </div>
      </div>
      <div className="face-stack" aria-hidden="true">
        {c.people.map((p) => (
          <span key={p.id} className={`face${p.open ? " open" : ""}`} title={p.name}>
            {p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarUrl} alt="" />
            ) : (
              initialsOf(p.name)
            )}
          </span>
        ))}
        {extra > 0 && <span className="face more">+{extra}</span>}
      </div>
      <ul className="circle-facts">
        <li><b>{c.referrals}</b> taking referrals</li>
        <li><b>{c.cover}</b> open for cover</li>
      </ul>
      <div className="home-card-actions">
        <a className="btn ghost small-btn" href="/dashboard/network">See your network &rarr;</a>
      </div>
    </section>
  );
}

const WHILE_REVIEW: [string, string, string][] = [
  ["PA-03", "Professional Will & Succession Plan", "Who looks after your clients and records if you can't."],
  ["PA-02", "Extended Leave Pack", "Step away for more than two weeks without stranding clients."],
  ["PA-01", "Reciprocal Coverage Agreement", "A standing cover arrangement with a colleague you trust."],
];

export function HomeView({ d }: { d: HomeData }) {
  const n = d.steps.length;
  const urgent = d.steps.filter((s) => s.urgent).length;
  const summary = d.setupNote
    ? "Your set-up is complete."
    : d.access?.verified
    ? "You're verified. Your state opens as colleagues join."
    : d.gettingStarted
    ? "A few steps and you're in the network."
    : n === 0
      ? d.sandbox
        ? "Nothing needs you yet. Try one of the four below; colleagues will start getting in touch as you look around."
        : "Nothing needs you right now."
      : urgent > 0
        ? `${n} thing${n === 1 ? "" : "s"} to look at, ${urgent} urgent.`
        : `${n} thing${n === 1 ? "" : "s"} to look at when you're ready.`;

  return (
    <div className="home-simple">
      <header className="member-home-hero">
        <div className="eyebrow">{d.today || "Your practice"}</div>
        <h1>{d.greeting || "Welcome back"}, {d.firstName}.</h1>
        <p>{summary}</p>
      </header>
      <Banner ok={d.notice} error={d.error} />
      {d.justVerified && (
        <OnceNote
          id={`verified-${d.justVerified}`}
          eyebrow="Verified"
          title="Well done for completing your set-up."
          body="Your credentials have been reviewed and verified. You're now free to use PsyAlliance: referrals, cover, consults and messages are all open."
          action={{ href: "/dashboard/clinicians", label: "Find your colleagues" }}
        />
      )}
      {d.setupNote && (
        <section className="once-note waiting" role="status">
          <span className="once-seal" aria-hidden="true">&#10003;</span>
          <div className="once-copy">
            <div className="eyebrow">Set-up complete</div>
            <h3>{d.setupNote.split(". ")[0]}.</h3>
            <p>{d.setupNote.split(". ").slice(1).join(". ")}</p>
          </div>
        </section>
      )}

      {d.gettingStarted && (
        <section className="card getting-started">
          <div className="card-title"><h3>Getting started</h3></div>
          <p className="small">
            {d.access?.verified
              ? "You're verified. Referrals, cover, consults and messages open when PsyAlliance opens in your state; meanwhile, try them all in your sandbox."
              : d.awaitingVerification
              ? "Referrals, cover, consults and messages open once your license is verified. Here's what gets you there."
              : "A few steps make the network useful to you from day one."}
          </p>
          {d.gettingStarted.map((g, i) => (
            <div key={g.label} className="step-item">
              <span className="row" style={{ gap: 14 }}>
                <span className="round-number">{g.done ? "✓" : i + 1}</span>
                <strong style={{ textDecoration: g.done ? "line-through" : undefined }}>{g.label}</strong>
              </span>
              {!g.done && !g.waiting && <a className="btn secondary small-btn" href={g.href}>Start</a>}
              {!g.done && g.waiting && <Status tone="neutral">With us</Status>}
            </div>
          ))}
        </section>
      )}

      {d.access && (
        <section className="card while-review" id="explore">
          <div className="card-title">
            <h3>{d.access.verified ? "While your state opens" : "While we check your license"}</h3>
          </div>
          {d.access.waitlist.length > 0 && (
            <div className="waitlist-note">
              {d.access.waitlist.map((w) => (
                <p key={w.state}>
                  PsyAlliance opens in <b>{stateName(w.state)}</b> when enough colleagues join. You&rsquo;re number <b>{w.position}</b> of {w.waiting} on the{" "}
                  {stateName(w.state)} list.
                </p>
              ))}
              {d.access.openStates.length > 0 && <p className="micro-note">Open now in {stateList(d.access.openStates)}.</p>}
            </div>
          )}
          <div className="explore-grid">
            <div className="explore-item">
              <b>Try it with fictional colleagues</b>
              <small>Your own sandbox: cover, referrals, consults and messages with invented clinicians. Nothing reaches the real network.</small>
              <form action={openSandboxAction}>
                <button type="submit" className="btn small-btn">Open your sandbox</button>
              </form>
            </div>
            <div className="explore-item">
              <b>Explore the guided demos</b>
              <small>Six short walk-throughs of the real screens, a minute or two each.</small>
              <a className="btn secondary small-btn" href="/tour">Explore the guided demos</a>
            </div>
          </div>
          <p className="small" style={{ margin: "16px 0 0" }}>The Practice Library is open to you now. Three templates members start with:</p>
          <ul className="while-review-list">
            {WHILE_REVIEW.map(([code, title, line]) => (
              <li key={code}>
                <span><b>{title}</b><small>{line}</small></span>
                <a className="btn secondary small-btn" href={libraryHref(code)}>Explore</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-ask" aria-labelledby="home-question">
        <h2 className="home-question" id="home-question">What would you like to do?</h2>
        <HomeTiles steps={d.steps} />
        {d.statusLine && <p className="home-status">{d.statusLine}</p>}
      </section>

      {d.ledger && d.ledger.length > 0 && (
        <section className="home-ledger" aria-label={`Your ${d.ledgerYear || "year"} on PsyAlliance`}>
          <span className="home-ledger-label">{d.ledgerYear} on PsyAlliance</span>
          <ul>
            {d.ledger.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </section>
      )}

      <div className="home-lower">
        <AvailabilityCard a={d.availability} />
        <CircleCard c={d.circleSnapshot} />
      </div>
    </div>
  );
}
