import { test, expect, type Browser, type Page } from "@playwright/test";
import { q, one, assertLocal } from "../../../lib/staging";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// v7 (Nick's second 9 Nov walkthrough): the Hub's availability bands and clickable action rows, Cover's empty column,
// a declined cover request leaving Active, caseload import from a spreadsheet, renaming a client, the red/green
// Choose colleagues tabs, and attach and voice notes inside a card's conversation. Needs the demo build.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.beforeAll(async () => {
  const env = await q<{ v: string }>("select private.cfg('app_env') as v");
  test.skip(env[0]?.v !== "demo", "needs the demo configuration (app_env = demo)");
});

async function enter(browser: Browser) {
  const r = await one<{ token: string }>("insert into sandbox_passes(label) values ($1) returning token", [`e2e-v7-${Date.now()}`]);
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

test.describe("V7-SBX", () => {
  test.setTimeout(240_000);

  test("V7-SBX-01 the Hub: availability sits under each card, no Collapse, and a whole action row opens the request", async ({ browser }) => {
    const { context, page, gid } = await enter(browser);
    await arrive(gid, 1);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await expect(page.locator(".hub-svc .hub-svc-av")).toHaveCount(3);
    await expect(page.locator(".hub-av-line")).toContainText("Your availability");
    await expect(page.locator(".hub-av-card")).toHaveCount(0);
    await click(page, "hub-toggle");
    await page.waitForTimeout(400);
    await expect(page.locator(".hub-collapse")).toHaveCount(0);
    await page.locator(".hub-row.is-clickable .hub-row-text").first().click();
    await expect(page.locator(".modal")).toBeVisible({ timeout: 10_000 });
    await context.close();
  });

  test("V7-SBX-02 a cover request you decline leaves Active at once", async ({ browser }) => {
    const { context, page, gid } = await enter(browser);
    const e = await arrive(gid, 1);
    await page.goto(`/dashboard/cover?plan=${e.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".modal", { timeout: 20_000 });
    await page.waitForTimeout(800);
    await click(page, `cover-answer:${e.id}:${(await one<{ id: string }>("select id::text from coverage_plan_cases where coverage_plan_id=$1 order by id limit 1", [e.id])).id}:declined`);
    await page.waitForTimeout(2000);
    await page.goto("/dashboard/cover", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await expect(page.locator(".split-lists")).not.toContainText("Winter holiday cover");
    await click(page, "cover-filter:past");
    await page.waitForTimeout(400);
    await expect(page.locator(".split-lists")).toContainText("Winter holiday cover");
    await context.close();
  });

  test("V7-SBX-03 Plan cover: no AI box; a spreadsheet imports needs only; a client can be renamed; gaps block Continue", async ({ browser }) => {
    const { context, page } = await enter(browser);
    await page.goto("/dashboard/cover", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await click(page, "cover-start");
    await page.waitForSelector(".modal .import-panel");
    await expect(page.locator(".modal .ai-box")).toHaveCount(0);
    const dir = mkdtempSync(join(tmpdir(), "v7-"));
    writeFileSync(join(dir, "caseload.csv"), "Client name,Main need,State,Age,Setting\nJane Doe,anxiety,Massachusetts,34,telehealth\nJohn Roe,depression,,adult,in person\n");
    const chooser = page.waitForEvent("filechooser");
    await click(page, "cover-import");
    await (await chooser).setFiles(join(dir, "caseload.csv"));
    await expect(page.locator(".modal .import-note")).toContainText("Imported 2 clients");
    await expect(page.locator(".modal .import-note")).toContainText("Left out: Client name");
    await page.fill("#cover-name", "Winter break");
    await page.locator('.modal button[form="cover-plan-form"]').click();
    await expect(page.locator(".modal .cdisc.needs-fix")).toHaveCount(1);
    await click(page, "client-edit:1");
    await click(page, "client-rename");
    await page.fill("#client-label", "Tuesday 4pm");
    await page.locator('.modal button[name="save-mode"][value="save"]').click();
    await expect(page.locator(".modal .client-discs")).toContainText("Tuesday 4pm");
    await click(page, "needs-continue");
    await page.waitForTimeout(600);
    await expect(page.locator(".modal .field-error")).toContainText("Client 2");
    await context.close();
  });

  test("V7-SBX-04 a card's conversation has attach and a voice note, as in Messages", async ({ browser }) => {
    const { context, page, gid } = await enter(browser);
    const e = await arrive(gid, 2);
    await page.goto(`/dashboard/referrals?referral=${e.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".modal", { timeout: 20_000 });
    await click(page, `ask-referral:${e.id}`);
    await page.fill("#question-text", "Are mornings essential?");
    await page.locator('#ask-form button[type="submit"]').click();
    await page.waitForTimeout(2500);
    await expect(page.locator('.modal .quick-form [data-action^="qattach:"]')).toHaveCount(1);
    await expect(page.locator('.modal .quick-form [data-action^="qrecord:"]')).toHaveCount(1);
    await page.locator('.modal [data-action^="qattach:"]').click();
    await expect(page.locator(".modal").last()).toContainText("PsyAlliance Library");
    await context.close();
  });
});
