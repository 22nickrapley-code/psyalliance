import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, gatewayFault } from "../../../lib/staging";
import { coverPlan } from "../../../lib/scenarios";

// V13 workspace: the old resilience, runner and title checks, rewritten for the
// approved screens (they replace RUN-001, RES-CONC-01/02 and RES-FAULT-01/02/03,
// which drove the screens version 13 replaced). Fictional staging members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.afterEach(async () => {
  await gatewayFault({ clear: true });
});

const hub = async (page: Page) => expect(page.locator("#app .sidebar")).toBeVisible({ timeout: 30000 });
const startDirect = async (page: Page, id: string) => {
  await page.getByRole("button", { name: "New message" }).click();
  await page.locator(`[data-action="person-message:${id}"]`).click();
  await expect(page.locator("#message-input")).toBeVisible();
};

test("RV-01 a member signs in and The Hub loads with their name; a reload keeps it", async ({ page, context, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard");
  await hub(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Hub");
  await expect(page.locator(".profile-button")).toContainText("Avery");
  await page.reload();
  await hub(page);
  await expect(page.locator(".profile-button")).toContainText("Avery");
  expect(errors).toEqual([]);
});

test("RV-02 each section has its own page title, in the tab, the history and for a screen reader", async ({ page, context, baseURL }) => {
  await signInAs(context, "avery", baseURL!);
  const want: [string, string][] = [
    ["/dashboard", "The Hub"], ["/dashboard/cover", "Cover"], ["/dashboard/referrals", "Referrals"], ["/dashboard/consult", "Consult"],
    ["/dashboard/network", "Network / Search"], ["/dashboard/messages", "Messages"], ["/dashboard/library", "Library"],
  ];
  for (const [path, title] of want) {
    await page.goto(path);
    await hub(page);
    await expect.poll(() => page.title()).toBe(`PsyAlliance · ${title}`);
  }
  // Moving between sections from inside the workspace changes it too.
  await page.locator('[data-action="nav:cover"]').first().click();
  await expect.poll(() => page.title()).toBe("PsyAlliance · Cover");
  await page.locator('[data-action="nav:messages"]').first().click();
  await expect.poll(() => page.title()).toBe("PsyAlliance · Messages");
});

test("RV-03 two colleagues answer the same client's Cover request at the same moment: one is covering, the other is told", async ({ browser, baseURL }) => {
  const plan = await coverPlan("avery", ["bram", "cass"], ["Client C"]);
  const keys = ["bram", "cass"];
  const pages: Page[] = [];
  for (const k of keys) {
    const c = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    await signInAs(c, k, baseURL!);
    const p = await c.newPage();
    await p.goto(`/dashboard/cover?plan=${plan.planId}`);
    await expect(p.locator(`[data-action="cover-answer:${plan.planId}:${plan.cases[0].id}:accepted"]`)).toBeVisible({ timeout: 30000 });
    pages.push(p);
  }
  await Promise.all(pages.map((p) => p.locator(`[data-action="cover-answer:${plan.planId}:${plan.cases[0].id}:accepted"]`).click()));
  await Promise.all(pages.map((p) => p.waitForTimeout(2500)));
  const rows = await q(`select status::text s, requested_profile_id::text p from coverage_requests where coverage_plan_case_id = $1`, [plan.cases[0].id]);
  const texts = await Promise.all(pages.map((p) => p.locator("#app").innerText()));
  for (const p of pages) await p.context().close();
  expect(rows.filter((r: any) => r.s === "accepted")).toHaveLength(1);
  // The one who did not win is told, in words, not by a failure.
  const loser = rows.find((r: any) => r.s !== "accepted")!;
  const loserText = texts[keys.findIndex((k) => account(k).id === loser.p)];
  expect(loserText).toMatch(/already|taken|closed|no longer/i);
  expect(loserText).not.toMatch(/PGRST|violates|Injected failure|permission denied/i);
});

test("RV-04 a double click on Send message posts the message once", async ({ page, context, baseURL }) => {
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard/messages");
  await hub(page);
  await startDirect(page, account("fenn").id);
  const text = `QA double click ${Date.now()}`;
  await page.locator("#message-input").fill(text);
  await page.getByRole("button", { name: "Send message" }).dblclick();
  await page.waitForTimeout(4000);
  expect((await one(`select count(*)::int n from conversation_messages where body = $1`, [text])).n).toBe(1);
});

test("RV-05 a message the database cannot save says so, keeps the text, and nothing is half-saved", async ({ page, context, baseURL }) => {
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard/messages");
  await hub(page);
  await startDirect(page, account("cass").id);
  const text = `QA fault ${Date.now()}: this should not be lost.`;
  await gatewayFault({ path: "/rest/v1/rpc/message_send", method: "POST", status: 503, times: 3 });
  await page.locator("#message-input").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message-group.outgoing .delivery-state.failed, .delivery-state.failed").first()).toBeVisible({ timeout: 30000 });
  const body = await page.locator("#app").innerText();
  expect(body).toContain(text);
  expect(body, "no database wording or crash screen").not.toMatch(/Injected failure|violates|PGRST|permission denied|Something went wrong|didn.t load completely/i);
  expect((await one(`select count(*)::int n from conversation_messages where body = $1`, [text])).n, "nothing saved").toBe(0);
  // Back up: Retry sends it, once.
  await gatewayFault({ clear: true });
  await page.getByRole("button", { name: /Retry/ }).first().click();
  await expect(page.locator(".message-group.outgoing .delivery-state.sent").last()).toBeVisible({ timeout: 30000 });
  expect((await one(`select count(*)::int n from conversation_messages where body = $1`, [text])).n).toBe(1);
});

test("RV-06 an answer that fails to reach the database shows a message and can be tried again", async ({ browser, baseURL }) => {
  const plan = await coverPlan("avery", ["fenn"], ["Client F2"]);
  const id = plan.cases[0].requests.fenn;
  const c = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(c, "fenn", baseURL!);
  const page = await c.newPage();
  await page.goto(`/dashboard/cover?plan=${plan.planId}`);
  const accept = page.locator(`[data-action="cover-answer:${plan.planId}:${plan.cases[0].id}:accepted"]`);
  await expect(accept).toBeVisible({ timeout: 30000 });
  await gatewayFault({ path: "/rest/v1/rpc/cover_answer", method: "POST", status: 503, times: 1 });
  await accept.click();
  await expect(page.locator(".toast, [role=alert], [role=status]").filter({ hasText: /couldn.t|try again|not saved|went wrong/i }).first()).toBeVisible({ timeout: 20000 });
  expect((await one(`select status::text s from coverage_requests where id = $1`, [id])).s).toBe("sent");
  await expect(accept).toBeVisible();
  await accept.click();
  await expect.poll(async () => (await one(`select status::text s from coverage_requests where id = $1`, [id])).s, { timeout: 20000 }).toBe("accepted");
  await c.close();
});

test("RV-07 a slow database (3 seconds a call) still loads The Hub", async ({ page, context, baseURL }) => {
  await signInAs(context, "avery", baseURL!);
  await gatewayFault({ path: "/rest/v1/", pass: true, delayMs: 3000, times: 200 } as any);
  const t0 = Date.now();
  await page.goto("/dashboard");
  await hub(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Hub");
  expect(Date.now() - t0, "slower, but it loads").toBeGreaterThan(3000);
});
