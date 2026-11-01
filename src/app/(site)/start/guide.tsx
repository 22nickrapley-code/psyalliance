"use client";
import { useEffect, useRef, useState } from "react";
import { GUIDE, NEED_IDS, CONTEXT_LABEL, CONTEXTS, HANDOFF_COOKIE, HANDOFF_HOURS, type Need } from "@/lib/start-guide";
import { PRIMARY, NEED_LINE, NeedIcon, NEED_DEMO } from "./needs";

// "Show me how PsyAlliance could help" (Nick, 1 Nov): one calm page. Pick a need; an optional
// "Which describes you best?" question appears; Continue or Skip goes straight to that need's demo.
// The page itself never changes or jumps. Nothing to try here: trying things is for the sandbox.
function track(event: string, need?: string) {
  try {
    void fetch("/api/start-event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, need }), keepalive: true });
  } catch {}
}
const CTX_KEY = "pa-start-ctx";
const readCtx = () => {
  try {
    const v = sessionStorage.getItem(CTX_KEY) || "";
    return (CONTEXTS as readonly string[]).includes(v) ? v : "";
  } catch {
    return "";
  }
};

export function Guide() {
  const [need, setNeed] = useState<Need | null>(null);
  const [ctx, setCtx] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setCtx(readCtx());
    track("guide_start");
    const n = new URLSearchParams(location.search).get("need") as Need | null;
    if (n && NEED_IDS.includes(n) && PRIMARY.includes(n)) open(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(n: Need) {
    setNeed(n);
    track("guide_choice", n);
    opener.current = document.activeElement as HTMLElement | null;
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }
  function close() {
    dialog.current?.close();
  }
  function go(withCtx: string) {
    if (!need) return;
    try {
      withCtx ? sessionStorage.setItem(CTX_KEY, withCtx) : sessionStorage.removeItem(CTX_KEY);
    } catch {}
    // The choice travels to sign-up (structured choices only, with an expiry), so "Your goal" shows there.
    const v = encodeURIComponent(JSON.stringify({ need, ctx: withCtx || undefined, exp: Date.now() + HANDOFF_HOURS * 3600 * 1000 }));
    document.cookie = `${HANDOFF_COOKIE}=${v}; Max-Age=${HANDOFF_HOURS * 3600}; Path=/; SameSite=Lax`;
    track("demo_started", need);
    window.location.href = `${NEED_DEMO(need)}${withCtx ? `?ctx=${encodeURIComponent(withCtx)}` : ""}`;
  }

  return (
    <div className="guide-card guide-v2" data-guide>
      <h1 className="serif-title">
        What would be useful to you <em>at the moment?</em>
      </h1>
      <p className="guide-lead">Pick one. You&rsquo;ll see how PsyAlliance handles it, using fictional colleagues. No email address needed.</p>
      <div className="guide-needs" role="list">
        {PRIMARY.map((n) => (
          <button key={n} type="button" role="listitem" className={`need-${n}${need === n ? " is-on" : ""}`} data-need={n} onClick={() => open(n)}>
            <span className="need-ic">
              <NeedIcon need={n} />
            </span>
            <span className="need-txt">
              <b>{GUIDE[n].choice}</b>
              <small>{NEED_LINE[n]}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="guide-note">We count which need is chosen, anonymously, to improve this page; nothing is linked to you unless you create an account and choose to carry it over.</p>

      <dialog
        ref={dialog}
        className="guide-dialog"
        aria-labelledby="describes-title"
        onClose={() => opener.current?.focus()}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            go(ctx);
          }}
        >
          <button type="button" className="guide-x" aria-label="Close" onClick={close}>
            &times;
          </button>
          {need && <p className="guide-chosen">{GUIDE[need].choice}</p>}
          <h2 id="describes-title" className="serif-title">
            Which describes you best? <span className="guide-optional">Optional</span>
          </h2>
          <fieldset className="guide-choices">
            <legend className="sr-only">Your professional circumstance (optional)</legend>
            {CONTEXTS.map((c) => (
              <label key={c}>
                <input type="radio" name="ctx" value={c} checked={ctx === c} onChange={() => setCtx(c)} /> {CONTEXT_LABEL[c]}
              </label>
            ))}
          </fieldset>
          <div className="guide-actions">
            <button className="btn" type="submit" data-continue>
              Continue
            </button>
            <button className="guide-quiet" type="button" data-skip onClick={() => go("")}>
              Skip
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
