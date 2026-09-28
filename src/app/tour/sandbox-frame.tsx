"use client";

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
}: {
  children: ReactNode;
  next?: string;
  focus?: string;
  focusIndex?: number;
  focusNote?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [callout, setCallout] = useState<{ top: number; left: number; side: "above" | "below" | "right" } | null>(null);

  // Beside the action when there's room, otherwise above it (or below,
  // near the top of the screen), so it never hides what the step is about.
  const place = useCallback(() => {
    const root = ref.current;
    const el = target.current;
    if (!root || !el || !el.isConnected) return setCallout(null);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return setCallout(null);
    const base = root.getBoundingClientRect();
    if (base.right - r.right > 310) {
      return setCallout({ top: r.top - base.top + r.height / 2, left: r.right - base.left + 16, side: "right" });
    }
    const below = r.top - base.top < 90;
    const left = Math.max(12, Math.min(r.left - base.left, base.width - 292));
    setCallout({ top: below ? r.bottom - base.top + 10 : r.top - base.top - 10, left, side: below ? "below" : "above" });
  }, []);

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
    const screen = root?.querySelector<HTMLElement>("[data-tour-screen]");
    if (!root || !screen || !focus) return;
    const want = clean(focus).toLowerCase();
    const hits = Array.from(screen.querySelectorAll<HTMLElement>("a, button, summary")).filter((n) => clean(n.textContent).toLowerCase().startsWith(want));
    const el = hits[Math.min(focusIndex, hits.length - 1)] || null;
    target.current = el;
    if (!el) return;
    el.classList.add("tour-focus");
    el.setAttribute("aria-describedby", "tour-callout");
    root.classList.add("has-focus");
    place();
    const onResize = () => place();
    window.addEventListener("resize", onResize);
    const t = window.setTimeout(place, 400);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
      el.classList.remove("tour-focus", "tour-pulse");
      root.classList.remove("has-focus");
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
          : "This is a preview: nothing is sent. Use Next to continue the story."
      );
    const onSubmit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const submitter = (e as SubmitEvent).submitter as HTMLElement | null;
      if (submitter && target.current && (submitter === target.current || target.current.contains(submitter))) go();
      else explain();
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-tour-nav]") || t.closest(".tour-toast") || t.closest(".tour-callout")) return;
      if (target.current && (t === target.current || target.current.contains(t))) {
        e.preventDefault();
        e.stopPropagation();
        go();
        return;
      }
      const a = t.closest("a");
      if (a) {
        const href = a.getAttribute("href") || "";
        if (href.startsWith("/tour") || href.startsWith("/sandbox/request") || /^https?:/.test(href) || href.startsWith("mailto:")) return;
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
    return () => {
      el.removeEventListener("submit", onSubmit, true);
      el.removeEventListener("click", onClick, true);
    };
  }, [next]);

  return (
    <div ref={ref} className="tour-mode">
      {children}
      {callout && focusNote && (
        <div id="tour-callout" className={`tour-callout ${callout.side}`} style={{ top: callout.top, left: callout.left }} role="note">
          <b>Next in the story</b>
          {focusNote}
        </div>
      )}
      {note && (
        <div className="tour-toast" role="status">
          <p style={{ margin: 0 }}>{note}</p>
          <div className="tour-toast-actions">
            {target.current ? (
              <button type="button" className="tour-toast-btn" onClick={showMe}>Show me</button>
            ) : (
              next && <a className="tour-toast-btn" href={next}>Next step &rarr;</a>
            )}
            <a className="tour-toast-link" href="/sandbox/request">Explore freely in a sandbox &rarr;</a>
            <button type="button" className="tour-toast-close" onClick={() => setNote(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
