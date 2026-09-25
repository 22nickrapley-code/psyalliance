import type { NeedOptions } from "@/lib/need-options";
import { Banner, NeedFields, QuietEmpty, Status } from "./_components/ui";
import { reconfirmAvailability } from "./availability/actions";
import { StepsPager, OpenDialogButton, CloseDialogButton } from "./home-client";

// Home answers one question: "what needs me right now?". Next steps lead,
// three at a time with the urgent ones first; availability sits beside
// them; the member's circle is drawn as the people around them.

export type NextStep = {
  key: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  urgent?: boolean;
  rank?: number;
};

export type CircleNode = { id: string; name: string; kind: "trusted" | "worked" | "saved"; avatarUrl: string | null };

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
  relevant: { key: string; title: string; detail: string; why: string; href: string }[];
  circle: {
    trusted: number;
    saved: number;
    workedWith: number;
    newThisMonth: number;
    recentlyAvailable: string[];
    nodes?: CircleNode[];
    me?: { initials: string; avatarUrl: string | null };
  };
  resources: { code: string; title: string; purpose: string; href: string; provisional?: boolean }[];
  options: NeedOptions;
  notice?: string;
};

const initials = (name: string) =>
  name
    .replace(/,.*$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

// Trusted colleagues on the outer ring, people you've worked with and
// saved on the inner ring.
function Orbit({ nodes, me }: { nodes: CircleNode[]; me?: { initials: string; avatarUrl: string | null } }) {
  const outer = nodes.filter((n) => n.kind === "trusted").slice(0, 9);
  const inner = nodes.filter((n) => n.kind !== "trusted").slice(0, 6);
  const place = (list: CircleNode[], r: number, offset: number) =>
    list.map((n, i) => {
      const a = offset + (i / Math.max(list.length, 1)) * Math.PI * 2;
      return { n, left: Math.round(100 + r * Math.cos(a)), top: Math.round(100 + r * Math.sin(a)) };
    });
  return (
    <div className="orbit" aria-hidden="true">
      <span className="me">
        {me?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" />
        ) : (
          me?.initials || "You"
        )}
      </span>
      {[...place(outer, 88, -Math.PI / 2), ...place(inner, 58, -Math.PI / 3)].map(({ n, left, top }) => (
        <a key={n.id} className={`node ${n.kind}`} style={{ left, top }} href={`/dashboard/people/${n.id}`} title={n.name} tabIndex={-1}>
          {n.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={n.avatarUrl} alt="" />
          ) : (
            initials(n.name)
          )}
        </a>
      ))}
    </div>
  );
}

