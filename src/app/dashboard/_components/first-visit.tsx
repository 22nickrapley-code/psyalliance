"use client";

import { useEffect, useState } from "react";

// Help offered, not imposed: the first time someone opens Cover, Refer or
// Consult, one line on what it does, a way to start and a short example.
// Once dismissed it shrinks to a quiet "See an example" link, remembered in
// this browser.
export function FirstVisit({
  id,
  line,
  startHref,
  startLabel,
  exampleHref,
}: {
  id: string;
  line: string;
  startHref: string;
  startLabel: string;
  exampleHref: string;
}) {
  const key = `pa-help-${id}`;
  const [state, setState] = useState<"unknown" | "open" | "closed">("unknown");
  useEffect(() => {
    let closed = false;
    try {
      closed = window.localStorage.getItem(key) === "closed";
    } catch {}
    setState(closed ? "closed" : "open");
  }, [key]);
  const close = () => {
    try {
      window.localStorage.setItem(key, "closed");
    } catch {}
    setState("closed");
  };

  if (state === "unknown") return null;
  if (state === "closed") {
    return (
      <p className="first-visit-link">
        <a href={exampleHref} target="_blank" rel="noopener">See a 30-second example &rarr;</a>
      </p>
    );
  }
  return (
    <section className="first-visit" aria-label="How this works">
      <p>{line}</p>
      <div className="first-visit-actions">
        <a className="btn small-btn" href={startHref} onClick={close}>{startLabel}</a>
        <a className="btn secondary small-btn" href={exampleHref} target="_blank" rel="noopener">See a 30-second example</a>
        <button type="button" className="plain-button small" onClick={close}>Got it</button>
      </div>
    </section>
  );
}
