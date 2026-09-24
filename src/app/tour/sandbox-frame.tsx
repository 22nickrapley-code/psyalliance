"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// The tour shows real PsyAlliance screens with fictional data. Nothing in
// it can act: forms and in-app links are caught here and explained, so a
// visitor never lands on a sign-in page or sends anything.
export function TourFrame({ children, next }: { children: ReactNode; next?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onSubmit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      setNote("In the tour, nothing is sent. In a real practice, this is the step that goes to your colleagues.");
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.closest("[data-tour-nav]")) return;
      const href = a.getAttribute("href") || "";
      if (href.startsWith("/dashboard") || href === "#" || href.startsWith("/auth")) {
        e.preventDefault();
        e.stopPropagation();
        setNote("The tour follows one story. Use Next to continue, or ask for a sandbox to explore freely.");
      }
    };
    el.addEventListener("submit", onSubmit, true);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("submit", onSubmit, true);
      el.removeEventListener("click", onClick, true);
    };
  }, []);
  return (
    <div ref={ref}>
      {children}
      {note && (
        <div className="toast" role="status">
          {note}{" "}
          {next && (
            <a href={next} data-tour-nav style={{ color: "#e2c49c", marginLeft: 6 }}>
              Next step &rarr;
            </a>
          )}
          <button type="button" className="plain-button small" style={{ color: "#fff", marginLeft: 8 }} onClick={() => setNote(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
