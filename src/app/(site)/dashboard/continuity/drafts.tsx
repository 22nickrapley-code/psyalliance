"use client";
import { useEffect, useState } from "react";

// Continuity sections save only when the member presses Save (review F19). Until then, what they type
// is kept on this device, put back if they leave and return, and leaving with unsaved changes asks first.
// Nothing here reaches the server, and a draft never sends a backup invitation.
// R04 (v4): drafts belong to one account on one site. They are stored under that account's id and the site,
// expire after 7 days, and remember which saved version they started from: if the plan was saved since, the
// member chooses whether to put the unsaved changes back instead of having them laid over the newer plan.
const LEGACY_KEY = "pa-continuity-drafts";
const MAX_AGE = 7 * 86_400_000;

type Drafts = Record<string, Record<string, string>>; // section -> field -> value
type Stored = { v: 2; owner: string; base: string | null; at: number; sections: Drafts };

const keyFor = (owner: string, site: string) => `pa-continuity-drafts:${site}:${owner}`;

function readStored(key: string, owner: string): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(key) || "null") as Stored | null;
    if (!s || s.v !== 2 || s.owner !== owner || Date.now() - s.at > MAX_AGE) { localStorage.removeItem(key); return null; }
    return s;
  } catch { return null; }
}
function writeStored(key: string, s: Stored) {
  try { Object.keys(s.sections).length ? localStorage.setItem(key, JSON.stringify(s)) : localStorage.removeItem(key); } catch { /* storage unavailable: the leave warning still protects the work */ }
}

export function ContinuityDrafts({ savedSection, owner, site, base }: { savedSection?: string | null; owner: string; site: string; base: string | null }) {
  const [restored, setRestored] = useState<string[]>([]);
  const [conflict, setConflict] = useState<Stored | null>(null);
  const key = keyFor(owner, site);

  // Puts a draft's values back into the forms.
  const apply = (drafts: Drafts) => {
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form.continuity-form"));
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
    return back;
  };

  useEffect(() => {
    // The old shared draft (before R04) can't be tied to an account, so it is cleared rather than shown to anyone.
    try { localStorage.removeItem(LEGACY_KEY); } catch {}
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form.continuity-form"));
    const stored = readStored(key, owner);
    // The section that was just saved has nothing left to recover.
    if (stored && savedSection && stored.sections[savedSection]) { delete stored.sections[savedSection]; stored.base = base; writeStored(key, stored); }
    if (stored && Object.keys(stored.sections).length) {
      if ((stored.base || null) === (base || null) || savedSection) setRestored(apply(stored.sections));
      else setConflict(stored);
    }

    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement | HTMLTextAreaElement;
      const f = el.form;
      if (!f || !f.classList.contains("continuity-form") || !el.name || el.type === "hidden") return;
      const section = (f.elements.namedItem("section") as HTMLInputElement | null)?.value;
      if (!section) return;
      const cur = readStored(key, owner) || { v: 2 as const, owner, base, at: Date.now(), sections: {} };
      cur.sections[section] = { ...(cur.sections[section] || {}), [el.name]: el.value };
      cur.at = Date.now();
      writeStored(key, cur);
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
  }, [savedSection, key, owner, base]);

  if (conflict) {
    return (
      <div className="banner" role="status" data-drafts-conflict>
        You have changes from {new Date(conflict.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} that were never saved, and your plan has been saved since.
        <span className="row" style={{ gap: 8, marginTop: 8 }}>
          <button type="button" className="btn small-btn" onClick={() => { setRestored(apply(conflict.sections)); setConflict(null); }}>Put my unsaved changes back</button>
          <button type="button" className="btn secondary small-btn" onClick={() => { try { localStorage.removeItem(key); } catch {} setConflict(null); }}>Discard them</button>
        </span>
      </div>
    );
  }
  if (!restored.length) return null;
  return (
    <p className="banner" role="status" data-drafts-restored>
      We kept the changes you had not saved. Check them and press Save to keep them.
    </p>
  );
}
