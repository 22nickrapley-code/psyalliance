"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { actionMs, actionsMs, sceneMs, typeStep, TYPE_LIMIT, type SceneAction } from "./scene-timing";
import { findFocus, findField, markFocus, pinned, scrollTargetFor, animateScroll, visible } from "@/tour/focus";
import { setValue } from "@/workspace/tour/ui";
export type { SceneAction } from "./scene-timing";

// A demo as a video. Each moment is a frame of the approved workspace itself,
// running on its fictional sample data, with a caption beside it. The player
// scrolls the frame and moves the pointer, and does what a person would do:
// ticks, chooses and types on the real controls. Nothing here is a picture of
// the product, so a video cannot drift from the product.
//
// Pause, step back or jump to a chapter at any time. A moment's clock starts
// when its frame says it is ready, so a slow connection never cuts one short.

export type Scene = {
  id: string; // "cover/plan"
  src: string; // where the frame is loaded from
  chapter: string;
  caption: string;
  sub: string;
  focus?: string;
  focusIndex?: number;
  seconds?: number;
  actions?: SceneAction[];
};

// The width the product is drawn at: a computer's on a computer, a phone's on
// a phone, where the product's own phone layout applies.
const DESKTOP_WIDTH = 1100;
const PHONE_WIDTH = 390;

// What the closing card says. Inside the app the demo opens over the page
// itself, so "Try it yourself" closes it rather than going anywhere.
export type StoryEnd = { title: string; text: string; tryLabel?: string; otherLabel?: string; otherHref?: string };
const DEFAULT_END: StoryEnd = { title: "That’s PsyAlliance.", text: "Cover, referrals, questions and templates, with colleagues you trust." };

type Frame = { el: HTMLIFrameElement; doc: Document; win: Window };

