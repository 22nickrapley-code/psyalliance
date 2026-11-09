"use client";
import { useEffect, useState } from "react";
import { GUIDE, NEED_IDS, HANDOFF_COOKIE, HANDOFF_HOURS, type Need } from "@/lib/start-guide";
import { PRIMARY, NEED_LINE, NeedIcon, NEED_DEMO, LIBRARY_TILE } from "./needs";

// "Show me how PsyAlliance could help" (Nick, 1 Nov): one calm page. Pick a need and its demo opens.
// v7 (Nick, 9 Nov): the optional "Which describes you best?" step is gone; every visitor sees the same
// demo for a need, so it only added a click. Nothing to try here: trying things is for the sandbox.
function track(event: string, need?: string) {
  try {
    void fetch("/api/start-event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, need }), keepalive: true });
  } catch {}
}
export function Guide() {
  const [need, setNeed] = useState<Need | null>(null);

  useEffect(() => {
    track("guide_start");
    const n = new URLSearchParams(location.search).get("need") as Need | null;
    if (n && NEED_IDS.includes(n) && PRIMARY.includes(n)) go(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(n: Need) {
    setNeed(n);
    track("guide_choice", n);
    // The choice travels to sign-up (structured choices only, with an expiry), so "Your goal" shows there.
    const v = encodeURIComponent(JSON.stringify({ need: n, exp: Date.now() + HANDOFF_HOURS * 3600 * 1000 }));
    document.cookie = `${HANDOFF_COOKIE}=${v}; Max-Age=${HANDOFF_HOURS * 3600}; Path=/; SameSite=Lax`;
    track("demo_started", n);
    window.location.href = `${NEED_DEMO(n)}?pick=1`;
  }

  return (
    <div className="guide-card guide-v2" data-guide>
      <h1 className="serif-title">
        What would be useful to you <em>at the moment?</em>
      </h1>
      <p className="guide-lead">Pick one to watch a short demo on the real screens, with fictional colleagues. No email address needed.</p>
      <div className="guide-needs" role="list">
        {PRIMARY.flatMap((n) => [
          ...(n === "explore"
            ? [
                <a key="library" role="listitem" className="need-library" href={LIBRARY_TILE.href} onClick={() => track("demo_started")}>
                  <span className="need-ic">
                    <NeedIcon need="library" />
                  </span>
                  <span className="need-txt">
                    <b>{LIBRARY_TILE.choice}</b>
                    <small>{LIBRARY_TILE.line}</small>
                  </span>
                </a>,
              ]
            : []),
          <button key={n} type="button" role="listitem" className={`need-${n}${need === n ? " is-on" : ""}`} data-need={n} onClick={() => go(n)}>
            <span className="need-ic">
              <NeedIcon need={n} />
            </span>
            <span className="need-txt">
              <b>{GUIDE[n].choice}</b>
              <small>{NEED_LINE[n]}</small>
            </span>
          </button>,
        ])}
      </div>
      <p className="guide-note">We count which need is chosen, anonymously, to improve this page; nothing is linked to you unless you create an account and choose to carry it over.</p>
    </div>
  );
}
