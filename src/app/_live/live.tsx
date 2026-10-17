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
const TRANSIENT = new Set(["error", "copied", "uploaded", "completed", "refreshed", "current", "reviewed", "saved", "unsaved", "added", "removed", "ok", "sent", "responded", "closed", "rated", "updated", "deleted", "done", "confirmed", "accepted", "declined", "joined", "left", "posted", "resolved", "reopened", "archived", "invited", "connected", "msg", "notice", "t", "trusted", "untrusted", "back"]);

// After a save that returns you somewhere else, a short word on what saved.
const SAVED_TEXT: Record<string, string> = {
  availability: "Availability saved.",
  profile: "Profile saved.",
  license: "License saved.",
  credentials: "Saved.",
  continuity: "Continuity plan saved.",
  photo: "Photo updated.",
};

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

// A page change that arrives but never shows (release testing, NAV-01).
// Now and then the framework receives the next page in full, for a link or
// after a save (a sent message opening its conversation, a reply marked
// useful), yet the screen stays where it was and later clicks may do
// nothing. The member can't tell their save worked and tends to press
// again. So we watch every page change the app asks the server for: once
// the answer has fully arrived, if after a short wait the address still
// hasn't moved (or, for a save that returns to the same page, the screen is
// still waiting), we open the page the normal way. When things work, which
// is nearly always, this does nothing.
const NAV_GRACE_MS = 2500;
let navSeq = 0;
// True when the screen is waiting on an update that will never arrive:
// React has work it put aside to wait for data, and nothing is left to
// wake it. Read defensively; null when it can't tell.
function screenStuck(): boolean | null {
  try {
    const key = Object.keys(document).find((k) => k.startsWith("__reactContainer$"));
    const root = key ? (document as unknown as Record<string, { stateNode?: { pendingLanes?: number; suspendedLanes?: number; pingedLanes?: number } }>)[key]?.stateNode : null;
    if (!root || typeof root.pendingLanes !== "number" || typeof root.suspendedLanes !== "number") return null;
    return (root.pendingLanes & root.suspendedLanes) !== 0 && !root.pingedLanes;
  } catch {
    return null;
  }
}

