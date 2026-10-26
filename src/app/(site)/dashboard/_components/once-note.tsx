"use client";

import { useEffect, useState } from "react";

// A message worth seeing once ("you're verified"), shown until the member
// closes it, remembered in this browser.
export function OnceNote({ id, eyebrow, title, body, action }: { id: string; eyebrow: string; title: string; body: string; action?: { href: string; label: string } }) {
  const key = `pa-note-${id}`;
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(key) === "1";
    } catch {}
    setShow(!seen);
  }, [key]);
  if (!show) return null;
  const close = () => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {}
    setShow(false);
  };
  return (
    <section className="once-note" role="status">
      <span className="once-seal" aria-hidden="true">&#10003;</span>
      <div className="once-copy">
        <div className="eyebrow">{eyebrow}</div>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="once-actions">
          {action && <a className="btn small-btn" href={action.href} onClick={close}>{action.label}</a>}
          <button type="button" className="plain-button small" onClick={close}>Close</button>
        </div>
      </div>
    </section>
  );
}
