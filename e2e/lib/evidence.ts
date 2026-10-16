import type { Page, TestInfo } from "@playwright/test";

// Console and network evidence, sanitised before it is written anywhere:
// no cookies, tokens, codes, passwords or reset links leave the browser.
const SECRET_PARAMS = /([?&#](?:code|token|token_hash|access_token|refresh_token|apikey|key|password|pass|t)=)[^&#\s]*/gi;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const BEARER = /(bearer\s+)[A-Za-z0-9._-]+/gi;
const SANDBOX_PATH = /(\/(?:sandbox|i|availability-check)\/)[A-Za-z0-9_-]{8,}/g;

export function sanitise(text: string): string {
  return String(text).replace(SECRET_PARAMS, "$1[redacted]").replace(JWT, "[jwt]").replace(BEARER, "$1[redacted]").replace(SANDBOX_PATH, "$1[token]");
}

export type Evidence = { console: string[]; network: string[]; pageErrors: string[] };

// Collects what a reviewer needs: console errors and warnings, failed or
// error-status requests, and uncaught page errors.
export function watch(page: Page): Evidence {
  const ev: Evidence = { console: [], network: [], pageErrors: [] };
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") ev.console.push(`${m.type()}: ${sanitise(m.text()).slice(0, 500)}`);
  });
  page.on("pageerror", (e) => ev.pageErrors.push(sanitise(`${e.name}: ${e.message}`).slice(0, 500)));
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText || "failed";
    if (/ERR_ABORTED/.test(why)) return; // navigations cancelled by the next navigation
    ev.network.push(`FAILED ${r.method()} ${sanitise(r.url())} ${why}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) ev.network.push(`${r.status()} ${r.request().method()} ${sanitise(r.url())}`);
  });
  return ev;
}

export async function attachEvidence(testInfo: TestInfo, ev: Evidence) {
  const body = [
    "Console (errors and warnings):",
    ...(ev.console.length ? ev.console : ["  none"]),
    "",
    "Network (failed or status >= 400):",
    ...(ev.network.length ? ev.network : ["  none"]),
    "",
    "Uncaught page errors:",
    ...(ev.pageErrors.length ? ev.pageErrors : ["  none"]),
  ].join("\n");
  await testInfo.attach("console-and-network.txt", { body, contentType: "text/plain" });
}

// A named screenshot for the evidence trail.
export async function shot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  const body = await page.screenshot({ fullPage });
  await testInfo.attach(`${name}.png`, { body, contentType: "image/png" });
}
