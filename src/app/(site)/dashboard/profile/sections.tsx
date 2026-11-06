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

// What a section will show once saved, read from its card (Nick, 4 Nov): imported or edited values appear in the
// profile straight away, marked "Not saved yet", instead of looking empty until a reload.
function changedIn(d: Element) {
  return Array.from(d.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")).some((el) => {
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) return el.checked !== el.defaultChecked;
    if (el instanceof HTMLSelectElement) return Array.from(el.options).some((o) => o.selected !== o.defaultSelected);
    if (el.type === "hidden" || el.type === "file") return false;
    return el.value !== (el as HTMLInputElement).defaultValue;
  });
}
const labelText = (i: Element) => (i.closest("label")?.textContent || "").trim();
function previewFor(sec: string, d: Element): string | null {
  const checked = (root: Element) => Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')).map(labelText).filter(Boolean);
  if (sec === "about") return (d.querySelector<HTMLTextAreaElement>("#bio")?.value || "").trim();
  if (sec === "where") {
    const city = (d.querySelector<HTMLInputElement>("#primary_practice_city")?.value || "").trim();
    const st = d.querySelector<HTMLSelectElement>("#primary_state")?.value || "";
    const c = city.replace(new RegExp(`,\\s*${st || "@@"}$`, "i"), "");
    return [c, st].filter(Boolean).join(", ");
  }
  if (sec === "specialties") {
    return [1, 2, 3, 4, 5]
      .map((n) => d.querySelector<HTMLSelectElement>(`select[name="spec_rank_${n}"]`))
      .map((s) => (s && s.value ? s.selectedOptions[0]?.textContent?.trim() || "" : ""))
      .filter(Boolean)
      .join(" · ");
  }
  if (sec === "populations") {
    const g = d.querySelectorAll(".check-grid");
    return [g[0] ? checked(g[0]).join(", ") : "", g[1] ? checked(g[1]).join(", ") : ""].filter(Boolean).join(" · ");
  }
  if (sec === "modalities" || sec === "insurance" || sec === "languages") {
    const xs = checked(d);
    return xs.length > 4 && sec !== "languages" ? `${xs.slice(0, 4).join(", ")} +${xs.length - 4}` : xs.join(", ");
  }
  return null;
}
export function refreshPreviews() {
  document.querySelectorAll<HTMLElement>("[data-preview]").forEach((slot) => {
    const sec = slot.dataset.preview!;
    const d = document.getElementById(`dlg-${slot.dataset.from || sec}`);
    if (slot.dataset.saved === undefined) slot.dataset.saved = slot.innerHTML;
    const block = slot.closest<HTMLElement>("[data-block]");
    if (!d || !changedIn(d)) {
      if (slot.innerHTML !== slot.dataset.saved) slot.innerHTML = slot.dataset.saved;
      if (sec !== "where" && block?.classList.contains("is-proposed")) block.classList.remove("is-proposed");
      return;
    }
    const v = previewFor(sec, d);
    if (v === null) return;
    // Only rewrite the slot when the text changes: rewriting it would wake the observer below again.
    const want = (sec === "about" ? v || "No bio yet." : sec === "where" ? (v ? ` · ${v}` : "") : v || "Nothing chosen") + " Not saved yet";
    if (slot.textContent?.replace(/\s+/g, " ").trim() === want.replace(/\s+/g, " ").trim()) return;
    slot.innerHTML = "";
    if (sec === "about") {
      const p = document.createElement("p");
      p.textContent = v || "No bio yet.";
      slot.appendChild(p);
    } else slot.textContent = sec === "where" ? (v ? ` · ${v}` : "") : v || "Nothing chosen";
    const tag = document.createElement("em");
    tag.className = "pf-proposed-tag";
    tag.textContent = "Not saved yet";
    slot.append(" ", tag);
    if (sec !== "where" && block && !block.classList.contains("is-proposed")) block.classList.add("is-proposed");
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
    // Once Save is pressed nothing may mark the page unsaved again, or the browser asks "Leave site?" as the saved
    // page loads (the bug Nick hit after importing).
    let submitting = false;
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
          refreshPreviews();
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
      if ((e.target as HTMLElement).closest("#profile-form")) {
        if (!submitting) dirty = true;
        refreshPreviews();
      }
    };
    const onSubmit = () => {
      dirty = false;
      submitting = true;
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty && !submitting) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    // A card closed with Escape forgets what was typed in it.
    const onCancel = (e: Event) => {
      const d = e.target as HTMLElement;
      if (d instanceof HTMLDialogElement && d.closest("#profile-form")) {
        restore(d);
        refreshPreviews();
      }
    };
    // Imported values: count the sections that now hold highlighted, unsaved changes.
    const form = document.getElementById("profile-form");
    const watch = new MutationObserver(() => {
      const secs = new Set<string>();
      form?.querySelectorAll(".autofilled").forEach((el) => {
        const s = el.closest<HTMLElement>("[data-sec]")?.dataset.sec;
        if (s) secs.add(s);
      });
      // Change a class only when it differs, or this observer would keep waking itself.
      document.querySelectorAll<HTMLElement>("[data-block]").forEach((b) => {
        const on = secs.has(b.dataset.block!);
        if (b.classList.contains("is-filled") !== on) b.classList.toggle("is-filled", on);
      });
      setImported(secs.size);
      if (secs.size && !submitting) dirty = true;
      refreshPreviews();
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
        <b>Filled in from your profile:</b> {imported} section{imported === 1 ? "" : "s"}, shown below as &ldquo;Not saved yet&rdquo;. Open any to check it, then save. Profile strength counts saved information, so it updates when you save.
      </span>
      <button type="submit" form="profile-form" className="btn">
        Save profile
      </button>
    </div>
  );
}
