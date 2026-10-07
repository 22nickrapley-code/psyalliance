"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sandboxTickAction, type SandboxEvent } from "../sandbox-actions";
import { NavIcon } from "../icons";

const ICON: Record<string, string> = { message: "messages", cover: "cover", referral: "refer", circle: "network", group: "consult" };

// A sandbox starts quiet. As the guest looks around, colleagues get in
// touch one at a time; each arrival appears here as a short balloon and
// the rest of the screen refreshes to include it.
export function SandboxNudge() {
  const router = useRouter();
  const [event, setEvent] = useState<SandboxEvent | null>(null);
  const busy = useRef(false);
  // After "Start the story again" nothing from the old story stays on screen.
  const welcome = useSearchParams().get("welcome");
  useEffect(() => {
    if (welcome === "reset") setEvent(null);
  }, [welcome]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped || busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const e = await sandboxTickAction();
        if (e && !stopped) {
          setEvent(e);
          router.refresh();
        }
      } catch {
        // A missed tick is retried on the next one.
      } finally {
        busy.current = false;
      }
    };
    const first = window.setTimeout(tick, 4000);
    const every = window.setInterval(tick, 25000);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [router]);

  // The balloon hangs from the notification bell when the bell is on screen.
  const [spot, setSpot] = useState<{ top: number; tail: number | null }>({ top: 16, tail: null });
  useEffect(() => {
    if (!event) return;
    const at = () => {
      const bell = document.querySelector<HTMLElement>('.top-actions a[href="/dashboard/notifications"]');
      const r = bell?.getBoundingClientRect();
      const right = window.innerWidth <= 760 ? 16 : 24;
      if (r && r.width > 0 && r.bottom > 0 && r.bottom < window.innerHeight / 2) {
        setSpot({ top: r.bottom + 12, tail: Math.max(14, window.innerWidth - right - (r.left + r.width / 2) - 7) });
      } else setSpot({ top: 16, tail: null });
    };
    at();
    window.addEventListener("scroll", at, { passive: true });
    window.addEventListener("resize", at);
    return () => {
      window.removeEventListener("scroll", at);
      window.removeEventListener("resize", at);
    };
  }, [event]);

  if (!event) return null;
  return (
    <div
      className={`sandbox-balloon${spot.tail === null ? " no-tail" : ""}`}
      style={{ top: spot.top, ["--tail" as string]: `${spot.tail ?? 0}px` }}
      role="status"
      aria-live="polite"
    >
      <span className="balloon-icon" aria-hidden="true"><NavIcon name={ICON[event.kind] || "messages"} size={20} /></span>
      <span className="balloon-text">
        <small>Just arrived</small>
        <b>{event.title}</b>
        {event.body && <span>{event.body}</span>}
        <span className="balloon-actions">
          <a className="btn small-btn" href={event.href} onClick={() => setEvent(null)}>{event.action} &rarr;</a>
          <button type="button" className="plain-button" onClick={() => setEvent(null)}>Later</button>
        </span>
      </span>
    </div>
  );
}
