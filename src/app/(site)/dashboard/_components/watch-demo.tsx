"use client";

import { useEffect, useRef, useState } from "react";

// "Watch" on the Demos page: the demo plays as a video over the page, and
// its "Try it yourself" closes it, leaving the member where they are.
export function WatchDemo({ href, what, label }: { href: string; what: string; label: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);

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
    if (!d || typeof d.showModal !== "function") return; // Old browser: the link opens the video in a new tab.
    e.preventDefault();
    setOpen(true);
    d.showModal();
  };

  return (
    <>
      <a ref={trigger} className="btn small-btn" href={`${href}/watch`} target="_blank" rel="noopener" onClick={watch}>
        <span aria-hidden="true">&#9654;</span> {label}
      </a>
      <dialog ref={dialog} className="example-dialog" aria-label={`${what}: a demo`} onClose={() => {
          setOpen(false);
          // Back to the button that opened it, for keyboard and screen-reader users.
          trigger.current?.focus();
        }}>
        <div className="example-bar">
          <span>
            <b>{what}</b> &middot; fictional people, nothing is sent
          </span>
          <button type="button" className="example-close" aria-label="Close the demo" onClick={() => dialog.current?.close()}>
            &times;
          </button>
        </div>
        {open && <iframe ref={frame} src={`${href}/watch`} title={`${what}: a demo`} className="example-frame" />}
      </dialog>
    </>
  );
}
