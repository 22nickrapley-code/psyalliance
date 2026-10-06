"use client";

import { useState } from "react";
import type { NextStep } from "./home-view";
import { NavIcon } from "./icons";

const JOBS: { href: string; icon: string; title: string; sub: string }[] = [
  { href: "/dashboard/cover/new", icon: "cover", title: "Find cover", sub: "Plan time away" },
  { href: "/dashboard/refer/new", icon: "refer", title: "Refer a client", sub: "Find the right colleague" },
  { href: "/dashboard/consult/new", icon: "consult", title: "Ask colleagues", sub: "Get a second opinion" },
  { href: "/dashboard/network", icon: "network", title: "Find a clinician", sub: "Search your network" },
];

// The four jobs, and a fifth tile for anything waiting. Actions opens its
// list in place, most urgent first.
export function HomeTiles({ steps }: { steps: NextStep[] }) {
  const [open, setOpen] = useState(false);
  const n = steps.length;
  const urgent = steps.some((s) => s.urgent);
  return (
    <>
      <div className="home-tiles">
        {JOBS.map((j) => (
          <a key={j.href} className="home-tile" href={j.href}>
            <span className="symbol"><NavIcon name={j.icon} size={26} /></span>
            <b>{j.title}</b>
            <span>{j.sub}</span>
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
          <span className="symbol">
            <span className="actions-count">{n}</span>
          </span>
          <b>{n === 0 ? "No actions" : `Action${n === 1 ? "" : "s"} waiting`}</b>
          <span>{n === 0 ? "You're up to date" : open ? "Hide the list" : steps[0].title}</span>
        </button>
      </div>
      {open && n > 0 && (
        <section id="home-actions" className="card home-actions">
          {steps.map((s) => (
            <div key={s.key} className={`action-row${s.urgent ? " urgent" : ""}`}>
              <span className="action-text">
                <strong>
                  {s.title}
                  {s.urgent && <span className="status warn" style={{ marginLeft: 8, verticalAlign: 1 }}>Urgent</span>}
                </strong>
                <small>{s.detail}</small>
              </span>
              <a className={`btn ${s.urgent ? "" : "secondary "}small-btn`} href={s.href}>{s.action}</a>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
