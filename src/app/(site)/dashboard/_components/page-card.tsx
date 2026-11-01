"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// A page opened as a card over the current page (Nick, 1 Nov): Availability, Credentials and the Continuity plan
// all open the same way from the profile, and closing the card leaves the member exactly where they were.
// The page inside is the real page; inside a card it hides its own frame (see the in-card rule in v1.css).
export function PageCardLink({ href, title, className, children }: { href: string; title: string; className?: string; children: React.ReactNode }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const router = useRouter();
  const changed = useRef(false);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "pa-card-close") dlg.current?.close();
      if (e.data.type === "pa-card-changed") changed.current = true;
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const open = () => {
    changed.current = false;
    setSrc(href + (href.includes("?") ? "&" : "?") + "card=1");
    dlg.current?.showModal();
  };
  return (
    <>
      <button type="button" className={className} onClick={open} aria-haspopup="dialog">
        {children}
      </button>
      <dialog
        ref={dlg}
        className="page-card"
        aria-label={title}
        onClose={() => {
          setSrc(null);
          // Whatever was saved inside shows here straight away.
          router.refresh();
        }}
        onClick={(e) => {
          if (e.target === dlg.current) dlg.current?.close();
        }}
      >
        <div className="page-card-head">
          <strong>{title}</strong>
          <button type="button" className="page-card-x" aria-label={`Close ${title}`} onClick={() => dlg.current?.close()}>
            &times;
          </button>
        </div>
        {src && <iframe src={src} name="pa-card" title={title} className="page-card-frame" />}
      </dialog>
    </>
  );
}
