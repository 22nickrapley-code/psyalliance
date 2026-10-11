"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// The 90-second story: real PsyAlliance screens with fictional people,
// playing on their own with a caption for each moment. No clicking needed
// to understand it; pause, step back or jump to a chapter at any time.

export type Scene = {
  chapter: string;
  caption: string;
  sub: string;
  who: { name: string; initials: string; colleague: boolean };
  focus?: string;
  focusIndex?: number;
  seconds?: number;
};

// Screens are drawn at desktop width on a computer and at phone width on
// a phone, where the app's own phone layout applies.
const DESKTOP_WIDTH = 1100;
const PHONE_WIDTH = 390;

function findFocus(root: HTMLElement, focus?: string, index = 0): HTMLElement | null {
  if (!focus) return null;
  // "#rank-confirm" points at an element by id rather than by its text.
  if (focus.startsWith("#")) return root.querySelector<HTMLElement>(focus);
  const want = focus.toLowerCase();
  const hits = Array.from(root.querySelectorAll<HTMLElement>("a, button, summary, label, h3, strong")).filter((el) =>
    (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase().startsWith(want)
  );
  return hits[index] || hits[0] || null;
}

// What the closing card says. Inside the app the example opens over the
// page itself, so "Try it yourself" closes it rather than going anywhere.
export type StoryEnd = { title: string; text: string; tryLabel?: string };
const DEFAULT_END: StoryEnd = { title: "That\u2019s PsyAlliance.", text: "Cover, referrals, questions and templates, with colleagues you trust." };

export function StoryPlayer({
  scenes,
  children,
  tryHref,
  label = "PsyAlliance in 90 seconds",
  end = DEFAULT_END,
  embed = false,
}: {
  scenes: Scene[];
  children: ReactNode;
  tryHref: string;
  label?: string;
  end?: StoryEnd;
  embed?: boolean;
}) {
  const screens = Children.toArray(children);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [scale, setScale] = useState(0.6);
  const [screenW, setScreenW] = useState(DESKTOP_WIDTH);
  // The scroll and pointer belong to one scene, so a new scene never
  // starts on the last one's position.
  const [pan, setPan] = useState({ x: 0, y: 0, scene: -1 });
  const [cursor, setCursor] = useState<{ x: number; y: number; on: boolean; click: boolean; scene: number }>({ x: 40, y: 40, on: false, click: false, scene: -1 });
  const [reduced, setReduced] = useState(false);
  const box = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const screenRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Time already spent on the current scene (kept across a pause).
  const spent = useRef({ scene: -1, ms: 0 });
  const startedAt = useRef(0);

  const s = scenes[i];
  const duration = (s?.seconds || 8.5) * 1000;
  const chapters = scenes.reduce<{ name: string; first: number }[]>((acc, sc, n) => (acc.some((c) => c.name === sc.chapter) ? acc : [...acc, { name: sc.chapter, first: n }]), []);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Size the screens to the frame.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const fit = () => {
      const phone = window.innerWidth < 760;
      const w = phone ? PHONE_WIDTH : DESKTOP_WIDTH;
      setScreenW(w);
      setScale(phone ? Math.min(1, el.clientWidth / w) : Math.max(0.46, Math.min(0.72, el.clientWidth / w)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Start when the player comes into view; pause when the tab is hidden.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started) {
          setStarted(true);
          if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
        }
      },
      { threshold: 0.45 }
    );
    io.observe(el);
    const vis = () => document.hidden && setPlaying(false);
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [started]);

  // Each scene opens on the top of the screen while the caption is read.
  // In its last few seconds the screen scrolls to the moment that matters,
  // the pointer moves to it and clicks, and the next scene begins.
  const plan = useRef({ x: 0, y: 0, cx: 0, cy: 0, target: false });
  const reached = useRef(0); // 0 top of screen, 1 scrolled, 2 pointer shown, 3 clicked
  const manual = useRef(false); // stepped with the arrows while paused

  const measure = useCallback(() => {
    const vp = viewport.current;
    const screen = screenRefs.current[i];
    if (!vp || !screen) return;
    const target = findFocus(screen, s?.focus, s?.focusIndex || 0);
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const contentW = screenW * scale;
    const contentH = screen.scrollHeight * scale;
    let x = 0;
    let y = 0;
    let cx = vw * 0.5;
    let cy = vh * 0.4;
    if (target) {
      // Layout position inside the screen, unaffected by the zoom and pan.
      let ox = target.offsetWidth / 2;
      let oy = target.offsetHeight / 2;
      let el: HTMLElement | null = target;
      while (el && el !== screen) {
        ox += el.offsetLeft;
        oy += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      x = Math.max(0, Math.min(Math.max(0, contentW - vw), ox * scale - vw / 2));
      y = Math.max(0, Math.min(Math.max(0, contentH - vh), oy * scale - vh * 0.55));
      cx = ox * scale - x;
      cy = oy * scale - y;
    }
    plan.current = { x, y, cx, cy, target: !!target };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, scale, screenW]);

  const reach = (n: number) => {
    reached.current = Math.max(reached.current, n);
    const p = plan.current;
    const at = reached.current;
    if (at >= 1) setPan({ x: p.x, y: p.y, scene: i });
    if (at >= 2 && p.target && !reduced) setCursor({ x: p.cx, y: p.cy, on: true, click: at >= 3, scene: i });
  };

  // A new scene starts at the top, pointer hidden.
  useEffect(() => {
    reached.current = 0;
    setPan({ x: 0, y: 0, scene: i });
    setCursor((c) => ({ ...c, on: false, click: false }));
  }, [i]);

  // Measure where this scene's moment is (again after a resize). Reduced
  // motion shows it straight away; stepping by hand while paused shows it
  // after a beat, since nothing else would.
  useEffect(() => {
    if (!started) return;
    measure();
    if (reduced) reach(1);
    else if (reached.current > 0) reach(reached.current);
    let t = 0;
    if (manual.current && !playing && !reduced) t = window.setTimeout(() => reach(3), 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, started, reduced]);

  // The clock: the scroll, pointer and click come in the scene's last
  // seconds, then the next scene. Pausing holds everything where it is.
  useEffect(() => {
    if (!playing || ended) return;
    manual.current = false;
    if (spent.current.scene !== i) spent.current = { scene: i, ms: 0 };
    startedAt.current = performance.now();
    const elapsed = spent.current.ms;
    const ts: number[] = [];
    if (!reduced) {
      const moments = [Math.max(1500, duration - 4400), Math.max(2600, duration - 2800), Math.max(3800, duration - 1400)];
      moments.forEach((at, n) => {
        if (reached.current < n + 1) ts.push(window.setTimeout(() => reach(n + 1), Math.max(0, at - elapsed)));
      });
    }
    ts.push(
      window.setTimeout(() => {
        if (i + 1 < scenes.length) setI(i + 1);
        else {
          setEnded(true);
          setPlaying(false);
        }
      }, Math.max(400, duration - elapsed))
    );
    return () => {
      ts.forEach((t) => window.clearTimeout(t));
      if (spent.current.scene === i) spent.current.ms += performance.now() - startedAt.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, i, ended, duration, scenes.length, reduced]);

  const go = (n: number, byHand = true) => {
    manual.current = byHand && !playing;
    spent.current = { scene: -1, ms: 0 };
    setEnded(false);
    setI(Math.max(0, Math.min(scenes.length - 1, n)));
    setStarted(true);
  };
  const tryIt = () => {
    if (embed && window.parent !== window) window.parent.postMessage({ type: "pa-example-done" }, "*");
    else window.location.href = tryHref;
  };
  const toggle = () => {
    if (ended) {
      go(0, false);
      setPlaying(true);
      return;
    }
    setStarted(true);
    setPlaying(!playing);
  };

  return (
    <section className={`story-player${embed ? " embedded" : ""}`} ref={box} aria-label={label}>
      {chapters.length > 1 && (
      <div className="sp-chapters" role="tablist" aria-label="Chapters">
        {chapters.map((c) => {
          const on = s?.chapter === c.name;
          return (
            <button key={c.name} type="button" role="tab" aria-selected={on} className={`sp-chapter${on ? " on" : ""}`} onClick={() => go(c.first)}>
              {c.name}
            </button>
          );
        })}
      </div>
      )}
      <div className="sp-stage">
        <div className="sp-caption" aria-live="polite">
          <span className={`sp-who${s?.who.colleague ? " colleague" : ""}`}>
            <span className="sp-initials" aria-hidden="true">{s?.who.initials}</span>
            {s?.who.colleague ? `${s.who.name.split(" ")[0]}'s view` : `${s?.who.name.split(" ")[0]}'s practice`}
          </span>
          <h3 key={`c${i}`}>{s?.caption}</h3>
          <p key={`s${i}`}>{s?.sub}</p>
          <div className="sp-controls">
            <button type="button" className="btn small-btn" onClick={toggle}>
              {ended ? "Watch again" : playing ? "Pause" : started ? "Play" : "Play the story"}
            </button>
            <button type="button" className="sp-step" aria-label="Previous" onClick={() => go(i - 1)} disabled={i === 0}>&larr;</button>
            <span className="sp-count">{i + 1} / {scenes.length}</span>
            <button type="button" className="sp-step" aria-label="Next" onClick={() => go(i + 1)} disabled={i === scenes.length - 1}>&rarr;</button>
          </div>
        </div>
        <div className="sp-frame">
          <div className="sp-chrome" aria-hidden="true"><i /><i /><i /><span>psyalliance.org</span></div>
          <div className="sp-viewport" ref={viewport}>
            {screens.map((screen, n) => (
              <div
                key={n}
                ref={(el) => {
                  screenRefs.current[n] = el;
                }}
                className={`sp-screen pa${n === i ? " on" : ""}${scenes[n]?.who.colleague ? " as-colleague" : ""}`}
                style={{ width: screenW, transform: n === i && pan.scene === i ? `translate(${-pan.x}px, ${-pan.y}px) scale(${scale})` : `translate(0px, 0px) scale(${scale})` }}
                aria-hidden="true"
                {...({ inert: true } as Record<string, boolean>)}
              >
                {screen}
              </div>
            ))}
            <span className={`sp-cursor${cursor.on && cursor.scene === i ? " on" : ""}${cursor.click && cursor.scene === i ? " click" : ""}`} style={{ left: cursor.x, top: cursor.y }} aria-hidden="true" />
            {ended && (
              <div className="sp-end">
                <b>{end.title}</b>
                <span>{end.text}</span>
                <div className="sp-end-actions">
                  {embed ? (
                    <button type="button" className="btn" onClick={tryIt}>{end.tryLabel || "Try it yourself"} &rarr;</button>
                  ) : (
                    <a className="btn" href={tryHref}>{end.tryLabel || "Try it yourself"} &rarr;</a>
                  )}
                  <button type="button" className="btn secondary" onClick={() => { go(0, false); setPlaying(true); }}>Watch again</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="sp-progress" aria-hidden="true">
        {scenes.map((sc, n) => (
          <button key={n} type="button" tabIndex={-1} className={`sp-seg${n < i || ended ? " done" : ""}${n === i && !ended ? " on" : ""}`} onClick={() => go(n)}>
            <span style={n === i && !ended ? { animationDuration: `${(sc.seconds || 8.5)}s`, animationPlayState: playing ? "running" : "paused" } : undefined} key={`${n}-${i}-${ended}`} />
          </button>
        ))}
      </div>
    </section>
  );
}
