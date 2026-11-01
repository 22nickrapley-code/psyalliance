"use client";
import { useEffect, useState } from "react";

// Your profile, LinkedIn style (Nick, 1 Nov): the page is the profile as colleagues see it. Each section has a
// pencil that opens that section in a card; Save keeps it and you stay exactly where you were. Every field is
// still in the one form (closed cards included), so a save never loses another section. Links like #photo or
// #specialties (from the Hub's Profile setup actions) open that card. Leaving with unsaved changes asks first.
const SECS = ["basics", "photo", "about", "specialties", "populations", "modalities", "insurance", "languages", "consult-pref", "contact", "self"];

function restore(dlg: HTMLElement) {
  dlg.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea").forEach((el) => {
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) el.checked = el.defaultChecked;
    else if (el instanceof HTMLSelectElement) Array.from(el.options).forEach((o) => (o.selected = o.defaultSelected));
    else if (el.type !== "hidden" && el.type !== "file") el.value = (el as HTMLInputElement).defaultValue;
    el.classList.remove("autofilled");
  });
}

export function ProfileCards() {
  const [imported, setImported] = useState(0);
  useEffect(() => {
    const open = (sec: string) => {
      const d = document.getElementById(`dlg-${sec}`) as HTMLDialogElement | null;
      if (d && !d.open) d.showModal();
    };
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      if (SECS.includes(h)) open(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);

    let dirty = false;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const edit = t.closest<HTMLElement>("[data-edit]");
      if (edit) {
        e.preventDefault();
        open(edit.dataset.edit!);
        return;
      }
      const cancel = t.closest<HTMLElement>("[data-cancel]");
      if (cancel) {
        const d = cancel.closest("dialog");
        if (d) {
          restore(d);
          d.close();
          if (location.hash) history.replaceState(null, "", location.pathname + location.search);
        }
        return;
      }
      const a = t.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && dirty && a.target !== "_blank" && !a.getAttribute("href")?.startsWith("#")) {
        if (!window.confirm("You have changes to your profile that are not saved yet. Leave without saving?")) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    };
    const onInput = (e: Event) => {
      if ((e.target as HTMLElement).closest("#profile-form")) dirty = true;
    };
    const onSubmit = () => {
      dirty = false;
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    // A card closed with Escape forgets what was typed in it.
    const onCancel = (e: Event) => {
      const d = e.target as HTMLElement;
      if (d instanceof HTMLDialogElement && d.closest("#profile-form")) restore(d);
    };
    // Imported values: count the sections that now hold highlighted, unsaved changes.
    const form = document.getElementById("profile-form");
    const watch = new MutationObserver(() => {
      const secs = new Set<string>();
      form?.querySelectorAll(".autofilled").forEach((el) => {
        const s = el.closest<HTMLElement>("[data-sec]")?.dataset.sec;
        if (s) secs.add(s);
      });
      document.querySelectorAll<HTMLElement>("[data-block]").forEach((b) => b.classList.toggle("is-filled", secs.has(b.dataset.block!)));
      setImported(secs.size);
      if (secs.size) dirty = true;
    });
    if (form) watch.observe(form, { subtree: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("cancel", onCancel, true);
    form?.addEventListener("submit", onSubmit);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      watch.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      document.removeEventListener("cancel", onCancel, true);
      form?.removeEventListener("submit", onSubmit);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  if (!imported) return null;
  return (
    <div className="import-bar" role="status">
      <span>
        <b>Filled in from your profile:</b> {imported} section{imported === 1 ? "" : "s"}, marked below. Open any to check it, then save.
      </span>
      <button type="submit" form="profile-form" className="btn">
        Save profile
      </button>
    </div>
  );
}
