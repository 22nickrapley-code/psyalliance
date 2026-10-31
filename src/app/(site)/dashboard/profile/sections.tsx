"use client";
import { useEffect, useState } from "react";

// Edit profile (1.0): a menu of sections on the left, one section at a time in the middle. Every field stays
// in the one form, so one Save covers all of them; switching sections never loses anything. Without JavaScript
// every section simply shows. Leaving the page with unsaved changes asks first.
export type NavSection = { id: string; title: string; state: "done" | "todo" | "optional" };

export function ProfileSectionNav({ sections }: { sections: NavSection[] }) {
  const ids = sections.map((s) => s.id);
  const [active, setActive] = useState(ids[0]);
  const [filled, setFilled] = useState<string[]>([]);

  useEffect(() => {
    const wrap = document.querySelector<HTMLElement>("[data-profile-edit]");
    if (!wrap) return;
    wrap.classList.add("js");
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      if (ids.includes(h)) setActive(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);

    // Imported values: show which sections now hold highlighted (unsaved) changes.
    const watch = new MutationObserver(() => {
      const secs = new Set<string>();
      wrap.querySelectorAll(".autofilled").forEach((el) => {
        const sec = el.closest<HTMLElement>("[data-sec]")?.dataset.sec;
        if (sec) secs.add(sec);
      });
      setFilled(Array.from(secs));
    });
    watch.observe(wrap, { subtree: true, attributes: true, attributeFilter: ["class"] });

    // Unsaved changes: ask before following a link away (the form posts normally when saved).
    const form = document.getElementById("profile-form") as HTMLFormElement | null;
    let dirty = false;
    const onInput = (e: Event) => { if ((e.target as HTMLElement).closest("#profile-form, #quick-start")) dirty = true; };
    const onSubmit = () => { dirty = false; };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !dirty || a.target === "_blank" || a.getAttribute("href")?.startsWith("#") || a.closest(".profile-secnav")) return;
      if (!window.confirm("You have changes to your profile that are not saved yet. Leave without saving?")) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    form?.addEventListener("submit", onSubmit);
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      watch.disconnect();
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      form?.removeEventListener("submit", onSubmit);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-profile-edit] [data-sec]").forEach((el) => el.classList.toggle("is-on", el.dataset.sec === active));
  }, [active]);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setActive(id);
    history.replaceState(null, "", `${location.pathname}${location.search}#${id}`);
    const main = document.querySelector(".profile-main");
    if (main && main.getBoundingClientRect().top < 0) main.scrollIntoView({ block: "start" });
    requestAnimationFrame(() => document.getElementById(id)?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true }));
  };
  const at = ids.indexOf(active);
  const next = sections[at + 1];

  return (
    <nav className="profile-secnav" aria-label="Profile sections">
      <ul>
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} onClick={go(s.id)} aria-current={s.id === active ? "true" : undefined} className={s.id === active ? "on" : undefined}>
              <span>{s.title}</span>
              <span className={`st st-${s.state}`}>
                {filled.includes(s.id) ? "Filled in" : s.state === "done" ? "Done" : s.state === "todo" ? "To add" : "Optional"}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {next && (
        <a className="btn secondary small-btn profile-next" href={`#${next.id}`} onClick={go(next.id)}>
          Next: {next.title}
        </a>
      )}
    </nav>
  );
}
