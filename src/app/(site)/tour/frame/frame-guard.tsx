"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FOCUS_CSS } from "@/tour/focus";

// A page of the product shown inside a demo frame (the license check, profile
// editing). It is the product's own page with sample data, so everything that
// would save or send is switched off and says so, and a link that would leave
// the demo explains itself. Typing, ticking and opening sections still work.
//
// Like the workspace frames, it tells the player when it is ready.
export function FrameGuard({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    // Ready once the page has drawn and its own effects (highlights, ranking) have run.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        document.documentElement.dataset.scene = "ready";
        window.parent?.postMessage({ type: "pa-scene", id, state: "ready" }, window.location.origin);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const say = (t: string) => setNote(t);
    const onSubmit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      say("This is a demo: nothing is saved or sent.");
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".demo-note")) return;
      const a = t.closest("a");
      if (a) {
        e.preventDefault();
        e.stopPropagation();
        say("This is a demo, so links stay where they are. In PsyAlliance itself this goes to the page it names.");
        return;
      }
      if (t.closest("summary, input, select, textarea, label")) return;
      if (t.closest("button")) {
        e.preventDefault();
        e.stopPropagation();
        say("This is a demo: nothing is saved or sent. Use Next above to carry on.");
      }
    };
    el.addEventListener("submit", onSubmit, true);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("submit", onSubmit, true);
      el.removeEventListener("click", onClick, true);
    };
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 5000);
    return () => window.clearTimeout(t);
  }, [note]);

  return (
    <div ref={ref} className="tour-frame" data-tour-screen>
      <style>{FOCUS_CSS}</style>
      {children}
      {note && (
        <div className="demo-note" role="status">
          {note}
          <button type="button" onClick={() => setNote(null)}>Close</button>
        </div>
      )}
    </div>
  );
}
