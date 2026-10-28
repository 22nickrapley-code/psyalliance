"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./director.css";
import {
  READ_MS,
  type Beat,
  type DemoScript,
  type Target,
} from "@/tour/scripts";
import { makeUi, setValue } from "@/workspace/tour/ui";

// A demo as a video that plays itself on the real screens.
//
// One screen (the approved workspace on its fictional sample data) stays on
// stage for a whole chapter. A visible pointer moves to each control at a
// human pace, clicks it, types into it, chooses from it; the screen answers
// the way the product does, so nothing jumps and nothing is faked. Each step
// has a caption. Pause, step back, step forward, replay, or jump to a chapter
// at any time. A chapter that has to open part-way through opens on a second
// screen behind the first and fades in, so there is never a blank flash.
//
// The same code runs "fast" (no pointer, no waiting) to put the screen where
// a step left off after a jump, and to check every beat of every script
// against the product (?check=1, used by the demo tests).

const VIEW = { desktop: { w: 1100, h: 700 }, phone: { w: 390, h: 720 } };
const CANCEL = Symbol("cancel");

type Cursor = { x: number; y: number; ms: number; down: boolean; on: boolean };
type Pos = { c: number; s: number };
export type DirectorEnd = { title: string; text: string; tryLabel?: string };
export type CheckRow = { c: number; s: number; beat: string; error: string };

