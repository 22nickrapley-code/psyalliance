"use client";

import { useState } from "react";
import type { NextStep } from "./home-view";
import { NavIcon } from "./icons";

// Each action belongs to a part of PsyAlliance, shown by its colour and
// icon: cover, referrals, consult, your network, messages or your record.
const AREAS: Record<string, { icon: string; label: string }> = {
  cover: { icon: "cover", label: "Cover" },
  refer: { icon: "refer", label: "Referral" },
  consult: { icon: "consult", label: "Consult" },
  network: { icon: "network", label: "Network" },
  messages: { icon: "messages", label: "Messages" },
  record: { icon: "credentials", label: "Your record" },
};
const areaOf = (key: string) =>
  /^(cover|plan)-/.test(key) ? "cover"
  : /^(ref|offer)-|^(offers|wider)$/.test(key) ? "refer"
  : /^consult/.test(key) ? "consult"
  : /^inv/.test(key) ? "network"
  : key === "msgs" ? "messages"
  : "record";

function ActionRow({ s }: { s: NextStep }) {
  const area = areaOf(s.key);
  const a = AREAS[area];
  const go = () => {
    window.location.href = s.href;
  };
  // The colleague's name links to their profile; the rest of the row opens
  // the action.
  let title: React.ReactNode = s.title;
  if (s.person && s.title.includes(s.person.name)) {
    const [before, after] = [s.title.slice(0, s.title.indexOf(s.person.name)), s.title.slice(s.title.indexOf(s.person.name) + s.person.name.length)];
    title = (
      <>
        {before}
        <a className="action-person" href={`/dashboard/people/${s.person.id}`} onClick={(e) => e.stopPropagation()}>{s.person.name}</a>
        {after}
      </>
    );
  }
  return (
    <div
      className={`action-row area-${area}${s.urgent ? " urgent" : ""}`}
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter") go();
      }}
    >
      <span className="action-icon" aria-hidden="true"><NavIcon name={a.icon} size={18} /></span>
      <span className="action-text">
        <span className="action-area">
          {a.label}
          {s.urgent && <span className="action-urgent">Urgent</span>}
        </span>
        <strong>{title}</strong>
        <small>{s.detail}</small>
      </span>
      <a className="action-go" href={s.href} onClick={(e) => e.stopPropagation()}>
        {s.action} <span aria-hidden="true">&rarr;</span>
      </a>
    </div>
  );
}

const JOBS: { href: string; icon: string; title: string; sub: string; accent: string }[] = [
  { href: "/dashboard/cover/new", icon: "cover", title: "Find cover", sub: "Plan time away and who sees your clients", accent: "forest" },
  { href: "/dashboard/refer/new", icon: "refer", title: "Refer a client", sub: "Find the right colleague for a client", accent: "brass" },
  { href: "/dashboard/consult/new", icon: "consult", title: "Ask colleagues", sub: "A second opinion, de-identified", accent: "blue" },
  { href: "/dashboard/network", icon: "network", title: "Find a clinician", sub: "Search the verified network", accent: "sage" },
];

// The four jobs, and a fifth tile for anything waiting. Actions opens its
// list in place, most urgent first.
export function HomeTiles({ steps }: { steps: NextStep[] }) {
  const [open, setOpen] = useState(false);
  const n = steps.length;
  const urgent = steps.filter((s) => s.urgent).length;
  return (
    <>
      <div className="home-tiles">
        {JOBS.map((j) => (
          <a key={j.href} className={`home-tile accent-${j.accent}`} href={j.href}>
            <span className="symbol"><NavIcon name={j.icon} size={22} /></span>
            <b>{j.title}</b>
            <span className="tile-sub">{j.sub}</span>
            <span className="tile-go" aria-hidden="true">&rarr;</span>
          </a>
        ))}
        <button
          type="button"
          className={`home-tile actions-tile${n > 0 ? " has-actions" : ""}${urgent ? " urgent" : ""}${open ? " open" : ""}`}
          aria-expanded={open}
          aria-controls="home-actions"
          onClick={() => setOpen(!open)}
          disabled={n === 0}
        >
          <span className="actions-top">
            <span className="actions-count">{n}</span>
            {urgent > 0 && <span className="actions-urgent">{urgent} urgent</span>}
          </span>
          <b>{n === 0 ? "Nothing waiting" : `Action${n === 1 ? "" : "s"} waiting`}</b>
          <span className="tile-sub">{n === 0 ? "You're up to date" : open ? "Hide the list" : "See what needs you"}</span>
          {n > 0 && <span className="tile-go" aria-hidden="true">{open ? "↑" : "↓"}</span>}
        </button>
      </div>
      {open && n > 0 && (
        <section id="home-actions" className="card home-actions">
          {steps.map((s) => (
            <ActionRow key={s.key} s={s} />
          ))}
        </section>
      )}
    </>
  );
}
