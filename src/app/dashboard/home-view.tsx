import type { NeedOptions } from "@/lib/need-options";
import { Banner, Status, NeedFields, Empty } from "./_components/ui";
import { reconfirmAvailability } from "./availability/actions";

// Home (Product Spec v1): answers one question, "what needs me right
// now?". An action queue, the member's availability signal, a quick
// referral search, four task entry points, relevant requests, a compact
// circle summary and one or two resources for the moment.

export type NextStep = {
  key: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  urgent?: boolean;
};

export type HomeData = {
  firstName: string;
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
  relevant: { key: string; title: string; detail: string; why: string; href: string }[];
  circle: { trusted: number; saved: number; workedWith: number; newThisMonth: number; recentlyAvailable: string[] };
  resources: { code: string; title: string; purpose: string; href: string }[];
  options: NeedOptions;
  notice?: string;
};

export function HomeView({ d }: { d: HomeData }) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your practice</div>
          <h1>Welcome back, {d.firstName}.</h1>
          <p>A clear view of what needs your attention, and who can help.</p>
        </div>
        <div className="head-actions">
          <a className="btn" href="/dashboard/refer/new">Refer a patient</a>
          <a className="btn secondary" href="/dashboard/cover/new">Plan cover</a>
        </div>
      </div>
      <Banner ok={d.notice} />

      <div className="split">
        <section className="card">
          <div className="card-title">
            <h3>{d.gettingStarted ? "Getting started" : "Your next steps"}</h3>
            {!d.gettingStarted && <span className="micro-note">{d.steps.length} to review</span>}
          </div>
          {d.gettingStarted ? (
            <>
              <p className="small">Three steps make the network useful to you from day one.</p>
              {d.gettingStarted.map((g, i) => (
                <div key={g.label} className="item row between">
                  <span className="row">
                    <span className="round-number">{g.done ? "✓" : i + 1}</span>
                    <strong style={{ textDecoration: g.done ? "line-through" : undefined }}>{g.label}</strong>
                  </span>
                  {!g.done && <a className="btn secondary small-btn" href={g.href}>Start</a>}
                </div>
              ))}
            </>
          ) : d.steps.length === 0 ? (
            <Empty symbol={"✓"} title="You're all caught up." body="Nothing needs you right now. New referrals, cover requests and replies will appear here as they happen." />
          ) : (
            d.steps.map((s, i) => (
              <div key={s.key} className="item row between">
                <span className="row" style={{ alignItems: "flex-start" }}>
                  <span className="round-number">{i + 1}</span>
                  <span>
                    <strong>{s.title}</strong>
                    <p>{s.detail}</p>
                  </span>
                </span>
                <span className="row">
                  {s.urgent && <Status tone="danger">Urgent</Status>}
                  <a className="btn secondary small-btn" href={s.href}>{s.action}</a>
                </span>
              </div>
            ))
          )}
        </section>

        <section className="card tint">
          <div className="card-title">
            <h3>Your availability</h3>
            <a className="plain-button small" href="/dashboard/availability">Manage</a>
          </div>
          <ul className="summary-list">
            <li><span>Referrals</span><strong>{d.availability.referrals}</strong></li>
            <li><span>Cover</span><strong>{d.availability.cover}</strong></li>
            <li><span>Consult</span><strong>{d.availability.consult}</strong></li>
          </ul>
          <p className={`micro-note`} style={{ marginTop: 10, color: d.availability.stale ? "#865b2b" : undefined }}>
            {d.availability.confirmedLabel}
          </p>
          {d.availability.canReconfirm ? (
            <form action={reconfirmAvailability}>
              <input type="hidden" name="return_to" value="/dashboard" />
              <button type="submit" className="btn secondary small-btn">Still accurate, reconfirm</button>
            </form>
          ) : (
            <a className="btn secondary small-btn" href="/dashboard/availability">Set your availability</a>
          )}
        </section>
      </div>

      <form className="quick-search" method="get" action="/dashboard/refer/new" style={{ marginTop: 20 }}>
        <input type="hidden" name="step" value="shortlist" />
        <h3>Quick referral search</h3>
        <NeedFields options={d.options} compact />
        <div className="row wrap" style={{ marginTop: 14 }}>
          <button type="submit" className="btn">Find colleagues</button>
          <span className="small" style={{ color: "#cfe0d4" }}>No patient details. Nothing is sent until you review.</span>
        </div>
      </form>

      <div className="section-heading"><h2>What would you like to do?</h2></div>
      <div className="tile-grid">
        <a className="task-tile" href="/dashboard/cover/new"><span className="symbol">{"◇"}</span><b>Find cover</b><span>Plan an absence, one case or all.</span></a>
        <a className="task-tile" href="/dashboard/refer/new"><span className="symbol">{"↗"}</span><b>Refer a patient</b><span>Find the right colleague.</span></a>
        <a className="task-tile" href="/dashboard/consult"><span className="symbol">{"✳"}</span><b>Ask colleagues</b><span>Start a consultation.</span></a>
        <a className="task-tile" href="/dashboard/network"><span className="symbol">{"◎"}</span><b>Find a clinician</b><span>Search your network.</span></a>
      </div>

      <div className="section-heading">
        <h2>From your circle</h2>
        <a className="plain-button small" href="/dashboard/network">View network &rarr;</a>
      </div>
      <div className="split">
        <section className="card">
          <div className="card-title"><h3>Relevant requests</h3>{d.relevant.length > 0 && <Status>{d.relevant.length} new</Status>}</div>
          {d.relevant.length === 0 ? (
            <div className="quiet-panel">
              <strong className="small">Nothing matches your practice right now.</strong>
              <p className="small" style={{ margin: "5px 0 0" }}>Referrals and cover requests that fit your specialties, licence and availability appear here. Keeping availability current helps colleagues find you.</p>
            </div>
          ) : (
            d.relevant.map((r) => (
              <a key={r.key} href={r.href} className="item row between" style={{ textDecoration: "none", color: "inherit" }}>
                <span>
                  <strong>{r.title}</strong>
                  <p>{r.detail} &middot; <span style={{ color: "var(--forest)" }}>{r.why}</span></p>
                </span>
                <span className="plain-button small">Open &rarr;</span>
              </a>
            ))
          )}
        </section>
        <aside className="stack">
          <section className="card">
            <div className="card-title"><h3>Your circle</h3><span className="micro-note">Built over time</span></div>
            <div className="row" style={{ gap: 22 }}>
              <span><span className="metric">{d.circle.trusted}</span><br /><span className="micro-note">Trusted</span></span>
              <span><span className="metric">{d.circle.workedWith}</span><br /><span className="micro-note">Worked with</span></span>
              <span><span className="metric">{d.circle.saved}</span><br /><span className="micro-note">Saved</span></span>
            </div>
            <p className="small" style={{ marginTop: 12, marginBottom: 0 }}>
              {d.circle.newThisMonth > 0 ? `${d.circle.newThisMonth} new connection${d.circle.newThisMonth === 1 ? "" : "s"} this month. ` : ""}
              {d.circle.recentlyAvailable.length > 0
                ? `${d.circle.recentlyAvailable.slice(0, 2).join(" and ")}${d.circle.recentlyAvailable.length > 2 ? ` and ${d.circle.recentlyAvailable.length - 2} more` : ""} recently confirmed they're taking referrals.`
                : d.circle.trusted === 0
                  ? "Invite colleagues you already trust to start your circle."
                  : ""}
            </p>
          </section>
          {d.resources.length > 0 && (
            <section className="card tint">
              <div className="eyebrow">Practice Library</div>
              <h3>For this moment</h3>
              {d.resources.map((r) => (
                <a key={r.code} href={r.href} className="item" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                  <strong>{r.code} &middot; {r.title}</strong>
                  <p>{r.purpose}</p>
                </a>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
