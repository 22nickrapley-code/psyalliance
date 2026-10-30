import { test } from "@playwright/test";
const OUT = process.env.OUT || "/tmp/cshots";
for (const w of [1440, 390]) test(`coverAudit3 ${w}`, async ({ browser }) => {
  const phone = w < 700;
  const context = await browser.newContext(phone ? { viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 1000 } });
  const page = await context.newPage();
  for (const slug of ["plan", "clients", "busy", "matches", "review"]) {
    await page.goto(`/tour/scene/cover/${slug}`);
    await page.waitForFunction(() => ["ready", "error"].includes(document.documentElement.dataset.scene || ""), null, { timeout: 30000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${w}-flow-${slug}.png` });
  }
  await context.close();
});
