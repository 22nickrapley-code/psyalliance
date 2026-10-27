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
  // The window closes only once the conversation is open; typing before that goes nowhere.
  await expect(page.locator(".overlay")).toHaveCount(0);
  await expect(page.locator("#message-input")).toBeVisible();
};
// Short messages ("toasts") vanish after a few seconds, so keep what each page said.
const listenToasts = (page: Page) =>
  page.evaluate(() => {
    (window as any).__toasts = [];
    const el = document.querySelector("#toast")!;
    new MutationObserver(() => { if (el.textContent) (window as any).__toasts.push(el.textContent); }).observe(el, { childList: true, subtree: true, characterData: true });
  });
const toastsOf = (page: Page) => page.evaluate(() => ((window as any).__toasts || []).join(" | ") as string);

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
    await listenToasts(p);
    pages.push(p);
  }
  await Promise.all(pages.map((p) => p.locator(`[data-action="cover-answer:${plan.planId}:${plan.cases[0].id}:accepted"]`).click()));
  await Promise.all(pages.map((p) => p.waitForTimeout(2500)));
  const rows = await q(`select status::text s, requested_profile_id::text p from coverage_requests where coverage_plan_case_id = $1`, [plan.cases[0].id]);
  const texts = await Promise.all(pages.map(async (p) => `${await toastsOf(p)} ${await p.locator("#app").innerText()}`));
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

test("RV-08 New message: typing a name finds a member who is not in the circle, and a nonsense name finds no one", async ({ page, context, baseURL }) => {
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard/messages");
  await hub(page);
  await page.getByRole("button", { name: "New message" }).click();
  await page.locator("#recipient-search").fill("Fenn");
  await expect(page.locator(`[data-action="person-message:${account("fenn").id}"]`)).toBeVisible();
  await page.locator("#recipient-search").fill("zzqqxx");
  // The approved window hides what does not match, so count what can be seen.
  await expect(page.locator('#recipient-list [data-action^="person-message:"]:visible')).toHaveCount(0);
});

test("RV-09 reading a conversation marks its new-message notification read", async ({ browser, baseURL }) => {
  await q(`update notification_deliveries set created_at = created_at - interval '2 days' where recipient_profile_id = $1 and created_at > now() - interval '2 days'`, [account("cass").id]);
  const a = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(a, "avery", baseURL!);
  const ap = await a.newPage();
  await ap.goto("/dashboard/messages");
  await hub(ap);
  await startDirect(ap, account("cass").id);
  const text = `QA read-through ${Date.now()}`;
  await ap.locator("#message-input").fill(text);
  await ap.getByRole("button", { name: "Send message" }).click();
  await expect(ap.locator(".message-group.outgoing .delivery-state.sent").last()).toBeVisible({ timeout: 20000 });
  const unread = async () =>
    (await one(`select count(*)::int n from notification_deliveries d join notification_events e on e.id = d.notification_event_id
                 where d.recipient_profile_id = $1 and d.channel = 'in_app' and d.read_at is null and e.event_type = 'message_received' and d.status = 'sent'`, [account("cass").id])).n;
  const before = await unread();
  const c = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(c, "cass", baseURL!);
  const cp = await c.newPage();
  await cp.goto("/dashboard/messages");
  await hub(cp);
  await cp.locator(".inbox-colleague", { hasText: "Avery" }).locator(".inbox-latest").first().click();
  await expect(cp.getByText(text).first()).toBeVisible();
  await expect.poll(unread, { timeout: 15000 }).toBe(0);
  expect(before).toBeGreaterThan(0);
  await a.close();
  await c.close();
});

test("RV-10 a message with a client's phone number is held back with a plain reason, and nothing is saved", async ({ page, context, baseURL }) => {
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard/messages");
  await hub(page);
  await startDirect(page, account("cass").id);
  const text = `QA identifiers ${Date.now()}: the client is on 617-555-0142.`;
  await page.locator("#message-input").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
  // The reason is given in the message that appears for a few seconds; the message itself stays, marked Failed.
  await expect(page.locator("#toast")).toContainText(/remove a phone number/i, { timeout: 20000 });
  await expect(page.locator(".message-group.outgoing .delivery-state.failed").last()).toBeVisible();
  expect((await one(`select count(*)::int n from conversation_messages where body = $1`, [text])).n).toBe(0);
  // Nothing about it reads like a crash.
  await expect(page.locator("#toast")).not.toContainText(/PGRST|violates|Something went wrong/i);
  await expect(page.locator("#app")).not.toContainText(/PGRST|violates|Something went wrong/i);
});

test("RV-11 a window closed in the instant after it opens leaves no error behind", async ({ page, context, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard/messages");
  await hub(page);
  // Open and close inside one frame: the window's focus step then runs with no window left.
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      (document.querySelector('[data-action="new-message"]') as HTMLElement).click();
      (document.querySelector('[data-action="close-modal"]') as HTMLElement).click();
    });
    await page.waitForTimeout(100);
  }
  await expect(page.locator(".overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});
