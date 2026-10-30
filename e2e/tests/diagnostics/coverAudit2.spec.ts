import { test } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { q } from "../../lib/staging";
const OUT = process.env.OUT || "/tmp/cshots";
const avery = account("avery").id;
for (const w of [1440, 390]) test(`coverAudit2 ${w}`, async ({ browser }) => {
  const phone = w < 700;
  const context = await browser.newContext(phone ? { viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 1000 } });
  const page = await context.newPage();
  const snap = async (n: string, full = false) => { await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${w}-${n}.png`, fullPage: full }); };
  await page.goto("/tour/scene/cover/calendar"); await page.waitForFunction(() => document.documentElement.dataset.scene === "ready");
  // a day with only an incoming plan
  await page.locator('[data-action="calendar-day:2026-10-24"]').click(); await snap("day-incoming");
  await page.keyboard.press("Escape");
  await page.locator('[data-action="calendar-month:1"]').click();
  await page.waitForTimeout(300);
  await snap("calendar-nov", true);
  await page.locator('[data-action="calendar-day:2026-11-04"]').click(); await snap("day-own");
  await context.close();
});
test("coverAudit2 empty", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await signInAs(context, "avery", baseURL!);
  const page = await context.newPage();
  await q(`delete from coverage_plans where profile_id = $1`, [avery]);
  await page.goto("/dashboard/cover"); await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/1440-empty.png` });
  await context.close();
});
