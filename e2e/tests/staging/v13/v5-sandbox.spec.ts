import { test, expect, type Browser, type Page } from "@playwright/test";
import { q, one, assertLocal } from "../../../lib/staging";

// v5 sandbox (Nick's 8 Nov walkthrough, migration 0131): nothing waiting at the start, the first colleague after
// about two minutes and then one every four, eight in all, no group invitation, groups hidden, and the guided
// tasks with the step in the pop-up header. Needs the demo build and a demo database (see sandbox.spec.ts).
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.beforeAll(async () => {
  const env = await q<{ v: string }>("select private.cfg('app_env') as v");
  test.skip(env[0]?.v !== "demo", "needs the demo configuration (app_env = demo)");
});

async function enter(browser: Browser) {
  const r = await one<{ token: string }>("insert into sandbox_passes(label) values ($1) returning token", [`e2e-v5-${Date.now()}`]);
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/sandbox/${r.token}`);
  await page.getByRole("button", { name: /Enter the sandbox/ }).click();
  await page.waitForSelector(".sidebar", { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const gid = (await one<{ guest_id: string }>("select guest_id from sandbox_passes where token=$1", [r.token])).guest_id;
  return { context, page, gid };
}
const click = (page: Page, a: string) => page.evaluate((x) => (document.querySelector(`[data-action="${x}"]`) as HTMLElement | null)?.click(), a);

test.describe("V5-SBX the calmer, guided sandbox", () => {
  test.setTimeout(240_000);

  test("V5-SBX-01 nothing is waiting at the start, nothing unread, and the first colleague is about two minutes away", async ({ browser }) => {
    const { context, page, gid } = await enter(browser);
    await expect(page.locator("#app")).toContainText("You’re up to date");
    const unread = await one<{ n: number }>("select count(*)::int n from notification_deliveries where recipient_profile_id=$1 and channel='in_app' and read_at is null", [gid]);
    expect(unread.n).toBe(0);
    const st = await one<{ step: number; secs: number }>("select step, extract(epoch from next_at - now())::int secs from private.sandbox_story where profile_id=$1", [gid]);
    expect(st.step).toBe(0);
    expect(st.secs).toBeGreaterThan(60);
    expect(st.secs).toBeLessThanOrEqual(120);
    // No unread messages either (the Messages badge is empty).
    await expect(page.locator('.nav-item[data-action="nav:messages"] .nav-badge, .nav-item[data-action="nav:messages"] b')).toHaveCount(0);
    await context.close();
  });

  test("V5-SBX-02 eight colleagues get in touch, four minutes apart, none of them about a consultation group", async ({ browser }) => {
    const { context, gid } = await enter(browser);
    const kinds: string[] = [];
    for (let step = 1; step <= 8; step++) {
      const ev = await one<{ e: any }>("select private.sandbox_story_event($1, $2) e", [gid, step]);
      expect(ev.e, `step ${step} produced an arrival`).not.toBeNull();
      expect(JSON.stringify(ev.e)).not.toMatch(/Circle|group/i);
      kinds.push(ev.e.kind);
    }
    expect(new Set(kinds)).toEqual(new Set(["cover", "referral", "message", "consult"]));
    const fn = await one<{ d: string }>("select pg_get_functiondef('public.sandbox_tick'::regproc) d");
    expect(fn.d).toContain("st.step >= 8");
    expect(fn.d).toContain("interval '4 minutes'");
    await context.close();
  });

  test("V5-SBX-03 groups are switched off: no Thursday Circle in Consult or Messages, and the six audiences are offered", async ({ browser }) => {
    const { context, page } = await enter(browser);
    await click(page, "nav:consult");
    await page.waitForTimeout(600);
    await expect(page.locator("#app")).not.toContainText("Your consultation group");
    await expect(page.locator(".consult-pills button.active")).toContainText("Active");
    await click(page, "peer-start");
    await page.waitForTimeout(600);
    const tiles = await page.locator(".modal .audience-tile strong").allInnerTexts();
    expect(tiles).toEqual(["Your trusted colleagues", "Worked with before", "Suggested by PsyAlliance", "One colleague", "A few colleagues", "The whole verified network"]);
    await click(page, "close-modal");
    await click(page, "nav:messages");
    await page.waitForTimeout(600);
    await expect(page.locator("#app")).not.toContainText("Thursday Circle");
    await context.close();
  });

  test("V5-SBX-04 a guided task puts the step in the pop-up header and outlines the next thing to use", async ({ browser }) => {
    const { context, page } = await enter(browser);
    await click(page, "guide-start:referral");
    await page.waitForTimeout(900);
    await expect(page.locator(".modal-header .guide-step")).toContainText("Trying: Refer a client");
    await expect(page.locator("#guide-step-text")).toContainText("main need");
    await expect(page.locator(".guide-target")).toHaveCount(1);
    await expect(page.locator(".guide-target")).toContainText("Main need");
    const v = await page.locator(".guide-target select").first().locator("option").nth(1).getAttribute("value");
    await page.locator(".guide-target select").first().selectOption(v!);
    await page.waitForTimeout(400);
    await expect(page.locator("#guide-step-text")).toContainText("See matched colleagues");
    await context.close();
  });

  test("V5-SBX-05 the Settings pop-up starts with the Sandbox panel", async ({ browser }) => {
    const { context, page } = await enter(browser);
    await click(page, "settings");
    await page.waitForTimeout(500);
    const first = await page.locator(".modal-body > *").first().getAttribute("class");
    expect(first).toContain("sandbox-panel");
    await context.close();
  });
});
