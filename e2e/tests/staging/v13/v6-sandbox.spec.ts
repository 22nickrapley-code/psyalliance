import { test, expect, type Browser, type Page } from "@playwright/test";
import { q, one, assertLocal } from "../../../lib/staging";

// v6 (Nick's 9 Nov walkthrough, migration 0132): incoming cover reads like an incoming referral, questions are asked
// and answered inside the card, an empty outgoing start, one Hub action per plan, Later snoozes, attachments from the
// Library. Needs the demo build and a demo database (see sandbox.spec.ts).
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.beforeAll(async () => {
  const env = await q<{ v: string }>("select private.cfg('app_env') as v");
  test.skip(env[0]?.v !== "demo", "needs the demo configuration (app_env = demo)");
});

async function enter(browser: Browser) {
  const r = await one<{ token: string }>("insert into sandbox_passes(label) values ($1) returning token", [`e2e-v6-${Date.now()}`]);
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/sandbox/${r.token}`);
  await page.getByRole("button", { name: /Enter the sandbox/ }).click();
  await page.waitForSelector(".sidebar", { timeout: 120_000 });
  await page.waitForTimeout(1200);
  const gid = (await one<{ guest_id: string }>("select guest_id from sandbox_passes where token=$1", [r.token])).guest_id;
  return { context, page, gid };
}
const arrive = async (gid: string, step: number) => (await one<{ e: any }>("select private.sandbox_story_event($1, $2) e", [gid, step])).e;
const click = (page: Page, a: string) => page.evaluate((x) => (document.querySelector(`[data-action="${x}"]`) as HTMLElement | null)?.click(), a);
const open = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".modal", { timeout: 20_000 });
  await page.waitForTimeout(800);
};

test.describe("V6-SBX the calmer cards", () => {
  test.setTimeout(240_000);

  test("V6-SBX-01 the guest starts with no outgoing referrals or cover plans, and no guided tasks", async ({ browser }) => {
    const { context, page, gid } = await enter(browser);
    const n = await one<{ p: number; r: number }>("select (select count(*) from coverage_plans where profile_id=$1)::int p, (select count(*) from referral_requests where requesting_profile_id=$1)::int r", [gid]);
    expect(n.p).toBe(0);
    expect(n.r).toBe(0);
    await expect(page.locator(".guide-panel")).toHaveCount(0);
    const kinds: string[] = [];
    for (let s = 1; s <= 8; s++) kinds.push((await arrive(gid, s))?.kind);
    expect(kinds).toEqual(["cover", "referral", "consult", "cover", "consult", "referral", "message", "consult"]);
    await context.close();
  });

  test("V6-SBX-02 an incoming cover request: the need in one box, the message, one set of choices, no duplicate block", async ({ browser }) => {
    const { context, page, gid } = await enter(browser);
    const e = await arrive(gid, 1);
    await open(page, `/dashboard/cover?plan=${e.id}`);
    await expect(page.locator(".modal .jt-node")).toHaveCount(6);
    await expect(page.locator(".modal .need-card")).toHaveCount(1);
    await expect(page.locator(".modal .need-dl")).toContainText("Massachusetts");
    await expect(page.locator(".modal .need-message")).toContainText("Message from Eli");
    await expect(page.locator(".modal .needs-box")).toHaveCount(0);
    await expect(page.locator('.modal [data-action$=":interested"]')).toHaveCount(1);
    await expect(page.locator(".modal .modal-footer")).toContainText("Done");
    // The need box collapses and opens again.
    await page.locator(".modal .need-card-head").click();
    await expect(page.locator(".modal .need-dl")).toHaveCount(0);
    await page.locator(".modal .need-card-head").click();
    await expect(page.locator(".modal .need-dl")).toHaveCount(1);
    await context.close();
  });

  test("V6-SBX-03 a question is asked inside the referral card and the conversation stays there", async ({ browser }) => {
    const { context, page, gid } = await enter(browser);
    const e = await arrive(gid, 2);
    await open(page, `/dashboard/referrals?referral=${e.id}`);
    await click(page, `ask-referral:${e.id}`);
    await page.fill("#question-text", "Are mornings before 10 essential?");
    await page.locator('#ask-form button[type="submit"]').click();
    await page.waitForTimeout(2500);
    await expect(page.locator(".modal")).toBeVisible();
    await expect(page.locator(".modal .convo-box")).toContainText("Are mornings before 10 essential?");
    await expect(page.locator(".modal .reply-panel")).toContainText("You asked Lena a question");
    expect(page.url()).not.toContain("/messages");
    await context.close();
  });

  test("V6-SBX-04 a referral you say you can't take moves to Completed", async ({ browser }) => {
    const { context, page, gid } = await enter(browser);
    const e = await arrive(gid, 2);
    await open(page, `/dashboard/referrals?referral=${e.id}`);
    await click(page, `referral-answer:${e.id}:declined`);
    await page.waitForTimeout(2000);
    await page.goto("/dashboard/referrals", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await click(page, "referral-filter:discussion");
    await page.waitForTimeout(400);
    await expect(page.locator(".split-lists")).not.toContainText("From Lena Larkhollow");
    await click(page, "referral-filter:placed");
    await page.waitForTimeout(400);
    await expect(page.locator(".split-lists")).toContainText("From Lena Larkhollow");
    await context.close();
  });

  test("V6-SBX-05 Later snoozes for the time set in Settings, 24 hours by default", async ({ browser }) => {
    const { context, page, gid } = await enter(browser);
    await arrive(gid, 2);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sidebar");
    await page.waitForTimeout(1200);
    await click(page, "hub-toggle");
    await page.waitForTimeout(400);
    const later = page.locator('[data-action^="hub-later:referral:"]').first();
    await expect(later).toHaveAttribute("title", "Snooze for 24 hours");
    await later.click();
    await page.waitForTimeout(1500);
    await expect(page.locator(".hub-snoozed-line")).toContainText("1 action is snoozed");
    await click(page, "settings");
    await page.waitForTimeout(600);
    await expect(page.locator('.modal [data-action="hub-snooze:24"]')).toHaveAttribute("aria-pressed", "true");
    await context.close();
  });

  test("V6-SBX-06 Attach offers your computer, your own library and the PsyAlliance Library", async ({ browser }) => {
    const { context, page } = await enter(browser);
    await page.goto("/dashboard/messages", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => (document.querySelector(".inbox-item, [data-action^='thread:'], [data-action^='colleague:']") as HTMLElement | null)?.click());
    await page.waitForTimeout(800);
    await click(page, "attach");
    await page.waitForTimeout(800);
    await expect(page.locator(".modal")).toContainText("From your computer");
    await expect(page.locator(".modal")).toContainText("Your library");
    await expect(page.locator(".modal")).toContainText("PsyAlliance Library");
    await context.close();
  });
});
