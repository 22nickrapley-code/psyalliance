"use client";
import { JOIN_HREF } from "@/lib/env";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const clean = (t: string | null | undefined) => (t || "").replace(/[←-⇿]/g, "").replace(/\s+/g, " ").trim();

// The tour is an annotated preview of real PsyAlliance screens with
// fictional data. The one action each step is about is highlighted and
// labelled; clicking it moves the story on. Everything else is subdued,
// and any other link or submit explains itself instead of doing nothing.
export function TourFrame({
  children,
  next,
  focus,
  focusIndex = 0,
  focusNote,
  intro,
}: {
  children: ReactNode;
  next?: string;
  focus?: string;
  focusIndex?: number;
  focusNote?: string;
  intro?: {
    demo: string;
    step: string;
    title: string;
    what: string;
    who: string;
    whoRole: string;
    initials: string;
    colleague: boolean;
    lookFor?: string;
    last: boolean;
    show?: boolean;
  };
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Each step opens on a short card; the screen is shown once it's read.
  const [revealed, setRevealed] = useState(!intro || intro.show === false);
  const [hasFocus, setHasFocus] = useState(false);
  const [inView, setInView] = useState(true);
  // On a phone the note travels in the bar at the bottom instead of
  // floating over the screen, so nothing is covered or misaligned.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const revealBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!revealed) revealBtn.current?.focus();
  }, [revealed]);
  const target = useRef<HTMLElement | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [callout, setCallout] = useState<{ top: number; left: number; side: "above" | "below" | "right" } | null>(null);
  // On a wide screen the note sits bottom right, unless that would cover the
  // pointer to the next button; then it moves to the top right.
  const toastRef = useRef<HTMLDivElement>(null);
  const [toastTop, setToastTop] = useState(false);
  useEffect(() => {
    if (!note) {
      setToastTop(false);
      return;
    }
    const place = () => {
      const t = toastRef.current;
      const c = document.getElementById("tour-callout");
      if (!t || !c) return setToastTop(false);
      const w = t.offsetWidth;
      const h = t.offsetHeight;
      const b = c.getBoundingClientRect();
      const W = window.innerWidth;
      const H = window.innerHeight;
      const hits = (top: number) => W - 20 - w < b.right && W - 20 > b.left && top < b.bottom && top + h > b.top;
      setToastTop(hits(H - 22 - h) && !hits(22));
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [note, callout]);

  // Beside the action when there's room, otherwise above it (or below,
  // near the top of the screen), so it never hides what the step is about.
  const place = useCallback(() => {
    const root = ref.current;
    const el = target.current;
    if (!root || !el || !el.isConnected) return setCallout(null);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return setCallout(null);
    const base = root.getBoundingClientRect();
    // A note shouldn't sit on top of another button or link on the screen.
    const others = Array.from(root.querySelectorAll<HTMLElement>("[data-tour-screen] a, [data-tour-screen] button")).filter((n) => n !== el && !el.contains(n));
    const clear = (x1: number, y1: number, x2: number, y2: number) =>
      !others.some((n) => {
        const o = n.getBoundingClientRect();
        return o.width > 0 && o.left < x2 && o.right > x1 && o.top < y2 && o.bottom > y1;
      });
    const left = Math.max(12, Math.min(r.left - base.left, base.width - 292));
    const right = base.right - r.right > 310 ? { top: r.top - base.top + r.height / 2, left: r.right - base.left + 16, side: "right" as const } : null;
    const above = r.top - base.top >= 90 ? { top: r.top - base.top - 10, left, side: "above" as const } : null;
    const below = { top: r.bottom - base.top + 10, left, side: "below" as const };
    const fits = (c: { top: number; left: number; side: "above" | "below" | "right" }) => {
      const x1 = base.left + c.left;
      const x2 = x1 + 280;
      if (c.side === "right") return clear(x1, r.top + r.height / 2 - 50, x2, r.top + r.height / 2 + 50);
      if (c.side === "above") return clear(x1, r.top - 110, x2, r.top - 10);
      return clear(x1, r.bottom + 10, x2, r.bottom + 110);
    };
    const options = [right, above, below].filter(Boolean) as NonNullable<typeof right | typeof above | typeof below>[];
    setCallout(options.find(fits) || options[0]);
  }, []);

  useEffect(() => {
    if (revealed) place();
  }, [revealed, place]);

  const showMe = useCallback(() => {
    const el = target.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("tour-pulse");
    void el.offsetWidth;
    el.classList.add("tour-pulse");
    setNote(null);
  }, []);

  // Find and mark the step's action.
  useEffect(() => {
    const root = ref.current;
    // "nav:Availability" points at the sidebar; anything else at the screen.
    const inNav = !!focus && focus.startsWith("nav:");
    const scope = inNav ? root?.querySelector<HTMLElement>(".sidebar") : root?.querySelector<HTMLElement>("[data-tour-screen]");
    if (!root || !scope || !focus) return;
    const want = clean(inNav ? focus.slice(4) : focus).toLowerCase();
    // "#rank-confirm" points at something to look at rather than click.
    const hits = focus.startsWith("#")
      ? Array.from(scope.querySelectorAll<HTMLElement>(focus))
      : Array.from(scope.querySelectorAll<HTMLElement>("a, button, summary")).filter((n) => clean(n.textContent).toLowerCase().startsWith(want));
    const el = hits[Math.min(focusIndex, hits.length - 1)] || null;
    target.current = el;
    if (!el) return;
    el.classList.add("tour-focus");
    el.setAttribute("aria-describedby", "tour-callout");
    setHasFocus(true);
    place();
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting && e.intersectionRatio > 0.6), { threshold: [0, 0.6, 1] });
    io.observe(el);
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    window.addEventListener("resize", onResize);
    // Sticky parts of the screen (the sidebar) move against the page as it
    // scrolls, so the note is re-placed to stay beside its action.
    window.addEventListener("scroll", onResize, { passive: true });
    const t = window.setTimeout(place, 400);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize);
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      io.disconnect();
      el.classList.remove("tour-focus", "tour-pulse");
      setHasFocus(false);
    };
  }, [focus, focusIndex, place]);

  // Catch everything that would act, and explain it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const go = () => {
      if (next) window.location.href = next;
    };
    const explain = () =>
      setNote(
        target.current
          ? "This is a preview, so only the highlighted action works here. It continues the story."
          : "This is a preview: nothing is sent. Use Continue at the bottom of the screen."
      );
    const onSubmit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const submitter = (e as SubmitEvent).submitter as HTMLElement | null;
      if (submitter && target.current && (submitter === target.current || target.current.contains(submitter))) go();
      else explain();
    };
    const demoOnly = () => setNote("Not available in the demo. Choosing and changing options works in your own sandbox and in PsyAlliance itself.");
    const isField = (t: HTMLElement) => {
      if (target.current && (t === target.current || target.current.contains(t))) return false;
      if (!t.closest("[data-tour-screen]")) return false;
      if (t.closest("summary")) return false;
      const f = t.closest("input, select, textarea, label, .aud-option, .picker-row, .picker-more, .picker-chosen button, .reaction-picker button, .reaction-chip");
      if (!f) return false;
      // A label that wraps a link (a colleague's name) behaves like the link.
      if (f.tagName === "LABEL" && t.closest("a")) return false;
      return true;
    };
    const onPointer = (e: Event) => {
      const t = e.target as HTMLElement;
      if (isField(t)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type !== "mousedown") demoOnly();
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["Tab", "Shift", "Escape"].includes(e.key)) return;
      if (isField(t)) {
        e.preventDefault();
        demoOnly();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (isField(t)) {
        e.preventDefault();
        e.stopPropagation();
        demoOnly();
        return;
      }
      if (t.closest("[data-tour-nav]") || t.closest(".tour-toast") || t.closest(".tour-callout") || t.closest(".tour-intro")) return;
      if (target.current && (t === target.current || target.current.contains(t))) {
        e.preventDefault();
        e.stopPropagation();
        go();
        return;
      }
      const a = t.closest("a");
      if (a) {
        const href = a.getAttribute("href") || "";
        if (href.startsWith("/tour") || href.startsWith("/auth/sign-up") || /^https?:/.test(href) || href.startsWith("mailto:")) return;
        e.preventDefault();
        e.stopPropagation();
        explain();
        return;
      }
      const b = t.closest("button");
      if (b && b.type === "submit" && b.closest("form")) {
        e.preventDefault();
        e.stopPropagation();
        explain();
      }
    };
    el.addEventListener("submit", onSubmit, true);
    el.addEventListener("click", onClick, true);
    el.addEventListener("mousedown", onPointer, true);
    el.addEventListener("keydown", onKey, true);
    return () => {
      el.removeEventListener("mousedown", onPointer, true);
      el.removeEventListener("keydown", onKey, true);
      el.removeEventListener("submit", onSubmit, true);
      el.removeEventListener("click", onClick, true);
    };
  }, [next]);

  return (
    <div ref={ref} className={`tour-mode${revealed ? "" : " intro-open"}${hasFocus ? " has-focus" : ""}`}>
      {children}
      {!revealed && intro && (
        <div className={`tour-intro${intro.colleague ? " colleague" : ""}`} role="dialog" aria-modal="true" aria-labelledby="tour-intro-title">
          <div className="tour-intro-card">
            <div className="tour-intro-top">
              <span>{intro.demo}</span>
              <span>{intro.step}</span>
            </div>
            <div className="tour-intro-who">
              <span className={`story-initials${intro.colleague ? " colleague" : ""}`} aria-hidden="true">{intro.initials}</span>
              <span>
                {intro.colleague ? <b className="switch">Now in {intro.who.split(",")[0]}&rsquo;s account</b> : <b>{intro.who}</b>}
                <small>{intro.whoRole}</small>
              </span>
            </div>
            <h2 id="tour-intro-title">{intro.title}</h2>
            <p>{intro.what}</p>
            {intro.lookFor && (
              <p className="look-for">
                <b>Look for</b> the highlighted action. {intro.lookFor}
              </p>
            )}
            <div className="tour-intro-actions">
              <button ref={revealBtn} type="button" className="btn lg" onClick={() => setRevealed(true)}>
                Show me the screen &rarr;
              </button>
              <a className="tour-intro-skip" href="/tour" data-tour-nav>All demos</a>
            </div>
          </div>
        </div>
      )}
      {revealed && !narrow && callout && focusNote && (
        <div id="tour-callout" className={`tour-callout ${callout.side}`} style={{ top: callout.top, left: callout.left }} role="note">
          <b>{intro?.last ? "Last step" : "Next in the story"}</b>
          {focusNote}
          <span className="tour-callout-hint">
            {intro?.last
              ? "Then finish the demo below."
              : focus?.startsWith("#")
                ? "Then press Continue below."
                : `Click the highlighted ${target.current?.closest(".sidebar") ? "link" : "button"} to continue.`}
          </span>
        </div>
      )}
      {revealed && !note && (narrow || !hasFocus || !inView || intro?.last || !!focus?.startsWith("#")) && (
        <div className={`tour-dock${intro?.colleague ? " colleague" : ""}`} role="region" aria-label="Next step" data-tour-nav>
          <span className="tour-dock-text">
            <b>{intro?.last ? "Last step" : "Next"}</b> {focusNote || "Continue the demo."}
          </span>
          {hasFocus && !inView && (
            <button type="button" className="tour-dock-show" onClick={showMe}>Show me &darr;</button>
          )}
          {next && <a className="tour-dock-go" href={next}>{intro?.last ? "Finish the demo" : "Continue"} &rarr;</a>}
        </div>
      )}
      {note && (
        <div ref={toastRef} className={`tour-toast${toastTop ? " at-top" : ""}`} role="status">
          <p style={{ margin: 0 }}>{note}</p>
          <div className="tour-toast-actions">
            {target.current ? (
              <button type="button" className="tour-toast-btn" onClick={showMe}>Show me</button>
            ) : (
              next && <a className="tour-toast-btn" href={next}>Next step &rarr;</a>
            )}
            <a className="tour-toast-link" href={JOIN_HREF}>Try it for real: create your account &rarr;</a>
            <button type="button" className="tour-toast-close" onClick={() => setNote(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