export function StoryPlayer({
  scenes,
  tryHref,
  label = "PsyAlliance in two minutes",
  end = DEFAULT_END,
  embed = false,
  startAt = 0,
}: {
  scenes: Scene[];
  tryHref: string;
  label?: string;
  end?: StoryEnd;
  embed?: boolean;
  // Start from a chapter (a link such as "Watch how Cover works").
  startAt?: number;
}) {
  const [i, setI] = useState(Math.max(0, Math.min(scenes.length - 1, startAt)));
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [geom, setGeom] = useState({ w: DESKTOP_WIDTH, scale: 0.6, h: 720 });
  const [phone, setPhone] = useState(false);
  const [reduced, setReduced] = useState(false);
  // Which frames have said they are ready, and how many times each has been
  // opened afresh (a frame someone has acted in is opened again, never reused).
  const [state, setState] = useState<Record<string, "ready" | "error">>({});
  const [epoch, setEpoch] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<{ x: number; y: number; on: boolean; click: boolean; scene: number }>({ x: 40, y: 40, on: false, click: false, scene: -1 });
  const box = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const frames = useRef<Record<string, HTMLIFrameElement | null>>({});
  const dirty = useRef<Set<string>>(new Set());
  const loadedAt = useRef<Record<string, number>>({});
  // Time already spent on the current scene (kept across a pause).
  const spent = useRef({ scene: -1, ms: 0 });
  const startedAt = useRef(0);

  // On a phone the screen is drawn at full size, so every scroll covers more
  // ground and there is less room to read: everything runs slower there.
  const slow = phone ? 1.4 : 1;
  const playMs = (sc: { seconds?: number; actions?: SceneAction[] }) =>
    phone ? Math.round((sc.seconds || 8.5) * 1000 + 1600 + actionsMs(sc.actions) * slow) : sceneMs(sc);
  const s = scenes[i];
  const duration = s ? playMs(s) : 8500;
  const actions = s?.actions || [];
  const isReady = !!s && !!state[s.id];
  const chapters = scenes.reduce<{ name: string; first: number }[]>((acc, sc, n) => (acc.some((c) => c.name === sc.chapter) ? acc : [...acc, { name: sc.chapter, first: n }]), []);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Size the frames to the stage: the product is drawn at its own width and
  // scaled to fit, so the video shows exactly what the product shows.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const fit = () => {
      const ph = window.innerWidth < 760;
      setPhone(ph);
      const w = ph ? PHONE_WIDTH : DESKTOP_WIDTH;
      const scale = Math.min(1, el.clientWidth / w);
      setGeom({ w, scale, h: Math.round(el.clientHeight / scale) });
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

  // A frame says it is ready by setting data-scene on its page. Looking every
  // fifth of a second is plenty, and also catches a frame that was ready
  // before anyone asked. A frame that never answers is given up on.
  useEffect(() => {
    const t = window.setInterval(() => {
      for (const sc of scenes) {
        const el = frames.current[sc.id];
        if (!el || state[sc.id]) continue;
        let flag: string | undefined;
        try {
          flag = el.contentDocument?.documentElement.dataset.scene;
        } catch {
          flag = undefined;
        }
        if (flag === "ready" || flag === "error") setState((m) => ({ ...m, [sc.id]: flag as "ready" | "error" }));
        else if (loadedAt.current[sc.id] && Date.now() - loadedAt.current[sc.id] > 20000) setState((m) => ({ ...m, [sc.id]: "error" }));
      }
    }, 200);
    return () => window.clearInterval(t);
  }, [scenes, state]);

  const frame = useCallback(
    (n = i): Frame | null => {
      const el = frames.current[scenes[n]?.id];
      try {
        const doc = el?.contentDocument;
        const win = el?.contentWindow;
        return el && doc && win && doc.documentElement.dataset.scene === "ready" ? { el, doc, win } : null;
      } catch {
        return null;
      }
    },
    [i, scenes]
  );

  // The scroll and pointer belong to one scene, so a new scene never starts
  // on the last one's position.
  const reached = useRef(0); // 0 top of screen, 1 scrolled, 2 pointer shown, 3 clicked
  const manual = useRef(false); // stepped with the arrows while paused
  const actionsDone = useRef(0);
  const typing = useRef(0);
  const stopScroll = useRef<() => void>(() => {});
  const timers = useRef<number[]>([]);

  // Where the screen should scroll and where the pointer will be once it has.
  const aim = (f: Frame, el: HTMLElement, along: number, side: "center" | "left") => {
    const r = el.getBoundingClientRect();
    const fixed = pinned(el);
    const ty = fixed ? f.win.scrollY : scrollTargetFor(f.win, el, geom.h, along);
    const top = fixed ? r.top : r.top + f.win.scrollY - ty;
    return {
      ty,
      x: (r.left + (side === "left" ? Math.min(r.width / 2, 60) : r.width / 2)) * geom.scale,
      y: (top + r.height / 2) * geom.scale,
    };
  };
  // On a phone the time follows the distance, between 1.3 and 2.2 seconds, so
  // a long way is never a jolt.
  const scrollMs = (f: Frame, ty: number) => {
    const d = Math.abs(ty - f.win.scrollY) * geom.scale;
    if (d < 2) return 0;
    return phone ? Math.round(Math.max(1300, Math.min(2200, 1200 + d * 0.9))) : 1400;
  };
  const scrollTo = (f: Frame, ty: number) => {
    const ms = reduced ? 0 : scrollMs(f, ty);
    stopScroll.current();
    stopScroll.current = animateScroll(f.win, ty, ms);
    return ms;
  };
  const place = (x: number, y: number, click = false) => setCursor({ x, y, on: true, click, scene: i });

  // The screen a scene opens on is the one before the person acts, so what
  // the video types is typed into an empty field.
  const prepare = () => {
    const f = frame();
    if (!f) return;
    for (const a of actions) {
      if (a.do !== "type") continue;
      const el = findField(f.doc, a.target) as HTMLInputElement | null;
      if (el && el.value) setValue(el, "");
    }
  };

  const perform = (f: Frame, a: SceneAction, field: HTMLElement, instant = false) => {
    if (a.do === "pick") {
      const input = field as HTMLInputElement;
      if (input.tagName === "INPUT") {
        if (!input.checked) (visible(input) ? input : (input.closest("label") as HTMLElement | null) || input).click();
      } else field.click();
    } else if (a.do === "select" && field.tagName === "SELECT") {
      const select = field as HTMLSelectElement;
      const opt = Array.from(select.options).find((o) => o.value === a.value || o.text.trim().toLowerCase().startsWith(a.value.toLowerCase()));
      if (opt) setValue(select, opt.value);
    } else if (a.do === "type") {
      const el = field as HTMLInputElement;
      window.clearInterval(typing.current);
      if (instant || reduced || a.text.length > TYPE_LIMIT) return setValue(el, a.text);
      // Typed a letter at a time; a long paste lands at once.
      let n = 0;
      typing.current = window.setInterval(() => {
        n += 1;
        const live = (findField(f.doc, a.target) as HTMLInputElement | null) || el;
        setValue(live, a.text.slice(0, n));
        if (n >= a.text.length) window.clearInterval(typing.current);
      }, typeStep(a.text));
    }
  };

  const doAction = (k: number) => {
    const f = frame();
    const a = actions[k];
    if (!f || !a) return;
    dirty.current.add(s.id);
    if (a.do === "scroll") {
      // Reading down the page: the screen moves, the pointer stays away.
      const to = f.doc.querySelector<HTMLElement>(a.target);
      if (to) {
        setCursor((c) => ({ ...c, on: false, click: false }));
        scrollTo(f, aim(f, to, 0.3, "center").ty);
      }
      actionsDone.current = Math.max(actionsDone.current, k + 1);
      return;
    }
    const field = findField(f.doc, a.target);
    if (!field) {
      actionsDone.current = k + 1;
      return;
    }
    // A tick box is pointed at itself when it shows; a styled choice (its box
    // hidden) is pointed at through its label.
    const point = a.do === "pick" && !visible(field) ? (field.closest("label") as HTMLElement | null) || field : field;
    const at = aim(f, point, 0.5, "left");
    const moving = scrollTo(f, at.ty);
    place(at.x, at.y);
    // The click lands once the screen has arrived.
    const clickAt = phone ? Math.max(1000 * slow, moving + 250) : 1000;
    timers.current.push(
      window.setTimeout(() => {
        const g = frame();
        if (!g) return;
        const now = aim(g, point, 0.5, "left");
        place(now.x, now.y, true);
        perform(g, a, field);
        actionsDone.current = Math.max(actionsDone.current, k + 1);
      }, clickAt),
      window.setTimeout(() => setCursor((c) => ({ ...c, click: false })), clickAt + 650 * slow)
    );
  };

  const finishActions = () => {
    const f = frame();
    window.clearInterval(typing.current);
    if (!f) return;
    actions.forEach((a, k) => {
      if (k < actionsDone.current || a.do === "scroll") return;
      const field = findField(f.doc, a.target);
      if (field) perform(f, a, field, true);
      dirty.current.add(s.id);
    });
    actionsDone.current = actions.length;
  };

  const reach = (n: number) => {
    reached.current = Math.max(reached.current, n);
    const f = frame();
    if (!f) return;
    // Measured again at the moment it's used: choices made earlier in the
    // scene, fonts and pictures can all move the control after the scene
    // began, and the pointer must land on it.
    const el = findFocus(f.doc, s?.focus, s?.focusIndex || 0);
    const at = reached.current;
    if (!el) return;
    const aimed = aim(f, el, 0.55, "center");
    if (at >= 1) scrollTo(f, aimed.ty);
    if (at >= 2) markFocus(f.doc, el, at >= 3);
    if (at >= 2 && !reduced) place(aimed.x, aimed.y, at >= 3);
  };

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  // A new scene starts at the top, pointer hidden, before anything on it has
  // been chosen or typed.
  useEffect(() => {
    reached.current = 0;
    actionsDone.current = 0;
    window.clearInterval(typing.current);
    clearTimers();
    stopScroll.current();
    setCursor((c) => ({ ...c, on: false, click: false }));
  }, [i]);

  useEffect(() => {
    if (isReady) prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, i]);

  // Reduced motion shows the moment straight away; stepping by hand while
  // paused shows it after a beat, since nothing else would.
  useEffect(() => {
    if (!started || !isReady) return;
    if (reduced) {
      finishActions();
      reach(2);
    } else if (reached.current > 0) reach(reached.current);
    let t = 0;
    if (manual.current && !playing && !reduced)
      t = window.setTimeout(() => {
        finishActions();
        reach(3);
      }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, isReady, reduced, geom.scale, geom.h, i]);

  // The clock: the scroll, pointer and click come in the scene's last seconds,
  // then the next scene. Pausing holds everything where it is.
  useEffect(() => {
    if (!playing || ended || !isReady) return;
    manual.current = false;
    if (spent.current.scene !== i) spent.current = { scene: i, ms: 0 };
    startedAt.current = performance.now();
    const elapsed = spent.current.ms;
    const ts: number[] = [];
    if (!reduced) {
      // Read first; then the person's own choices; then the last click. With
      // choices to make, the pointer is already on screen, so the screen and
      // pointer move to the last click together.
      const acting = actions.length > 0;
      const lastAt = duration - actionsMs(actions) * slow;
      const actionsFrom = Math.max(1500, lastAt - (acting ? 3400 : 4400) * slow);
      let at = actionsFrom;
      actions.forEach((a, k) => {
        const when = at;
        if (actionsDone.current <= k) ts.push(window.setTimeout(() => doAction(k), Math.max(0, when - elapsed)));
        at += actionMs(a) * slow;
      });
      const finalFrom = at;
      const moments: [number, number][] = acting
        ? [[finalFrom + 600 * slow, 2], [finalFrom + 2000 * slow, 3]]
        : [[finalFrom, 1], [finalFrom + 1600 * slow, 2], [finalFrom + 3000 * slow, 3]];
      moments.forEach(([when, level], n) => {
        if (reached.current < level)
          ts.push(
            window.setTimeout(() => {
              if (n === 0) finishActions();
              reach(level);
            }, Math.max(0, when - elapsed))
          );
      });
    }
    ts.push(
      window.setTimeout(() => {
        if (i + 1 < scenes.length) advance(i + 1);
        else {
          setEnded(true);
          setPlaying(false);
        }
      }, Math.max(400, duration - elapsed))
    );
    return () => {
      ts.forEach((t) => window.clearTimeout(t));
      clearTimers();
      window.clearInterval(typing.current);
      if (spent.current.scene === i) spent.current.ms += performance.now() - startedAt.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, i, ended, duration, scenes.length, reduced, slow, isReady]);

  // Move to a scene. One that has been acted in is opened afresh.
  const advance = (n: number) => {
    const target = scenes[n];
    if (target && dirty.current.has(target.id)) {
      dirty.current.delete(target.id);
      setEpoch((e) => ({ ...e, [target.id]: (e[target.id] || 0) + 1 }));
      setState((m) => {
        const { [target.id]: _gone, ...rest } = m;
        return rest;
      });
    }
    setI(n);
  };
  const go = (n: number, byHand = true) => {
    manual.current = byHand && !playing;
    spent.current = { scene: -1, ms: 0 };
    setEnded(false);
    advance(Math.max(0, Math.min(scenes.length - 1, n)));
    setStarted(true);
  };
  const tryIt = () => {
    if (embed && window.parent !== window) window.parent.postMessage({ type: "pa-example-done" }, "*");
    else window.location.href = tryHref;
  };
  // Inside a dialog on another page, Escape belongs to that dialog: the key
  // press lands here when the player has focus, so pass it on.
  useEffect(() => {
    if (!embed || window.parent === window) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.parent.postMessage({ type: "pa-example-close" }, "*");
    };
    // The same key pressed while focus is inside a demo screen arrives as a message.
    const onFrame = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "pa-scene-escape") window.parent.postMessage({ type: "pa-example-close" }, "*");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onFrame);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onFrame);
    };
  }, [embed]);
  const toggle = () => {
    if (ended) {
      go(0, false);
      setPlaying(true);
      return;
    }
    setStarted(true);
    setPlaying(!playing);
  };

  // Only this scene and the next are open, so a long demo never holds a dozen
  // copies of the product in memory.
  const open = scenes.map((sc, n) => ({ sc, n })).filter(({ n }) => n === i || n === i + 1);

  return (
    <section className={`story-player${embed ? " embedded" : ""}`} ref={box} aria-label={label} data-player-scene={s?.id} data-player-state={ended ? "ended" : playing ? "playing" : "paused"}>
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
          <span className="sp-who">
            <span className="sp-initials" aria-hidden="true">RD</span>
            Rachel Davis
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
            {open.map(({ sc, n }) => (
              <iframe
                key={`${sc.id}:${epoch[sc.id] || 0}`}
                ref={(el) => {
                  frames.current[sc.id] = el;
                }}
                src={sc.src}
                title={`${sc.caption} (a screen of PsyAlliance)`}
                className={`sp-frame-el${n === i ? " on" : ""}`}
                style={{ width: geom.w, height: geom.h, transform: `scale(${geom.scale})` }}
                tabIndex={-1}
                aria-hidden="true"
                data-scene-id={sc.id}
                onLoad={() => {
                  loadedAt.current[sc.id] = Date.now();
                }}
                // The video is not a surface to click into. (React 18 drops `inert={true}`, so it is set as an empty string.)
                {...({ inert: "" } as Record<string, string>)}
              />
            ))}
            {s && !isReady && !ended && <div className="sp-loading" role="status">Opening the screen&hellip;</div>}
            {s && state[s.id] === "error" && !ended && <div className="sp-loading fail" role="status">This screen did not open. The story carries on.</div>}
            <span className={`sp-cursor${cursor.on && cursor.scene === i ? " on" : ""}${cursor.click && cursor.scene === i ? " click" : ""}`} style={{ left: cursor.x, top: cursor.y, ...(phone && !reduced ? { transitionDuration: "1.3s, 1.3s, 0.4s" } : null) }} aria-hidden="true" />
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
                  {end.otherHref && <a className="btn secondary" href={end.otherHref}>{end.otherLabel || "Back"}</a>}
                  <button type="button" className={end.otherHref ? "btn ghost" : "btn secondary"} onClick={() => { go(0, false); setPlaying(true); }}>Watch again</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="sp-progress" aria-hidden="true">
        {scenes.map((sc, n) => (
          <button key={n} type="button" tabIndex={-1} className={`sp-seg${n < i || ended ? " done" : ""}${n === i && !ended ? " on" : ""}`} onClick={() => go(n)}>
            <span style={n === i && !ended ? { animationDuration: `${playMs(sc) / 1000}s`, animationPlayState: playing && isReady ? "running" : "paused" } : undefined} key={`${n}-${i}-${ended}-${isReady}`} />
          </button>
        ))}
      </div>
    </section>
  );
}
