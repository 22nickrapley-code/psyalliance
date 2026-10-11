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
  const key = `pa-help-${id}`;
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

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

  // The video's own "Try it yourself" button asks to be closed.
  useEffect(() => {
    if (!open) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.type === "pa-example-done") dialog.current?.close();
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
    close();
  };

  if (!show) return null;
  return (
    <>
      <aside className="first-visit" aria-label="Watch an example">
        <span className="first-visit-icon" aria-hidden="true">&#9654;</span>
        <a className="first-visit-text" href={exampleHref} target="_blank" rel="noopener" onClick={watch}>
          <b>{title || `New to ${what}?`}</b> Watch a {length} example, then try it yourself <span aria-hidden="true">&rarr;</span>
        </a>
        <button type="button" className="first-visit-close" aria-label="Close" onClick={close}>&times;</button>
      </aside>
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