const shown = (e: Element) => (e as HTMLElement).getClientRects().length > 0;
const words = (e: Element) =>
  (e.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();

function resolve(d: Document, target: Target): HTMLElement | null {
  let t = target;
  let n = 0;
  const m = /@(\d+)$/.exec(t);
  if (m) {
    n = Number(m[1]);
    t = t.slice(0, m.index);
  }
  if (t.startsWith("text=")) {
    const want = t.slice(5).toLowerCase();
    const all = Array.from(
      d.querySelectorAll<HTMLElement>(
        "button, a, [role=tab], summary, label, h1, h2, h3, h4",
      ),
    ).filter(shown);
    const exact = all.filter((e) => words(e) === want);
    const some = exact.length
      ? exact
      : all.filter((e) => words(e).startsWith(want));
    return some[n] || null;
  }
  const all = Array.from(d.querySelectorAll<HTMLElement>(t));
  const vis = all.filter(shown);
  return vis[n] || (n === 0 ? all[0] : null) || null;
}

const FRAME_CSS = `
.pa-demo-hover{outline:3px solid rgba(214,161,56,.9)!important;outline-offset:3px!important;border-radius:10px;transition:outline-color .2s}
.pa-demo-typing{outline:2px solid rgba(52,87,74,.85)!important;outline-offset:2px!important;caret-color:#34574a}
html[data-demo] *{scroll-behavior:smooth}
`;

export function Director({
  script,
  tryHref,
  embed = false,
  end,
  startAt = 0,
  onCheck,
}: {
  script: DemoScript;
  tryHref: string;
  embed?: boolean;
  end?: DirectorEnd;
  startAt?: number;
  onCheck?: (rows: CheckRow[]) => void;
}) {
  const chapters = script.chapters;
  const flat = chapters.flatMap((c, ci) =>
    c.steps.map((_, si) => ({ c: ci, s: si })),
  );
  const [pos, setPos] = useState<Pos>({
    c: Math.min(startAt, chapters.length - 1),
    s: 0,
  });
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [front, setFront] = useState<0 | 1>(0);
  const [phone, setPhone] = useState(false);
  const [geom, setGeom] = useState({
    scale: 0.6,
    vw: VIEW.desktop.w,
    vh: VIEW.desktop.h,
  });
  const [cursor, setCursor] = useState<Cursor>({
    x: 60,
    y: 60,
    ms: 0,
    down: false,
    on: false,
  });
  const [ripple, setRipple] = useState<{ k: number; x: number; y: number }>({
    k: 0,
    x: 0,
    y: 0,
  });
  const [, setReduced] = useState(false);
  const reducedRef = useRef(false);

  const box = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const frames = useRef<(HTMLIFrameElement | null)[]>([null, null]);
  const frontRef = useRef<0 | 1>(0);
  const run = useRef(0);
  const pausedRef = useRef(true);
  const fastRef = useRef(false);
  const scaleRef = useRef(0.6);
  const phoneRef = useRef(false);
  const cursorAt = useRef({ x: 60, y: 60 });
  const check = useRef<CheckRow[] | null>(null);
  const loaded = useRef<{ c: number; at: number } | null>(null);
  // Counts the loads started on each of the two screens, so a delayed
  // "blank the old screen" never lands on one that has since been reused.
  const frameTok = useRef([0, 0]);

  // ------------------------------------------------------------ plumbing
  const chk = (id: number) => {
    if (id !== run.current) throw CANCEL;
  };
  // Waits while the demo is running; a pause holds it where it is.
  const sleep = useCallback(async (ms: number, id: number) => {
    const slow = phoneRef.current ? 1.25 : 1;
    let left = fastRef.current ? 0 : ms * slow;
    for (;;) {
      chk(id);
      if (!pausedRef.current || fastRef.current) {
        if (left <= 0) return;
        const step = Math.min(left, 60);
        await new Promise((r) => setTimeout(r, step));
        left -= step;
      } else await new Promise((r) => setTimeout(r, 80));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const untilPlaying = async (id: number) => {
    while (pausedRef.current) {
      chk(id);
      await new Promise((r) => setTimeout(r, 100));
    }
    chk(id);
  };

  const docOf = () => {
    try {
      return frames.current[frontRef.current]?.contentDocument || null;
    } catch {
      return null;
    }
  };
  const winOf = () => frames.current[frontRef.current]?.contentWindow || null;

  const waitFor = async (t: Target, id: number, ms = 6000) => {
    const t0 = Date.now();
    for (;;) {
      chk(id);
      const d = docOf();
      const e = d && resolve(d, t);
      if (e) return e;
      if (Date.now() - t0 > (fastRef.current ? Math.min(ms, 3000) : ms))
        throw new Error(`missing ${t}`);
      await new Promise((r) => setTimeout(r, 40));
    }
  };

  // ------------------------------------------------------------ pointer
  const bringIntoView = async (el: HTMLElement, id: number) => {
    const w = winOf();
    if (!w) return;
    const r = el.getBoundingClientRect();
    const vh = w.innerHeight;
    if (r.top < 90 || r.bottom > vh - 80) {
      el.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: fastRef.current || reducedRef.current ? "auto" : "smooth",
      });
      await sleep(750, id);
    }
  };
  const pointOf = (el: HTMLElement, mode: "button" | "field" | "center") => {
    const r = el.getBoundingClientRect();
    const sc = scaleRef.current;
    const x =
      mode === "center"
        ? r.left + r.width / 2
        : mode === "field"
          ? r.left + Math.min(r.width * 0.35, 70)
          : r.left + Math.min(r.width / 2, 80);
    return { x: x * sc, y: (r.top + r.height / 2) * sc };
  };
  const movePointer = async (
    el: HTMLElement,
    mode: "button" | "field" | "center",
    id: number,
  ) => {
    const p = pointOf(el, mode);
    const from = cursorAt.current;
    const dist = Math.hypot(p.x - from.x, p.y - from.y);
    const ms =
      fastRef.current || reducedRef.current
        ? 0
        : Math.max(420, Math.min(1250, 380 + dist * 1.15));
    cursorAt.current = p;
    setCursor({ x: p.x, y: p.y, ms, down: false, on: true });
    await sleep(ms + 120, id);
    // The screen may have moved while the pointer travelled.
    const q = pointOf(el, mode);
    if (Math.abs(q.x - p.x) > 3 || Math.abs(q.y - p.y) > 3) {
      cursorAt.current = q;
      setCursor({ x: q.x, y: q.y, ms: 220, down: false, on: true });
      await sleep(240, id);
    }
  };
  const hover = (el: HTMLElement, on: boolean) =>
    el.classList.toggle("pa-demo-hover", on);
  const press = async (el: HTMLElement, id: number) => {
    if (fastRef.current) return;
    hover(el, true);
    await sleep(380, id);
    setCursor((c) => ({ ...c, down: true }));
    setRipple((r) => ({
      k: r.k + 1,
      x: cursorAt.current.x,
      y: cursorAt.current.y,
    }));
    await sleep(160, id);
    setCursor((c) => ({ ...c, down: false }));
    setTimeout(() => hover(el, false), 500);
  };
  const clickEl = (el: HTMLElement) => {
    const label =
      el instanceof HTMLInputElement
        ? (el.closest("label") as HTMLElement | null)
        : null;
    (label && !shown(el) ? label : el).click();
  };

  // ------------------------------------------------------------ beats
  const doBeat = async (b: Beat, id: number) => {
    const d = docOf();
    if (!d) throw new Error("no screen");
    switch (b[0]) {
      case "wait":
        await sleep(b[1], id);
        return;
      case "do":
        await makeUi(d).act(b[1]);
        await sleep(300, id);
        return;
      case "scroll": {
        const el = await waitFor(b[1], id);
        el.scrollIntoView({
          block: "center",
          behavior: fastRef.current || reducedRef.current ? "auto" : "smooth",
        });
        await sleep(800, id);
        return;
      }
      case "look": {
        const el = await waitFor(b[1], id);
        await bringIntoView(el, id);
        await movePointer(el, "center", id);
        hover(el, true);
        await sleep(1100, id);
        hover(el, false);
        return;
      }
      case "click": {
        const el = await waitFor(b[1], id);
        await bringIntoView(el, id);
        await movePointer(el, "button", id);
        await press(el, id);
        clickEl(el);
        await sleep(650, id);
        return;
      }
      case "tick": {
        let el = await waitFor(b[1], id);
        await bringIntoView(el, id);
        const target =
          el instanceof HTMLInputElement && !shown(el)
            ? (el.closest("label") as HTMLElement | null) || el
            : el;
        await movePointer(target, "button", id);
        await press(target, id);
        el = resolve(docOf() || d, b[1]) || el;
        if (
          el instanceof HTMLInputElement &&
          el.type === "checkbox" &&
          el.checked
        ) {
          /* already ticked */
        } else if (
          el instanceof HTMLInputElement &&
          el.type === "radio" &&
          el.checked
        ) {
          /* already chosen */
        } else clickEl(el);
        await sleep(600, id);
        return;
      }
      case "choose": {
        const el = (await waitFor(b[1], id)) as HTMLSelectElement;
        await bringIntoView(el, id);
        await movePointer(el, "field", id);
        await press(el, id);
        const want = b[2].toLowerCase();
        const opts = Array.from(el.options || []);
        const opt =
          opts.find((o) => o.text.trim().toLowerCase() === want) ||
          opts.find((o) => o.value.toLowerCase() === want) ||
          opts.find((o) => o.text.trim().toLowerCase().startsWith(want));
        if (!opt) throw new Error(`no option ${b[2]} in ${b[1]}`);
        setValue(el, opt.value);
        await sleep(700, id);
        return;
      }
      case "type": {
        const el = (await waitFor(b[1], id)) as HTMLInputElement;
        await bringIntoView(el, id);
        await movePointer(el, "field", id);
        await press(el, id);
        el.classList.add("pa-demo-typing");
        const text = b[2];
        if (fastRef.current || reducedRef.current) setValue(el, text);
        else {
          setValue(el, "");
          const per =
            text.length > 90
              ? 9
              : Math.max(32, Math.min(72, 2400 / text.length));
          for (let n = 1; n <= text.length; n++) {
            chk(id);
            const live =
              (resolve(docOf() || d, b[1]) as HTMLInputElement | null) || el;
            setValue(live, text.slice(0, n));
            await sleep(per * (0.75 + Math.random() * 0.5), id);
          }
        }
        setTimeout(
          () =>
            (resolve(docOf() || d, b[1]) || el).classList.remove(
              "pa-demo-typing",
            ),
          400,
        );
        await sleep(500, id);
        return;
      }
    }
  };

  const runBeats = async (ci: number, si: number, id: number) => {
    for (const b of chapters[ci].steps[si].beats) {
      chk(id);
      try {
        await doBeat(b, id);
      } catch (e) {
        if (e === CANCEL) throw e;
        // A control that is not there is the test's business, not the viewer's: the video carries on.
        check.current?.push({
          c: ci,
          s: si,
          beat: JSON.stringify(b),
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  };

  // ------------------------------------------------------------ chapters and steps
  const openChapter = async (ci: number, id: number) => {
    const ch = chapters[ci];
    const back = (1 - frontRef.current) as 0 | 1;
    const el = frames.current[back];
    if (!el) throw new Error("no frame");
    // The "opening" note only appears if the screen is slow; a quick one fades straight in.
    const slow = setTimeout(() => setLoading(true), 700);
    frameTok.current[back]++;
    el.src = `/tour/stage/${ch.view}${ch.macro ? `?m=${encodeURIComponent(ch.macro)}` : ""}`;
    const t0 = Date.now();
    try {
      for (;;) {
        chk(id);
        let flag: string | undefined;
        try {
          flag = el.contentDocument?.documentElement.dataset.scene;
        } catch {
          flag = undefined;
        }
        if (flag === "ready") break;
        if (flag === "error" || Date.now() - t0 > 30000) {
          let why = "";
          try {
            why = el.contentDocument?.documentElement.dataset.sceneError || "";
          } catch {
            /* ignore */
          }
          throw new Error(
            `This screen did not open (chapter ${ci + 1}, ${flag || "timed out"}${why ? `: ${why}` : ""}).`,
          );
        }
        await new Promise((r) => setTimeout(r, 60));
      }
    } finally {
      clearTimeout(slow);
    }
    try {
      const d = el.contentDocument!;
      const st = d.createElement("style");
      st.textContent = FRAME_CSS;
      d.head.appendChild(st);
      d.documentElement.dataset.demo = "1";
    } catch {
      /* same origin; cannot fail */
    }
    chk(id);
    const oldIdx = frontRef.current;
    const old = frames.current[oldIdx];
    const oldTok = frameTok.current[oldIdx];
    frontRef.current = back;
    setFront(back);
    setLoading(false);
    loaded.current = { c: ci, at: Date.now() };
    await sleep(420, id);
    if (old)
      setTimeout(() => {
        if (frontRef.current !== oldIdx && frameTok.current[oldIdx] === oldTok)
          old.src = "about:blank";
      }, 600);
  };

  const runStep = async (
    ci: number,
    si: number,
    id: number,
    opts: { fast?: boolean; caption?: boolean } = {},
  ) => {
    const step = chapters[ci].steps[si];
    const prevFast = fastRef.current;
    fastRef.current = !!opts.fast || check.current !== null;
    try {
      if (opts.caption !== false) setPos({ c: ci, s: si });
      const t0 = Date.now();
      // A caption takes longer to read on a phone, where the screen and the words are both small.
      const read = READ_MS(`${step.title} ${step.text}`) * (phoneRef.current ? 1.3 : 1);
      await sleep(Math.min(3000, read * 0.55), id);
      await runBeats(ci, si, id);
      if (!fastRef.current) {
        const left = read + 500 - (Date.now() - t0);
        await sleep(Math.max(900, left) + (step.hold || 0) * 1000, id);
      }
    } finally {
      fastRef.current = prevFast;
    }
  };

  // Plays from a step to the end. `manual` is a jump the viewer made by hand.
  const play = useCallback(
    async (from: Pos, manual: boolean) => {
      const id = ++run.current;
      try {
        setEnded(false);
        setStarted(true);
        const needsLoad = !(
          loaded.current &&
          loaded.current.c === from.c &&
          from.s === 0 &&
          !manual
        );
        if (needsLoad || manual || from.s > 0) {
          await openChapter(from.c, id);
          // Earlier steps of the chapter happen out of sight, so the screen is where they left it.
          for (let k = 0; k < from.s; k++)
            await runStep(from.c, k, id, { fast: true, caption: false });
        }
        let first = true;
        for (let ci = from.c; ci < chapters.length; ci++) {
          if (ci !== from.c) {
            setPos({ c: ci, s: 0 });
            await openChapter(ci, id);
          }
          for (
            let si = ci === from.c ? from.s : 0;
            si < chapters[ci].steps.length;
            si++
          ) {
            const stepByHand = first && manual && pausedRef.current;
            first = false;
            await runStep(ci, si, id, { fast: stepByHand });
            if (stepByHand) await untilPlaying(id);
          }
        }
        // Let the last result be seen before the closing card.
        await sleep(1800, id);
        setEnded(true);
        setPlaying(false);
        pausedRef.current = true;
      } catch (e) {
        if (e !== CANCEL) {
          console.warn("demo", e);
          setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ------------------------------------------------------------ controls
  const flatIndex = flat.findIndex((f) => f.c === pos.c && f.s === pos.s);
  const jump = (to: Pos, keepPlaying = true) => {
    const should = keepPlaying ? playing || !started : true;
    pausedRef.current = !should;
    setPlaying(should);
    setPos(to);
    play(to, true);
  };
  const toggle = () => {
    if (ended) {
      pausedRef.current = false;
      setPlaying(true);
      play({ c: 0, s: 0 }, false);
      return;
    }
    if (!started) {
      pausedRef.current = false;
      setPlaying(true);
      play(pos, false);
      return;
    }
    pausedRef.current = playing;
    setPlaying(!playing);
  };
  const step = (dir: -1 | 1) => {
    const n = Math.max(
      0,
      Math.min(flat.length - 1, (ended ? flat.length - 1 : flatIndex) + dir),
    );
    jump(flat[n], true);
  };
  const tryIt = () => {
    if (embed && window.parent !== window)
      window.parent.postMessage({ type: "pa-example-done" }, "*");
    else window.location.href = tryHref;
  };

  // ------------------------------------------------------------ setup
  useEffect(() => {
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setReduced(reducedRef.current);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => {
      const ph = window.innerWidth < 760;
      phoneRef.current = ph;
      setPhone(ph);
      let v = ph ? VIEW.phone : VIEW.desktop;
      let scale = Math.max(
        0.2,
        Math.min(1, el.clientWidth / v.w, el.clientHeight / v.h),
      );
      if (embed && el.clientWidth > 0 && el.clientHeight > 0) {
        // In the dialog the screen takes the whole space: same width as a real
        // window, and as tall as the dialog allows, so nothing is letterboxed.
        scale = Math.max(0.2, Math.min(1, el.clientWidth / v.w));
        v = {
          w: v.w,
          h: Math.round(
            Math.max(
              ph ? 560 : 560,
              Math.min(ph ? 900 : 900, el.clientHeight / scale),
            ),
          ),
        };
      }
      scaleRef.current = scale;
      setGeom({ scale, vw: v.w, vh: v.h });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Start when it comes into view (or at once inside the dialog); pause when the tab is hidden.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let go = false;
    const begin = () => {
      if (go) return;
      go = true;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // No motion: show the first screen and let the viewer step through by hand.
        pausedRef.current = true;
        setPlaying(false);
        play(pos, true);
      } else {
        pausedRef.current = false;
        setPlaying(true);
        play(pos, false);
      }
    };
    const params = new URLSearchParams(window.location.search);
    if (params.get("check") === "1") return; // the check below drives it
    let io: IntersectionObserver | null = null;
    if (embed) begin();
    else {
      io = new IntersectionObserver((es) => es[0].isIntersecting && begin(), {
        threshold: 0.45,
      });
      io.observe(el);
    }
    const vis = () => {
      if (document.hidden && !pausedRef.current) {
        pausedRef.current = true;
        setPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", vis);
      run.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?check=1: every beat of every step, fast, with the failures listed for the demo tests.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("check") !== "1")
      return;
    let live = true;
    (async () => {
      check.current = [];
      const id = ++run.current;
      pausedRef.current = false;
      try {
        for (let ci = 0; ci < chapters.length && live; ci++) {
          await openChapter(ci, id);
          for (let si = 0; si < chapters[ci].steps.length; si++)
            await runStep(ci, si, id, { fast: true });
        }
      } catch (e) {
        if (e !== CANCEL)
          check.current.push({
            c: -1,
            s: -1,
            beat: "",
            error: e instanceof Error ? e.message : String(e),
          });
      }
      const rows = check.current || [];
      (window as unknown as { __demoCheck?: CheckRow[] }).__demoCheck = rows;
      document.documentElement.dataset.demoCheck = "done";
      onCheck?.(rows);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inside a dialog on another page, Escape belongs to that dialog.
  useEffect(() => {
    if (!embed || window.parent === window) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")
        window.parent.postMessage({ type: "pa-example-close" }, "*");
      if (e.key === " " && (e.target as HTMLElement)?.tagName !== "BUTTON") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embed, playing, started, ended]);

  // ------------------------------------------------------------ view
  const chapter = chapters[pos.c];
  const stepNow = chapter?.steps[pos.s];
  const endCard: DirectorEnd = end || {
    title: script.outcome,
    text: embed
      ? "Your turn. The page behind this works the same way."
      : "Now try it yourself on the same screens. Nothing is sent.",
    tryLabel: "Try it yourself",
  };
  const frameStyle = {
    width: geom.vw,
    height: geom.vh,
    transform: `scale(${geom.scale})`,
  };
  const done = (c: number, s: number) =>
    ended || c < pos.c || (c === pos.c && s < pos.s);

  return (
    <section
      className={`dp${embed ? " embedded" : ""}${phone ? " is-phone" : ""}`}
      ref={box}
      aria-label={`${script.title}: a demo`}
      data-player-state={ended ? "ended" : playing ? "playing" : "paused"}
      data-pos={`${pos.c}.${pos.s}`}
    >
      {chapters.length > 1 && (
        <div className="dp-chapters" role="tablist" aria-label="Chapters">
          {chapters.map((c, ci) => (
            <button
              key={c.name}
              type="button"
              role="tab"
              aria-selected={pos.c === ci && !ended}
              className={`dp-chapter${pos.c === ci && !ended ? " on" : ""}`}
              onClick={() => jump({ c: ci, s: 0 }, true)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="dp-stage">
        <div className="dp-caption" aria-live="polite">
          <span className="dp-who">
            <span className="dp-initials" aria-hidden="true">
              RD
            </span>
            Rachel Davis <small>fictional</small>
          </span>
          <h3 key={`t${pos.c}.${pos.s}`}>{stepNow?.title}</h3>
          <p key={`p${pos.c}.${pos.s}`}>{stepNow?.text}</p>
          <div className="dp-controls">
            <button
              type="button"
              className="dp-play"
              onClick={toggle}
              aria-label={ended ? "Watch again" : playing ? "Pause" : "Play"}
            >
              {ended ? "↻ Watch again" : playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <button
              type="button"
              className="dp-btn"
              aria-label="Previous step"
              onClick={() => step(-1)}
              disabled={!ended && flatIndex <= 0}
            >
              ←
            </button>
            <span className="dp-count">
              {Math.max(1, flatIndex + 1)} / {flat.length}
            </span>
            <button
              type="button"
              className="dp-btn"
              aria-label="Next step"
              onClick={() => step(1)}
              disabled={ended || flatIndex >= flat.length - 1}
            >
              →
            </button>
            <button
              type="button"
              className="dp-btn"
              aria-label="Start again"
              title="Start again"
              onClick={() => jump({ c: 0, s: 0 }, true)}
            >
              ↻
            </button>
          </div>
        </div>
        <div className="dp-frame">
          {!phone && (
            <div className="dp-chrome" aria-hidden="true">
              <i />
              <i />
              <i />
              <span>psyalliance.org</span>
            </div>
          )}
          <div className="dp-viewport" ref={host}>
            <div
              className="dp-screen"
              style={{
                width: geom.vw * geom.scale,
                height: geom.vh * geom.scale,
              }}
            >
              {[0, 1].map((n) => (
                <iframe
                  key={n}
                  ref={(el) => {
                    frames.current[n] = el;
                    // The video is not a surface to click into; a click or Tab stays with the player.
                    el?.setAttribute("inert", "");
                  }}
                  title={`A screen of PsyAlliance (${n + 1})`}
                  className={`dp-frame-el${front === n ? " on" : ""}`}
                  style={frameStyle}
                  tabIndex={-1}
                  aria-hidden="true"
                />
              ))}
              <span
                className={`dp-cursor${cursor.on ? " on" : ""}${cursor.down ? " down" : ""}${phone ? " touch" : ""}`}
                style={{
                  transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                  transitionDuration: `${cursor.ms}ms`,
                }}
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path
                    d="M4 2.5 4 19l4.4-4.1 3 6.6 2.7-1.2-3-6.5H18z"
                    fill="#fff"
                    stroke="#1d2b25"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {ripple.k > 0 && (
                <span
                  key={ripple.k}
                  className="dp-ripple"
                  style={{ left: ripple.x, top: ripple.y }}
                  aria-hidden="true"
                />
              )}
              {loading && !ended && (
                <div className="dp-loading" role="status">
                  Opening the screen&hellip;
                </div>
              )}
              {ended && (
                <div className="dp-end">
                  <b>{endCard.title}</b>
                  <span>{endCard.text}</span>
                  <div className="dp-end-actions">
                    {embed ? (
                      <button type="button" className="dp-try" onClick={tryIt}>
                        {endCard.tryLabel || "Try it yourself"} &rarr;
                      </button>
                    ) : (
                      <a className="dp-try" href={tryHref}>
                        {endCard.tryLabel || "Try it yourself"} &rarr;
                      </a>
                    )}
                    <button type="button" className="dp-again" onClick={toggle}>
                      Watch again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="dp-progress" aria-hidden="true">
        {chapters.map((c, ci) => (
          <div
            key={c.name}
            className="dp-chapter-bar"
            style={{ flexGrow: c.steps.length }}
          >
            {c.steps.map((_, si) => (
              <button
                key={si}
                type="button"
                tabIndex={-1}
                className={`dp-seg${done(ci, si) ? " done" : ""}${!ended && ci === pos.c && si === pos.s ? " on" : ""}`}
                onClick={() => jump({ c: ci, s: si }, true)}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
