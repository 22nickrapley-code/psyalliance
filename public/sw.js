// PsyAlliance alerts. The push carries no text. The device asks the app, while signed in, for the alerts sent to it,
// and shows each one with its own wording, link and tag, so two alerts never replace or borrow each other's context.
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let alerts = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch("/api/alerts/latest", { method: "POST", credentials: "include", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub ? sub.endpoint : "" }) });
      if (r.ok) alerts = (await r.json()).alerts || [];
    } catch (e) {}
    if (!alerts.length) {
      // Signed out, or the alert was already shown: a generic note that opens the Hub.
      await self.registration.showNotification("PsyAlliance", { body: "You have something waiting in PsyAlliance.", data: { link: "/dashboard" }, tag: "psyalliance-generic" });
      return;
    }
    for (const a of alerts) await self.registration.showNotification("PsyAlliance", { body: a.body, data: { link: a.link }, tag: "psyalliance-" + a.id });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/dashboard";
  event.waitUntil(self.clients.openWindow(link.startsWith("/") ? link : "/dashboard"));
});
