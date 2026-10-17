import type { Page } from "@playwright/test";

// NAV-01 probe: sends one message from the composer and records how the
// screen got to the conversation afterwards.
//   soft-navigation        the app moved by itself (normal)
//   recovered-by-watchdog  nothing moved, so live.tsx loaded the page after
//                          its 2.5 s wait (the NAV-01 safety net)
//   full-load-by-next      the framework itself chose a full page load
//                          straight after the save answered
//   stalled                the message didn't appear within 20 s
//   could-not-send         the test couldn't fill in or press Send
export type SendProbe = {
  outcome: "soft-navigation" | "recovered-by-watchdog" | "full-load-by-next" | "stalled" | "could-not-send";
  shownMs: number | null; // Send pressed -> message on screen
  actionMs: number | null; // Send pressed -> the save's answer fully arrived
  navAfterActionMs: number | null; // save answered -> a full page load started
  pageLoads: number; // full page loads started after Send (more than 1 = restarted)
  pageServerMs: number | null; // first full page load: request -> page fully received
  actionStatus: number | null;
  redirect: string | null;
  pageData: string[]; // follow-up page-data requests: "status path"
  finalPath: string;
};

export async function probeSend(page: Page, surname: string, text: string): Promise<SendProbe> {
  const result: SendProbe = { outcome: "could-not-send", shownMs: null, actionMs: null, navAfterActionMs: null, pageLoads: 0, pageServerMs: null, actionStatus: null, redirect: null, pageData: [], finalPath: "" };
  await page.goto("/dashboard/messages?compose=1");
  await page.waitForLoadState("networkidle");
  try {
    await page.getByRole("searchbox", { name: "Search colleagues" }).fill(surname);
    await page.getByRole("option", { name: new RegExp(surname) }).first().click();
    await page.getByPlaceholder(/Write a professional message/).fill(text);
  } catch {
    result.finalPath = new URL(page.url()).pathname;
    return result;
  }

  let t0 = 0;
  let actionAt = 0;
  let navAt = 0;
  let firstNav: unknown = null;
  page.on("request", (req) => {
    if (!t0 || !req.isNavigationRequest() || req.frame() !== page.mainFrame()) return;
    result.pageLoads += 1;
    if (!navAt) {
      navAt = Date.now();
      firstNav = req;
    }
  });
  // The save's answer counts from its headers: when the next page is about to
  // load in full, the browser may drop the rest of an empty answer.
  page.on("response", (res) => {
    if (!t0 || actionAt) return;
    const req = res.request();
    if (req.method() !== "POST" || !req.headers()["next-action"]) return;
    actionAt = Date.now();
    result.actionStatus = res.status();
    result.redirect = res.headers()["x-action-redirect"] ?? null;
  });
  page.on("requestfinished", async (req) => {
    if (!t0) return;
    const at = Date.now();
    if (req === firstNav) result.pageServerMs = at - navAt;
    const h = req.headers();
    if (h["rsc"] === "1" && !h["next-action"]) {
      const res = await req.response().catch(() => null);
      result.pageData.push(`${res?.status() ?? "?"} ${new URL(req.url()).pathname}`);
    }
  });

  t0 = Date.now();
  try {
    await page.getByRole("button", { name: "Send" }).click();
  } catch {
    result.finalPath = new URL(page.url()).pathname;
    return result;
  }
  const shownAt = await page
    .getByText(text)
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => Date.now(), () => 0);
  await page.waitForTimeout(500);

  result.shownMs = shownAt ? shownAt - t0 : null;
  result.actionMs = actionAt ? actionAt - t0 : null;
  result.navAfterActionMs = navAt && actionAt ? navAt - actionAt : null;
  result.finalPath = new URL(page.url()).pathname;
  if (!shownAt) result.outcome = "stalled";
  else if (!navAt) result.outcome = "soft-navigation";
  else if (actionAt && navAt - actionAt >= 2000) result.outcome = "recovered-by-watchdog";
  else result.outcome = "full-load-by-next";
  return result;
}

export function describeProbe(r: SendProbe): string {
  const ms = (v: number | null) => (v === null ? "-" : `${(v / 1000).toFixed(1)} s`);
  return [
    `${r.outcome}: on screen after ${ms(r.shownMs)}${r.shownMs !== null && r.shownMs > 5000 ? " (SLOW)" : ""}`,
    `save answered after ${ms(r.actionMs)} (${r.actionStatus ?? "-"}${r.redirect ? ", to " + r.redirect.split(";")[0] : ""})`,
    `full page load ${r.navAfterActionMs === null ? "none" : `${ms(r.navAfterActionMs)} after the save, ${r.pageLoads} started, first took ${ms(r.pageServerMs)}`}`,
    `page data ${r.pageData.join(", ") || "none"}`,
    `ended on ${r.finalPath}`,
  ].join("; ");
}
