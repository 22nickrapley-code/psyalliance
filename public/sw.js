// PsyAlliance alerts. The push carries no text; we ask the app for the wording while signed in.
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let body = "You have something waiting in PsyAlliance. Review request.", link = "/dashboard";
    try { const r = await fetch("/api/alerts/latest", { credentials: "include", cache: "no-store" }); if (r.ok) { const j = await r.json(); body = j.body || body; link = j.link || link; } } catch (e) {}
    await self.registration.showNotification("PsyAlliance", { body, data: { link }, tag: "psyalliance-alert" });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/dashboard";
  event.waitUntil(self.clients.openWindow(link));
});
