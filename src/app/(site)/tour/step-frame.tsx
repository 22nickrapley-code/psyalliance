"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findFocus, markFocus } from "@/tour/focus";

export type StepProps = {
  src: string;
  demoTitle: string;
  title: string;
  what: string;
  focus?: string;
  focusIndex?: number;
  focusNote?: string;
  index: number;
  total: number;
  last: boolean;
  prev: string;
  next: string;
  home: string;
  homeLabel: string;
  joinHref: string;
  dots: { slug: string; title: string; href: string }[];
  isPage: boolean;
};

// One screen of a demo to click through yourself: the real screen on its
// sample data, with the one thing the step is about marked. The visitor can
// click anything in the screen (nothing is saved or sent anywhere), start it
// again, or move on with Next.
export function StepView(p: StepProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const what = useRef<HTMLDetailsElement>(null);
  const [ready, setReady] = useState<"loading" | "ready" | "error">("loading");
  const [round, setRound] = useState(0);
  const [away, setAway] = useState(false);

  // On a phone the explanation folds away, so the screen has the room.
  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches && what.current) what.current.open = false;
  }, []);

  // The frame says it is ready by setting data-scene on its page.
  useEffect(() => {
    setReady("loading");
    setAway(false);
    let alive = true;
    const t0 = Date.now();
    let off: (() => void) | undefined;
    const look = () => {
      if (!alive) return;
      const el = frame.current;
      let flag: string | undefined;
      try {
        flag = el?.contentDocument?.documentElement.dataset.scene;
      } catch {
        flag = undefined;
      }
      if (flag === "ready" || flag === "error") {
        setReady(flag);
        const doc = el!.contentDocument!;
        const win = el!.contentWindow!;
        const target = findFocus(doc, p.focus, p.focusIndex || 0);
        if (target) {
          markFocus(doc, target);
          const r = target.getBoundingClientRect();
          if (r.top < 0 || r.bottom > win.innerHeight) target.scrollIntoView({ block: "center" });
          // Is the marked control still on screen? If not, offer "Show me".
          const check = () => {
            const t = findFocus(doc, p.focus, p.focusIndex || 0);
            if (!t) return setAway(false);
            const b = t.getBoundingClientRect();
            setAway(b.bottom < 0 || b.top > win.innerHeight);
          };
          win.addEventListener("scroll", check, { passive: true });
          off = () => win.removeEventListener("scroll", check);
          check();
        }
        return;
      }
      if (Date.now() - t0 > 20000) return setReady("error");
      window.setTimeout(look, 150);
    };
    const f = frame.current;
    f?.addEventListener("load", look);
    window.setTimeout(look, 300);
    return () => {
      alive = false;
      off?.();
      f?.removeEventListener("load", look);
    };
  }, [p.src, p.focus, p.focusIndex, round]);

  const show = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const t = findFocus(doc, p.focus, p.focusIndex || 0);
    if (!t) return;
    t.scrollIntoView({ behavior: "smooth", block: "center" });
    markFocus(doc, t, true);
  }, [p.focus, p.focusIndex]);

  const what = p.focus ? `the highlighted ${p.focus.startsWith("#") ? "part of the screen" : "control"}.` : "";
  return (
    <div className="pa tp" data-tour-step={p.title}>
      <header className="tp-bar" data-tour-nav>
        <div className="tp-line">
          <a href={p.home}>&larr; {p.homeLabel}</a>
          <span>
            {p.demoTitle} &middot; Step {p.index + 1} of {p.total}
          </span>
          <span className="tp-note">Fictional people. Nothing here is saved or sent.</span>
          <a href={p.joinHref}>Create your account &rarr;</a>
        </div>
        <div className="tp-main">
          <details className="tp-text" ref={what} open>
            <summary>
              <h1>{p.title}</h1>
            </summary>
            <p>{p.what}</p>
          </details>
          <nav className="tp-nav" aria-label="Demo">
            <a className="btn ghost-on-dark small-btn" href={p.prev}>&larr; Back</a>
            <a className="btn small-btn" href={p.next}>{p.last ? "Finish" : "Next"} &rarr;</a>
          </nav>
        </div>
        <div className="tp-progress" aria-label={`Step ${p.index + 1} of ${p.total}`}>
          {p.dots.map((d, n) => (
            <a key={d.slug} href={d.href} title={d.title} aria-label={d.title} className={n < p.index ? "done" : n === p.index ? "on" : ""} />
          ))}
        </div>
      </header>
      <div className="tp-look" role="note">
        <span>
          {p.last && <b>Last step. </b>}
          {p.focus && (
            <>
              <b>Look for</b> {what}{" "}
            </>
          )}
          {p.focusNote}
        </span>
        <span className="tp-look-actions">
          {p.focus && away && (
            <button type="button" className="tp-link" onClick={show}>Show me &darr;</button>
          )}
          <button type="button" className="tp-link" onClick={() => setRound((n) => n + 1)}>Start this screen again</button>
        </span>
      </div>
      <div className="tp-stage">
        <iframe key={round} ref={frame} src={p.src} title={`${p.title}: a screen of PsyAlliance with sample data`} />
        {ready === "loading" && <div className="tp-loading" role="status">Opening the screen&hellip;</div>}
        {ready === "error" && <div className="tp-loading" role="alert">This screen did not open. Try Start this screen again.</div>}
      </div>
      <nav className="tp-mobile" aria-label="Demo steps" data-tour-nav>
        <a className="btn secondary" href={p.prev}>&larr; Back</a>
        <span>
          <b>Step {p.index + 1} of {p.total}</b>
          <small>{p.demoTitle}</small>
        </span>
        <a className="btn" href={p.next}>{p.last ? "Finish" : "Next"} &rarr;</a>
      </nav>
    </div>
  );
}
