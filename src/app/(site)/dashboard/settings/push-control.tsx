"use client";
import { useEffect, useState } from "react";

const toBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function PushControl({ enabled, vapid }: { enabled: boolean; vapid?: string }) {
  const [on, setOn] = useState(enabled);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(true);
  useEffect(() => { setOk("serviceWorker" in navigator && "PushManager" in window && "Notification" in window); }, []);
  async function enable() {
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setMsg("Your browser blocked alerts. You can allow them in the browser's site settings.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(vapid || "") }));
      const r = await fetch("/api/alerts/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error("save");
      setOn(true); setMsg("Alerts are on for this device.");
    } catch { setMsg("We could not turn alerts on here. Please try again."); }
  }
  async function disable() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await fetch("/api/alerts/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub?.endpoint }) });
      await sub?.unsubscribe();
    } catch {}
    setOn(false); setMsg("Alerts are off for this device.");
  }
  return (
    <div className="item" data-push-control>
      <strong>Notifications on this device</strong>
      <p>Free, and nothing to install beyond adding PsyAlliance to your home screen on a phone.</p>
      <p className="micro-note" role="status" data-push-status>{!ok ? "This browser cannot show alerts. On an iPhone, add PsyAlliance to your home screen first." : msg || (on ? "On" : "Off")}</p>
      {ok ? (on ? <button type="button" className="btn secondary small-btn" onClick={disable}>Turn off on this device</button> : <button type="button" className="btn small-btn" onClick={enable} disabled={!vapid}>Turn on alerts</button>) : null}
    </div>
  );
}
