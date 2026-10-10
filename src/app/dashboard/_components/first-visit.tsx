"use client";

import { useEffect, useState } from "react";

// The first time someone opens Cover, Refer or Consult: a one-time note
// above the page offering a short example. It's only about the example;
// the page itself says what to do. Closing it (or opening the example)
// means it doesn't come back in this browser.
export function FirstVisit({ id, what, exampleHref }: { id: string; what: string; exampleHref: string }) {
  const key = `pa-help-${id}`;
  const [show, setShow] = useState(false);
  useEffect(() => {
    let closed = false;
    try {
      closed = window.localStorage.getItem(key) === "closed";
    } catch {}
    setShow(!closed);
  }, [key]);
  const close = () => {
    try {
      window.localStorage.setItem(key, "closed");
    } catch {}
    setShow(false);
  };

  if (!show) return null;
  return (
    <aside className="first-visit" aria-label="See an example">
      <span className="first-visit-icon" aria-hidden="true">&#9654;</span>
      <a className="first-visit-text" href={exampleHref} target="_blank" rel="noopener" onClick={close}>
        <b>New to {what}?</b> See a 30-second example of how it works <span aria-hidden="true">&rarr;</span>
      </a>
      <button type="button" className="first-visit-close" aria-label="Close" onClick={close}>&times;</button>
    </aside>
  );
}
