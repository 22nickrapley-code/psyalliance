import type { NeedOptions } from "@/lib/need-options";
import { Banner, Status } from "./_components/ui";
import { reconfirmAvailability } from "./availability/actions";
import { HomeTiles } from "./home-client";
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
};

export type HomeData = {
  firstName: string;
  today?: string;
  greeting?: string;
  steps: NextStep[];
  gettingStarted: { label: string; done: boolean; href: string }[] | null;
  availability: {
    referrals: string;
    cover: string;
    consult: string;
    confirmedLabel: string;
    stale: boolean;
    canReconfirm: boolean;
  };
  options?: NeedOptions;
  notice?: string;
  sandbox?: boolean;
  // Older fields some previews still pass; Home no longer shows them.
  startHere?: unknown;
  relevant?: unknown;
  circle?: unknown;
  resources?: unknown;
};

export function HomeView({ d }: { d: HomeData }) {
  const n = d.steps.length;
  const urgent = d.steps.filter((s) => s.urgent).length;
  const summary = d.gettingStarted
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
      <div className="page-head">
        <div>
          <div className="eyebrow">{d.today || "Your practice"}</div>
          <h1>{d.greeting || "Welcome back"}, {d.firstName}.</h1>
          <p>{summary}</p>
        </div>
      </div>
      <Banner ok={d.notice} />

      {d.gettingStarted && (
        <section className="card getting-started">
          <div className="card-title"><h3>Getting started</h3></div>
          <p className="small">
            {d.gettingStarted.length === 4
              ? "Referrals, cover, consults and messages open once your credentials are verified. Here's what gets you there."
              : "Three steps make the network useful to you from day one."}
          </p>
          {d.gettingStarted.map((g, i) => (
            <div key={g.label} className="step-item">
              <span className="row" style={{ gap: 14 }}>
                <span className="round-number">{g.done ? "✓" : i + 1}</span>
                <strong style={{ textDecoration: g.done ? "line-through" : undefined }}>{g.label}</strong>
              </span>
              {!g.done && i < 3 && <a className="btn secondary small-btn" href={g.href}>Start</a>}
              {!g.done && i === 3 && <Status tone="neutral">With us</Status>}
            </div>
          ))}
        </section>
      )}

      <h2 className="home-question">What would you like to do?</h2>
      <HomeTiles steps={d.steps} />

      <section className="availability-strip" aria-label="Your availability">
        <span className="label">Your availability</span>
        <span className="facts">
          <span><b>Referrals</b> {d.availability.referrals}</span>
          <span><b>Cover</b> {d.availability.cover}</span>
          <span><b>Consult</b> {d.availability.consult}</span>
        </span>
        <span className={`when${d.availability.stale ? " stale" : ""}`}>{d.availability.confirmedLabel}</span>
        <span className="strip-actions">
          {d.availability.canReconfirm && (
            <form action={reconfirmAvailability} className="inline">
              <input type="hidden" name="return_to" value="/dashboard" />
              <button type="submit" className="plain-button small">Still accurate</button>
            </form>
          )}
          <a className="text-arrow" href="/dashboard/availability">Change &rarr;</a>
        </span>
      </section>
    </div>
  );
}
