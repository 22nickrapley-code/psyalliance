// Pointing at a control inside a demo frame. The frame is the real product
// screen, so the highlight is added to the control itself (one class), and
// both the video and the click-through pages find it the same way.

export const FOCUS_CSS = `
.pa-focus{outline:3px solid #d9a95f!important;outline-offset:3px;box-shadow:0 0 0 7px rgba(217,169,95,.24)!important;animation:paGlow 2.4s ease-in-out infinite}
.pa-focus.pa-pulse{animation:paPulse .9s ease-out 2}
@keyframes paGlow{0%,100%{box-shadow:0 0 0 5px rgba(217,169,95,.16)}50%{box-shadow:0 0 0 10px rgba(217,169,95,.34)}}
@keyframes paPulse{from{box-shadow:0 0 0 0 rgba(217,169,95,.75)}to{box-shadow:0 0 0 20px rgba(217,169,95,0)}}
@media (prefers-reduced-motion:reduce){.pa-focus,.pa-focus.pa-pulse{animation:none}}
`;

const clean = (t: string | null | undefined) => (t || "").replace(/[←-⇿]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// Only something on screen can be pointed at or clicked: a hidden copy of a
// control (the phone or desktop version) has no position.
export const visible = (el: Element) => (el as HTMLElement).offsetWidth > 0 && (el as HTMLElement).offsetHeight > 0 && el.getClientRects().length > 0;

// "#id", ".class" or "tag[attr]" is a selector; anything else is the start of
// a control's words ("Send cover requests").
export function findFocus(doc: Document, focus?: string, index = 0): HTMLElement | null {
  if (!focus) return null;
  if (/^[#.\[]|^[a-z]+[\[.#:]/i.test(focus)) {
    const all = Array.from(doc.querySelectorAll<HTMLElement>(focus));
    return all.find(visible) || all[0] || null;
  }
  const want = clean(focus);
  const hits = Array.from(doc.querySelectorAll<HTMLElement>("a, button, summary, label, [role=tab], h2, h3, strong")).filter((el) => visible(el) && clean(el.textContent).startsWith(want));
  return hits[index] || hits[0] || null;
}

// Find a form control for an action: a selector, or the start of a label's text.
export function findField(doc: Document, target: string): HTMLElement | null {
  if (/^[#.\[]|^[a-z]+[\[.#:]/i.test(target)) {
    const all = Array.from(doc.querySelectorAll<HTMLElement>(target));
    return all.find(visible) || all[0] || null;
  }
  const want = clean(target);
  const label = Array.from(doc.querySelectorAll<HTMLElement>("label")).find((l) => clean(l.textContent).startsWith(want));
  return label ? label.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select") : null;
}

export function markFocus(doc: Document, el: HTMLElement | null, pulse = false) {
  doc.querySelectorAll(".pa-focus").forEach((n) => n.classList.remove("pa-focus", "pa-pulse"));
  if (!el) return;
  el.classList.add("pa-focus");
  if (pulse) {
    el.classList.remove("pa-pulse");
    void el.offsetWidth;
    el.classList.add("pa-pulse");
  }
}

// Is the element on something that doesn't move when the page scrolls: a
// dialog or sheet, or anything fixed to the screen (a phone's bottom bar)?
export function pinned(el: Element) {
  if (el.closest(".modal, .overlay, .sheet, [role=dialog], dialog")) return true;
  const win = el.ownerDocument.defaultView;
  for (let n: Element | null = el; n && n !== el.ownerDocument.body; n = n.parentElement) {
    if (win && win.getComputedStyle(n).position === "fixed") return true;
  }
  return false;
}

// Where the page should scroll so the element is comfortably in view.
export function scrollTargetFor(win: Window, el: HTMLElement, viewH: number, along = 0.5) {
  const doc = win.document;
  const max = Math.max(0, (doc.scrollingElement?.scrollHeight || doc.documentElement.scrollHeight) - viewH);
  if (pinned(el)) return win.scrollY;
  const r = el.getBoundingClientRect();
  const center = r.top + win.scrollY + r.height / 2;
  return Math.max(0, Math.min(max, center - viewH * along));
}

// "instant" so a page that smooth-scrolls by itself doesn't lag behind the plan.
const jump = (win: Window, top: number) => win.scrollTo({ top, left: 0, behavior: "instant" as ScrollBehavior });

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Scroll the frame's page over a set time, so every scroll in a video takes as
// long as the player planned, whatever the browser's own smooth scrolling does.
// Returns a function that stops it.
export function animateScroll(win: Window, to: number, ms: number): () => void {
  const from = win.scrollY;
  if (Math.abs(to - from) < 2 || ms <= 0) {
    jump(win, to);
    return () => {};
  }
  const t0 = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    jump(win, from + (to - from) * easeInOut(t));
    if (t < 1) raf = win.requestAnimationFrame(tick);
  };
  raf = win.requestAnimationFrame(tick);
  return () => win.cancelAnimationFrame(raf);
}