function installNavigationWatchdog() {
  const w = window as unknown as { __paNavWatch?: boolean; fetch: typeof fetch };
  if (w.__paNavWatch) return;
  w.__paNavWatch = true;
  const original = window.fetch.bind(window);
  // The same address however its query is written.
  const norm = (u: URL) => {
    const p = new URLSearchParams(u.search);
    p.delete("_rsc");
    p.sort();
    return `${u.pathname}?${p.toString()}`;
  };
  const here = () => norm(new URL(window.location.href));
  window.addEventListener("popstate", () => {
    navSeq += 1; // the member went back or forward: their choice wins
  });
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    try {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const isAction = headers.has("next-action");
      const isNav = !isAction && method === "GET" && headers.get("rsc") === "1" && !headers.has("next-router-prefetch") && !headers.has("next-router-segment-prefetch");
      if (!isAction && !isNav) return res;
      let target: URL | null = null;
      if (isAction) {
        // A save that moves on names its next page; one that stays here
        // (with fresh data for this page) is watched as a same-page update.
        const redirect = res.headers.get("x-action-redirect");
        target = redirect ? new URL(redirect.split(";")[0], window.location.href) : new URL(window.location.href);
      } else {
        target = new URL(res.url || (input instanceof Request ? input.url : String(input)), window.location.href);
      }
      if (!target || target.origin !== window.location.origin || NOT_PAGES.some((r) => r.test(target!.pathname))) return res;
      const from = here();
      // A save that comes back to this same page (or a refresh of it)
      // doesn't move the address, so for those only a stuck screen counts.
      const samePage = norm(target) === from;
      const go = new URL(target.toString());
      go.searchParams.delete("_rsc");
      const mine = samePage ? navSeq : ++navSeq;
      // Wait for the whole answer (read from a copy), then give the page a
      // moment to show it.
      res
        .clone()
        .arrayBuffer()
        .catch(() => null)
        .then(() =>
          window.setTimeout(() => {
            if (mine !== navSeq || document.visibilityState === "hidden") return;
            const moved = here() !== from;
            if (moved) return;
            if (!samePage || screenStuck()) window.location.assign(go.toString());
          }, samePage ? NAV_GRACE_MS + 1500 : NAV_GRACE_MS)
        );
    } catch {
      /* never let the watch get in the way of the request */
    }
    return res;
  };
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

  // 0b. Phones: tapping a date field straight after typing in another field
  // opened the calendar, then the keyboard closing moved the page and the
  // calendar closed again (Nick, 13 Oct). Close the keyboard first, let the
  // page settle, then open the calendar.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const PICKER = /^(date|time|datetime-local|month|week)$/;
    const isPicker = (el: Element | null): el is HTMLInputElement => el instanceof HTMLInputElement && PICKER.test(el.type);
    const typing = (el: Element | null) =>
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && !PICKER.test(el.type) && !/^(checkbox|radio|button|submit|reset|hidden|file|range|color|image)$/.test(el.type)) ||
      !!(el as HTMLElement | null)?.isContentEditable;
    let start: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = t ? { x: t.clientX, y: t.clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!start || !t || Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) return; // a scroll, not a tap
      const input = (e.target as Element | null)?.closest?.("input") || null;
      if (!isPicker(input) || input.disabled || input.readOnly) return;
      const active = document.activeElement;
      if (active === input || !typing(active)) return;
      e.preventDefault();
      (active as HTMLElement).blur();
      window.setTimeout(() => {
        input.focus({ preventScroll: true });
        try {
          input.showPicker();
        } catch {
          /* the next tap opens it */
        }
      }, 380);
    };
    document.addEventListener("touchstart", onStart, { passive: true, capture: true });
    document.addEventListener("touchend", onEnd, { passive: false, capture: true });
    return () => {
      document.removeEventListener("touchstart", onStart, true);
      document.removeEventListener("touchend", onEnd, true);
    };
  }, []);

  // 0c. One press, one save. A second press of the same form before the
  // page has answered is ignored, so a double click can't send twice (for
  // example two password-reset emails, the second refused). Search and
  // filter forms (GET) are left alone.
  useEffect(() => {
    const busy = new WeakMap<HTMLFormElement, number>();
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (!(form instanceof HTMLFormElement) || e.defaultPrevented) return;
      if ((form.getAttribute("method") || "").toLowerCase() === "get" || form.dataset.repeat !== undefined) return;
      const since = busy.get(form);
      if (since && Date.now() - since < 10000) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      busy.set(form, Date.now());
      const release = () => busy.delete(form);
      const watcher = new MutationObserver(() => {
        release();
        watcher.disconnect();
      });
      window.setTimeout(() => watcher.observe(document.body, { childList: true, subtree: true }), 200);
      window.setTimeout(() => {
        release();
        watcher.disconnect();
      }, 10000);
    };
    window.addEventListener("submit", onSubmit, true);
    return () => window.removeEventListener("submit", onSubmit, true);
  }, []);

  // 0c2. Page changes that arrive but never show are completed (NAV-01).
  useEffect(() => {
    installNavigationWatchdog();
  }, []);

  // 0d. Drafts: a form marked data-draft keeps what was typed and chosen if
  // the member goes back a step and returns, or the save comes back with an
  // error (release review N02). Kept in this tab only; cleared once sent.
  useEffect(() => {
    const hasError = new URLSearchParams(window.location.search).has("error");
    const cleanups: (() => void)[] = [];
    const bound = new WeakSet<HTMLFormElement>();
    // The page's own content can arrive a moment after this runs, so forms
    // are picked up as they appear (for a few seconds).
    const bind = (form: HTMLFormElement) => {
      if (bound.has(form)) return;
      bound.add(form);
      const key = `pa-draft:${form.dataset.draft}`;
      const fields = () =>
        Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("textarea[name], select[name], input[name]")).filter(
          (f) => !(f instanceof HTMLInputElement) || /^(text|email|number|date|search|url|tel)$/.test(f.type)
        );
      try {
        const saved = JSON.parse(window.sessionStorage.getItem(key) || "null") as { values: Record<string, string>; sent?: boolean } | null;
        if (saved?.sent && !hasError) window.sessionStorage.removeItem(key);
        else if (saved?.values) for (const f of fields()) if (f.name in saved.values && !f.value) f.value = saved.values[f.name];
      } catch {
        /* storage unavailable: nothing to restore */
      }
      const save = (sent = false) => {
        try {
          const values: Record<string, string> = {};
          for (const f of fields()) values[f.name] = f.value;
          window.sessionStorage.setItem(key, JSON.stringify({ values, sent }));
        } catch {
          /* storage unavailable */
        }
      };
      const onInput = () => save(false);
      const onSubmit = () => save(true);
      form.addEventListener("input", onInput);
      form.addEventListener("change", onInput);
      form.addEventListener("submit", onSubmit);
      cleanups.push(() => {
        form.removeEventListener("input", onInput);
        form.removeEventListener("change", onInput);
        form.removeEventListener("submit", onSubmit);
      });
    };
    const scan = () => document.querySelectorAll<HTMLFormElement>("form[data-draft]").forEach(bind);
    scan();
    const watcher = new MutationObserver(scan);
    watcher.observe(document.body, { childList: true, subtree: true });
    const stop = window.setTimeout(() => watcher.disconnect(), 5000);
    return () => {
      watcher.disconnect();
      window.clearTimeout(stop);
      cleanups.forEach((c) => c());
    };
  }, [pathname, search]);

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

  // 2b. The menu, badges and notices around the page stay current: moving
  // between pages refreshes them if they're more than a minute old (a
  // verification or a new message may have arrived meanwhile).
  const fresh = useRef(Date.now());
  useEffect(() => {
    const maybeRefresh = () => {
      if (Date.now() - fresh.current > 60_000) {
        fresh.current = Date.now();
        routerRef.current?.refresh();
      }
    };
    maybeRefresh();
    const onVisible = () => document.visibilityState === "visible" && maybeRefresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pathname]);

  // 3. When the address changes after a save, stay on the same spot if it's
  // the same page; a different page starts at the top as usual.
  const searchStr = search?.toString() || "";
  useEffect(() => {
    const k = search?.get("saved");
    if (k && SAVED_TEXT[k] && !document.querySelector(".banner.ok")) setNote({ text: SAVED_TEXT[k], tone: "ok", id: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchStr]);
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
