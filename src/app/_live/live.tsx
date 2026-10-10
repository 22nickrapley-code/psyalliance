"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { identifierError } from "@/lib/deidentify";

// Makes every page behave like an app:
// 1. Internal links change the page in place instead of reloading it.
// 2. After a form is saved, the page keeps your place (the form you used
//    stays where it was on screen) instead of jumping to the top.
// 3. The confirmation or error the page shows at the top is echoed in a
//    small note at the bottom of the screen, so you see it without
//    scrolling.

// Paths served by route handlers (files, sign-in callbacks): these need a
// real browser request.
const NOT_PAGES = [/^\/auth\/callback/, /^\/sandbox\/resume/, /^\/api\//, /\/csv(\/|$)/, /^\/dashboard\/settings\/export/, /\/not-fit(\/|$)/];

// Query keys that only carry a one-off message: a page that differs only by
// these is the same page.
const TRANSIENT = new Set(["error", "copied", "uploaded", "completed", "refreshed", "current", "reviewed", "saved", "unsaved", "added", "removed", "ok", "sent", "responded", "closed", "rated", "updated", "deleted", "done", "confirmed", "accepted", "declined", "joined", "left", "posted", "resolved", "reopened", "archived", "invited", "connected", "msg", "notice", "t"]);

type Place = { view: string; y: number; anchor: string; top: number; at: number };
type Note = { text: string; tone: "ok" | "error"; id: number };

let pending: Place | null = null;
let showNote: ((n: Note) => void) | null = null;

function viewKey(path: string, search: string) {
  const p = new URLSearchParams(search);
  for (const k of Array.from(p.keys())) if (TRANSIENT.has(k) || /_(error|saved)$/.test(k)) p.delete(k);
  p.sort();
  return `${path}?${p.toString()}`;
}

function formAnchor(form: HTMLFormElement): string {
  if (form.dataset.keep) return `keep:${form.dataset.keep}`;
  if (form.id) return `id:${form.id}`;
  return `idx:${Array.from(document.querySelectorAll("form")).indexOf(form)}`;
}

function findAnchor(anchor: string): Element | null {
  const i = anchor.indexOf(":");
  const kind = anchor.slice(0, i);
  const v = anchor.slice(i + 1);
  if (kind === "keep") return document.querySelector(`form[data-keep="${CSS.escape(v)}"]`);
  if (kind === "id") return document.getElementById(v);
  if (kind === "idx") return document.querySelectorAll("form")[Number(v)] || null;
  return null;
}

function clearPending() {
  document.querySelectorAll(".is-pending").forEach((b) => {
    b.classList.remove("is-pending");
    b.removeAttribute("aria-busy");
  });
}

// Puts the reader back where they were, once the page has updated.
function restore(place: Place) {
  pending = null;
  clearPending();
  const apply = () => {
    const el = findAnchor(place.anchor);
    const y = el ? window.scrollY + el.getBoundingClientRect().top - place.top : place.y;
    window.scrollTo({ top: Math.max(0, y), behavior: "instant" as ScrollBehavior });
  };
  requestAnimationFrame(() => {
    apply();
    const fresh = document.querySelector<HTMLElement>("[data-just-added]");
    if (fresh) {
      const r = fresh.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) fresh.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    const focus = document.querySelector<HTMLElement>("[data-focus-after-save]");
    if (focus && window.matchMedia("(min-width: 760px)").matches) focus.focus({ preventScroll: true });
    const banner = document.querySelector<HTMLElement>(".banner");
    if (banner && showNote) {
      const r = banner.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) {
        showNote({ text: (banner.dataset.note || banner.textContent || "").trim(), tone: banner.classList.contains("error") ? "error" : "ok", id: Date.now() });
      }
    }
  });
}

