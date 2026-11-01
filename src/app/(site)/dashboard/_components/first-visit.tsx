"use client";

import { useEffect, useRef, useState } from "react";

// The first time someone opens Cover, Refer or Consult: a one-time note
// above the page offering a short example. The example plays as a video
// over the page; "Try it yourself" at the end closes it and leaves the
// member on the real page. Closing the note or watching the example means
// it doesn't come back in this browser.
export function FirstVisit({
  id,
  what,
  exampleHref,
  length = "short",
  title,
}: {
  id: string;
  what: string;
  exampleHref: string;
  length?: string;
  title?: string;
}) {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Demo prompts can be turned off for every section at once (Nick, 1 Nov); the demos stay in Settings.
    let off = false;
    try {
      off = window.localStorage.getItem("pa-demos-off") === "1" || /(?:^|; )pa_hide_demos=1/.test(document.cookie);
    } catch {}
    setShow(!off);
  }, [id]);


  // The video's own "Try it yourself" button asks to be closed.
  useEffect(() => {
    if (!open) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && (e.data?.type === "pa-example-done" || e.data?.type === "pa-example-close")) dialog.current?.close();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open]);

  const watch = (e: React.MouseEvent) => {
    const d = dialog.current;
    if (!d || typeof d.showModal !== "function") return; // Old browser: the link opens the example in a new tab.
    e.preventDefault();
    setOpen(true);
    d.showModal();
  };
  const finished = () => {
    setOpen(false);
    // The note goes away with the example, so focus returns to the page.
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  if (!show) return null;
  return (
    <>
      <div className="demo-line">
        <a className="demo-line-watch" href={exampleHref} target="_blank" rel="noopener" onClick={watch}>
          <span className="demo-line-icon" aria-hidden="true">&#9654;</span>
          <span>
            <b>Need a demo?</b> Watch a {length} demo of how {title ? what.toLowerCase() : what} works
          </span>
        </a>
        <a className="demo-line-off" href={`/dashboard?demos=1&back=${encodeURIComponent(typeof window !== "undefined" ? location.pathname : "/dashboard")}`}>
          Know your way around? Remove demos
        </a>
      </div>
      <dialog ref={dialog} className="example-dialog" aria-label={`${what}: an example`} onClose={finished}>
        <div className="example-bar">
          <span>
            <b>{what}: an example</b> &middot; fictional people, nothing is sent
          </span>
          <button type="button" className="example-close" aria-label="Close the example" onClick={() => dialog.current?.close()}>
            &times;
          </button>
        </div>
        {open && <iframe ref={frame} src={`${exampleHref}/watch`} title={`${what}: an example`} className="example-frame" />}
      </dialog>
    </>
  );
}