export function HomeView({ d }: { d: HomeData }) {
  const nodes = d.circle.nodes || [];
  const circleSize = d.circle.trusted + d.circle.workedWith + d.circle.saved;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{d.today || "Your practice"}</div>
          <h1>{d.greeting || "Welcome back"}, {d.firstName}.</h1>
          <p>A clear view of what needs your attention, and who can help.</p>
        </div>
        <div className="head-actions">
          <OpenDialogButton target="quick-referral" className="btn lg">
            Quick referral search &#8599;
          </OpenDialogButton>
        </div>
      </div>
      <Banner ok={d.notice} />

      <dialog id="quick-referral" className="quick-dialog" aria-labelledby="quick-referral-title">
        <form className="quick-search" method="get" action="/dashboard/refer/new">
          <input type="hidden" name="step" value="shortlist" />
          <div className="dialog-head">
            <div>
              <div className="eyebrow" style={{ color: "#e2c49c" }}>Refer</div>
              <h3 id="quick-referral-title">Quick referral search</h3>
            </div>
            <CloseDialogButton target="quick-referral" />
          </div>
          <NeedFields options={d.options} compact />
          <div className="row wrap" style={{ marginTop: 14 }}>
            <button type="submit" className="btn on-dark">Find colleagues</button>
            <span className="small" style={{ color: "#cfe0d4" }}>No patient details. Nothing is sent until you review.</span>
          </div>
        </form>
      </dialog>

      <div className="split">
        <section className="card">
          <div className="card-title">
            <h3>{d.gettingStarted ? "Getting started" : "Your next steps"}</h3>
            {!d.gettingStarted && d.steps.length > 0 && <span className="micro-note">{d.steps.length} to review</span>}
          </div>
          {d.gettingStarted ? (
            <>
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
            </>
          ) : d.steps.length === 0 ? (
            <QuietEmpty
              title="You're all caught up."
              body="Nothing needs you right now. New referrals, cover requests and replies appear here as they happen."
              action={<a className="btn secondary small-btn" href="/dashboard/refer/new">Make a referral</a>}
            />
          ) : (
            <StepsPager steps={d.steps} />
          )}
        </section>

        <section className="card tint">
          <div className="card-title">
            <h3>Your availability</h3>
            <a className="text-arrow" href="/dashboard/availability">Manage &#8599;</a>
          </div>
          <ul className="summary-list">
            <li><span>Referrals</span><strong>{d.availability.referrals}</strong></li>
            <li><span>Cover</span><strong>{d.availability.cover}</strong></li>
            <li><span>Consult</span><strong>{d.availability.consult}</strong></li>
          </ul>
          <p className="micro-note" style={{ marginTop: 12, color: d.availability.stale ? "#865b2b" : undefined }}>
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

      <div className="section-heading"><h2>What would you like to do?</h2></div>
      <div className="tile-grid">
        <a className="task-tile" href="/dashboard/cover/new"><span className="symbol">{"◇"}</span><b>Find cover</b><span>Plan an absence &#8599;</span></a>
        <a className="task-tile" href="/dashboard/refer/new"><span className="symbol">{"↗"}</span><b>Refer a patient</b><span>Find the right colleague &#8599;</span></a>
        <a className="task-tile" href="/dashboard/consult"><span className="symbol">{"✳"}</span><b>Ask colleagues</b><span>Start a consultation &#8599;</span></a>
        <a className="task-tile" href="/dashboard/network"><span className="symbol">{"◎"}</span><b>Find a clinician</b><span>Search your network &#8599;</span></a>
      </div>

      <div className="section-heading">
        <h2>From your circle</h2>
        <a className="text-arrow" href="/dashboard/network">View network &#8599;</a>
      </div>
      <div className="split equal">
        <section className="card">
          <div className="card-title">
            <h3>Relevant requests</h3>
            {d.relevant.length > 0 && <Status>{d.relevant.length} new</Status>}
          </div>
          {d.relevant.length === 0 ? (
            <QuietEmpty
              title="Nothing matches your practice right now."
              body="Referrals and cover requests that fit your specialties, licence and availability appear here. Keeping availability current helps colleagues find you."
            />
          ) : (
            d.relevant.map((r) => (
              <a key={r.key} href={r.href} className="list-row" style={{ textDecoration: "none", color: "inherit" }}>
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {r.detail} &middot; <span style={{ color: "var(--forest)" }}>{r.why}</span>
                  </small>
                </span>
                <span className="text-arrow">Open &#8599;</span>
              </a>
            ))
          )}
        </section>

        <section className="card">
          <div className="card-title">
            <h3>Your circle</h3>
            <span className="micro-note">Built over time</span>
          </div>
          {circleSize === 0 ? (
            <QuietEmpty
              title="Your circle starts with people you already trust."
              body="Invite colleagues you'd refer to today. Trusted colleagues rank first in every match."
              action={<a className="btn secondary small-btn" href="/dashboard/network">Find colleagues</a>}
            />
          ) : (
            <div className="circle-card">
              <Orbit nodes={nodes} me={d.circle.me} />
              <div>
                <div className="circle-legend">
                  <div><b>{d.circle.trusted}</b><i style={{ background: "#dce9e1", border: "1px solid #9fbcaa" }} />Trusted colleagues</div>
                  <div><b>{d.circle.workedWith}</b><i style={{ background: "#f1e5d5", border: "1px solid #d8bd97" }} />Worked with before</div>
                  <div><b>{d.circle.saved}</b><i style={{ background: "#e1eced", border: "1px solid #a9c3c7" }} />Saved</div>
                </div>
                <p className="small" style={{ margin: "14px 0 10px" }}>
                  {d.circle.newThisMonth > 0 ? `${d.circle.newThisMonth} new this month. ` : ""}
                  {d.circle.recentlyAvailable.length > 0
                    ? `${d.circle.recentlyAvailable.slice(0, 2).join(" and ")}${d.circle.recentlyAvailable.length > 2 ? ` and ${d.circle.recentlyAvailable.length - 2} more` : ""} confirmed this week they're taking referrals.`
                    : ""}
                </p>
                <a className="text-arrow" href="/dashboard/network?tab=trusted">See your circle &#8599;</a>
              </div>
            </div>
          )}
        </section>
      </div>

      {d.resources.length > 0 && (
        <>
          <div className="section-heading">
            <h2>For this moment</h2>
            <a className="text-arrow" href="/dashboard/documents">Practice Library &#8599;</a>
          </div>
          <div className="split equal">
            {d.resources.map((r) => (
              <a key={r.code} href={r.href} className="card" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="row between">
                  <span className="eyebrow">{r.code}</span>
                  <span className="micro-note" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className={`review-dot${r.provisional ? "" : " ok"}`} />
                    {r.provisional ? "Provisional, review pending" : "Reviewed"}
                  </span>
                </div>
                <h3 className="serif-title" style={{ fontSize: 21, margin: "10px 0 6px" }}>{r.title}</h3>
                <p className="small" style={{ margin: 0 }}>{r.purpose}</p>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
