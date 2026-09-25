"use client";

import { useState } from "react";
import type { NextStep } from "./home-view";

const PER_PAGE = 3;

// Three next steps at a time, most urgent first, with pages for the rest.
export function StepsPager({ steps }: { steps: NextStep[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(steps.length / PER_PAGE));
  const shown = steps.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  return (
    <>
      {shown.map((s, i) => (
        <div key={s.key} className={`step-item${s.urgent ? " urgent" : ""}`}>
          <span className="row" style={{ alignItems: "flex-start", gap: 14 }}>
            <span className="round-number">{page * PER_PAGE + i + 1}</span>
            <span>
              <strong>
                {s.title}
                {s.urgent && <span className="status warn" style={{ marginLeft: 8, verticalAlign: 1 }}>Urgent</span>}
              </strong>
              <p>{s.detail}</p>
            </span>
          </span>
          <a className={`btn ${s.urgent || (page === 0 && i === 0) ? "" : "secondary "}small-btn`} href={s.href}>
            {s.action}
          </a>
        </div>
      ))}
      {pages > 1 && (
        <div className="steps-pager">
          <span className="micro-note">
            Showing {page * PER_PAGE + 1}&ndash;{Math.min(steps.length, (page + 1) * PER_PAGE)} of {steps.length}
          </span>
          <div className="dots" role="group" aria-label="Pages of next steps">
            {Array.from({ length: pages }, (_, n) => (
              <button
                key={n}
                type="button"
                className={n === page ? "on" : ""}
                aria-current={n === page ? "page" : undefined}
                aria-label={`Page ${n + 1}`}
                onClick={() => setPage(n)}
              >
                {n + 1}
              </button>
            ))}
          </div>
          <div className="nav">
            <button type="button" className="plain-button small" disabled={page === 0} onClick={() => setPage(page - 1)}>
              &larr; Previous
            </button>
            <button type="button" className="plain-button small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              Next &rarr;
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Opens the quick referral search dialog rendered on the server.
export function OpenDialogButton({ target, className, children }: { target: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => (document.getElementById(target) as HTMLDialogElement | null)?.showModal()}
    >
      {children}
    </button>
  );
}

export function CloseDialogButton({ target }: { target: string }) {
  return (
    <button type="button" aria-label="Close" onClick={() => (document.getElementById(target) as HTMLDialogElement | null)?.close()}>
      &times;
    </button>
  );
}
