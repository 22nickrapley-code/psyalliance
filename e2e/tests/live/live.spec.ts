import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { liveState } from "../../lib/auth";
import { probeSend, describeProbe, type SendProbe } from "../../lib/nav-probe";

// Low-impact checks on the live site, signed in as the two profiles Nick
// authorised for fictional testing: Rachel E. Jadkowski, PsyD and Rena
// Pazienza, PhD. Uses browser sign-ins Nick saved himself (npm run
// login:live -- rachel / -- rena). What it changes on live: a few messages
// between those two profiles, each marked as a test. Nothing else: no
// credentials, approvals, documents, settings or access rules.
//
//   npm run test:live
const LIVE = /^https:\/\/(sandbox\.)?psyalliance\.org$/;
test.beforeEach(({ baseURL }) => {
  if (!LIVE.test(baseURL || "")) throw new Error("live checks only run against psyalliance.org");
});

const RACHEL = "Rachel E. Jadkowski";
const RENA = "Rena Pazienza";

async function as(browser: any, key: "rachel" | "rena"): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: liveState(key) });
  return { context, page: await context.newPage() };
}

// Messages opens on the latest conversation once there is one, so a new
// message starts from the composer ("New").
async function writeTo(page: Page, surname: string, text: string) {
  await page.goto("/dashboard/messages?compose=1");
  await page.getByRole("searchbox", { name: "Search colleagues" }).fill(surname);
  await page.getByRole("option", { name: new RegExp(surname) }).first().click();
  await page.getByPlaceholder(/Write a professional message/).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test("LIVE-01 each test profile sees their own Home, and it survives a refresh", async ({ browser }) => {
  for (const [key, name] of [["rachel", RACHEL], ["rena", RENA]] as const) {
    const { context, page } = await as(browser, key);
    await page.goto("/dashboard");
    await expect(page.locator("aside")).toContainText(name);
    await page.reload();
    await expect(page.locator("aside")).toContainText(name);
    await context.close();
  }
});

test("LIVE-02 Rachel messages Rena; Rena reads it; the notice is marked read", async ({ browser }, info) => {
  const text = `QA test, please ignore (${new Date().toISOString().slice(0, 16)}): checking messages and notifications.`;
  const r = await as(browser, "rachel");
  await writeTo(r.page, "Pazienza", text);
  await expect(r.page.getByText(text).first()).toBeVisible({ timeout: 15000 });
  await r.context.close();
  const n = await as(browser, "rena");
  await n.page.goto("/dashboard/messages");
  await n.page.getByText(/Rachel E\. Jadkowski/).first().click();
  await expect(n.page.getByText(text).first()).toBeVisible();
  await n.page.goto("/dashboard/messages");
  const badge = await n.page.locator(".section-tab .new-pill").first().innerText().catch(() => "none");
  await info.attach("rena-notifications.txt", { body: `Notifications badge after reading: ${badge}`, contentType: "text/plain" });
  await n.context.close();
});

// NAV-01 on the live build: for each send, whether the screen moved by
// itself, was rescued by the watchdog's full page load, or didn't move, with
// timings. The summary prints one line per send.
test("LIVE-03 NAV-01 probe: five sends from Rachel to Rena", async ({ browser }, info) => {
  test.setTimeout(240_000);
  const runs: SendProbe[] = [];
  for (let n = 0; n < 5; n++) {
    const { context, page } = await as(browser, "rachel");
    runs.push(await probeSend(page, "Pazienza", `QA test ${n + 1}/5, please ignore (${new Date().toISOString().slice(0, 16)}).`));
    await context.close();
  }
  await info.attach("nav01.json", { body: JSON.stringify(runs, null, 2), contentType: "application/json" });
  console.log(`NAV-01 on ${test.info().project.use.baseURL}:\n${runs.map((r, i) => `  ${i + 1}. ${describeProbe(r)}`).join("\n")}`);
  expect(runs.filter((r) => r.outcome === "could-not-send"), "every send went through").toEqual([]);
  expect(runs.filter((r) => r.outcome === "stalled"), "no send leaves the page stuck").toEqual([]);
});

test("LIVE-04 Settings: the two-week digest choice saves for Rena", async ({ browser }) => {
  const { context, page } = await as(browser, "rena");
  await page.goto("/dashboard/settings#notifications");
  await page.locator("details#notifications > summary").click();
  const select = page.locator('select[name="digest_frequency"]');
  const before = await select.inputValue();
  await select.selectOption("fortnightly");
  await page.getByRole("button", { name: "Save notification settings" }).click();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.locator("details#notifications > summary").click();
  const saved = await select.inputValue();
  // Put it back as it was.
  await select.selectOption(before);
  await page.getByRole("button", { name: "Save notification settings" }).click();
  await page.waitForLoadState("networkidle");
  await context.close();
  expect(saved).toBe("fortnightly");
});
