"use client";
import { useEffect, useState } from "react";

// Continuity sections save only when the member presses Save (review F19). Until then, what they type
// is kept on this device, put back if they leave and return, and leaving with unsaved changes asks first.
// Nothing here reaches the server, and a draft never sends a backup invitation.
const KEY = "pa-continuity-drafts";

type Drafts = Record<string, Record<string, string>>; // section -> field -> value

function read(): Drafts {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
}
function write(d: Drafts) {
  try { Object.keys(d).length ? localStorage.setItem(KEY, JSON.stringify(d)) : localStorage.removeItem(KEY); } catch { /* storage unavailable: the leave warning still protects the work */ }
}

export function ContinuityDrafts({ savedSection }: { savedSection?: string | null }) {
  const [restored, setRestored] = useState<string[]>([]);

  useEffect(() => {
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form.continuity-form"));
    const drafts = read();
    // The section that was just saved has nothing left to recover.
    if (savedSection && drafts[savedSection]) { delete drafts[savedSection]; write(drafts); }
    const back: string[] = [];
    for (const f of forms) {
      const section = (f.elements.namedItem("section") as HTMLInputElement | null)?.value;
      if (!section || !drafts[section]) continue;
      let changed = false;
      for (const [name, value] of Object.entries(drafts[section])) {
        const el = f.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
        if (el && "value" in el && el.value !== value) { el.value = value; changed = true; }
      }
      if (changed) { back.push(section); f.dataset.dirty = "1"; const d = f.closest("details"); if (d) d.open = true; }
    }
    setRestored(back);

    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement | HTMLTextAreaElement;
      const f = el.form;
      if (!f || !f.classList.contains("continuity-form") || !el.name || el.type === "hidden") return;
      const section = (f.elements.namedItem("section") as HTMLInputElement | null)?.value;
      if (!section) return;
      const d = read();
      d[section] = { ...(d[section] || {}), [el.name]: el.value };
      write(d);
      f.dataset.dirty = "1";
    };
    const onSubmit = (e: Event) => {
      const f = e.target as HTMLFormElement;
      if (f.classList.contains("continuity-form")) delete f.dataset.dirty;
    };
    const dirty = () => forms.some((f) => f.dataset.dirty === "1");
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } };
    // In-app links do not unload the page, so ask before following one with unsaved changes.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !dirty() || a.target === "_blank" || a.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm("You have changes in your continuity plan that are not saved yet. They are kept on this device, but leave without saving?")) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    };
    document.addEventListener("input", onInput);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("input", onInput);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [savedSection]);

  if (!restored.length) return null;
  return (
    <p className="banner" role="status" data-drafts-restored>
      We kept the changes you had not saved. Check them and press Save to keep them.
    </p>
  );
}
