// One privacy-minimised practice event: a name and a need, in the "practice" namespace. No identity, no text.
export function practiceEvent(event: string, need?: string) {
  try {
    void fetch("/api/start-event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, need, namespace: "practice" }), keepalive: true });
  } catch {}
}