export function Live() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [note, setNote] = useState<Note | null>(null);
  const timer = useRef<number | null>(null);
  const routerRef = useRef(router);
  routerRef.current = router;
  showNote = setNote;

  // 0. Client details are caught before anything is sent, so the rest of
  // what was typed is never lost. The server still checks every save.
  useEffect(() => {
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-deidentify")) return;
      const fields = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input[type=text], input:not([type])")).filter(
        (f) => f.name && !f.disabled && f.type !== "hidden"
      );
      form.querySelectorAll(".deid-error").forEach((n) => n.remove());
      for (const f of fields) {
        const err = identifierError(f.value);
        if (!err) {
          f.removeAttribute("aria-invalid");
          continue;
        }
        e.preventDefault();
        e.stopPropagation();
        f.setAttribute("aria-invalid", "true");
        f.classList.add("field-invalid");
        const note = document.createElement("p");
        note.className = "deid-error";
        note.setAttribute("role", "alert");
        note.textContent = `${err} Everything else you wrote is still here.`;
        f.insertAdjacentElement("afterend", note);
        f.focus();
        f.scrollIntoView({ block: "center", behavior: "smooth" });
        const clear = () => {
          if (!identifierError(f.value)) {
            note.remove();
            f.classList.remove("field-invalid");
            f.removeAttribute("aria-invalid");
          }
        };
        f.addEventListener("input", clear);
        return;
      }
    };
    window.addEventListener("submit", onSubmit, true);
    return () => window.removeEventListener("submit", onSubmit, true);
  }, []);

  // 1. Internal links without a full reload.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !(a instanceof HTMLAnchorElement)) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download") || a.dataset.reload !== undefined) return;
      const href = a.getAttribute("href");
      if (href && href.startsWith("#")) {
        // A link to a folded section opens it.
        const el = document.getElementById(decodeURIComponent(href.slice(1)));
        const fold = el?.closest("details") as HTMLDetailsElement | null;
        if (fold && !fold.open) fold.open = true;
        return;
      }
      if (!href || /^(mailto|tel|javascript|data|blob):/i.test(href)) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (NOT_PAGES.some((r) => r.test(url.pathname))) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      e.preventDefault();
      router.push(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);

  // 2. Remember where a form was when it was saved. If the page then jumps
  // to the top by itself (same address), put it back.
  useEffect(() => {
    let watch: number | null = null;
    let touched = false;
    let lastChange = 0;
    const userMoved = () => {
      touched = true;
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (!(form instanceof HTMLFormElement) || form.dataset.keepPlace === "off") return;
      // Search and filter forms (GET) update the page in place, without a
      // reload and without jumping to the top.
      if (!e.defaultPrevented && (form.getAttribute("method") || "get").toLowerCase() === "get" && (!form.target || form.target === "_self")) {
        const url = new URL(form.getAttribute("action") || window.location.pathname, window.location.href);
        if (url.origin === window.location.origin && !NOT_PAGES.some((r) => r.test(url.pathname))) {
          e.preventDefault();
          const params = new URLSearchParams();
          new FormData(form, e.submitter as HTMLElement | null).forEach((v, k) => {
            if (typeof v === "string") params.append(k, v);
          });
          const qs = params.toString();
          // A new page or a new wizard step starts at the top; a filter keeps your place.
          const newStep = params.get("step") !== new URLSearchParams(window.location.search).get("step");
          routerRef.current?.push(`${url.pathname}${qs ? `?${qs}` : ""}`, { scroll: url.pathname !== window.location.pathname || newStep });
          return;
        }
      }
      if (/^https?:/i.test(form.getAttribute("action") || "")) return;
      pending = {
        view: viewKey(window.location.pathname, window.location.search),
        y: window.scrollY,
        anchor: formAnchor(form),
        top: form.getBoundingClientRect().top,
        at: Date.now(),
      };
      const btn = (e.submitter as HTMLButtonElement | null) || form.querySelector<HTMLButtonElement>("button[type=submit], button:not([type])");
      if (btn) {
        btn.setAttribute("aria-busy", "true");
        btn.classList.add("is-pending");
      }
      touched = false;
      lastChange = 0;
      const startedAt = window.location.href;
      if (watch) window.clearInterval(watch);
      watch = window.setInterval(() => {
        const p = pending;
        const stop = () => {
          if (watch) window.clearInterval(watch);
          watch = null;
        };
        if (!p) return stop();
        if (Date.now() - p.at > 15000) {
          pending = null;
          clearPending();
          return stop();
        }
        if (window.location.href !== startedAt) return stop(); // step 3 takes over
        // Same address: the page has updated once its content changed and
        // then settled. Put it back if it jumped.
        if (lastChange && Date.now() - lastChange > 160) {
          stop();
          if (!touched && window.scrollY < p.y - 40) restore(p);
          else {
            pending = null;
            clearPending();
            restore({ ...p, y: window.scrollY, anchor: "none:", top: 0 });
          }
        }
      }, 40);
    };
    const observer = new MutationObserver((list) => {
      if (!pending || Date.now() - pending.at < 120) return;
      if (list.some((m) => m.type === "childList" && (m.addedNodes.length || m.removedNodes.length))) lastChange = Date.now();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("submit", onSubmit);
    window.addEventListener("wheel", userMoved, { passive: true });
    window.addEventListener("touchmove", userMoved, { passive: true });
    window.addEventListener("keydown", userMoved);
    return () => {
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("wheel", userMoved);
      window.removeEventListener("touchmove", userMoved);
      window.removeEventListener("keydown", userMoved);
      if (watch) window.clearInterval(watch);
      observer.disconnect();
    };
  }, []);

  // 3. When the address changes after a save, stay on the same spot if it's
  // the same page; a different page starts at the top as usual.
  const searchStr = search?.toString() || "";
  useEffect(() => {
    const p = pending;
    if (!p) return;
    if (p.view !== viewKey(pathname, searchStr)) {
      pending = null;
      clearPending();
      return;
    }
    restore(p);
    const again = window.setTimeout(() => {
      const el = findAnchor(p.anchor);
      if (el && Math.abs(el.getBoundingClientRect().top - p.top) > 60 && window.scrollY < 10) {
        window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - p.top), behavior: "instant" as ScrollBehavior });
      }
    }, 150);
    return () => window.clearTimeout(again);
  }, [pathname, searchStr]);

  useEffect(() => {
    if (!note) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNote(null), note.tone === "error" ? 7000 : 3500);
  }, [note]);

  if (!note) return null;
  return (
    <div className={`live-note ${note.tone}`} role={note.tone === "error" ? "alert" : "status"} key={note.id}>
      <span>{note.text}</span>
      <button type="button" aria-label="Dismiss" onClick={() => setNote(null)}>&times;</button>
    </div>
  );
}
