import { test } from "@playwright/test";
const OUT = process.env.OUT || "/tmp/cshots";
const widths = [1920, 1440, 1100, 820, 390, 320];
for (const w of widths) test(`coverAudit ${w}`, async ({ browser, baseURL }) => {
  const phone = w < 700;
  const context = await browser.newContext(phone ? { viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 1000 } });
  const page = await context.newPage();
  const snap = async (n: string, full = true) => { await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${w}-${n}.png`, fullPage: full }); };
  const ready = async () => { await page.waitForFunction(() => document.documentElement.dataset.scene === "ready", null, { timeout: 30000 }); };
  await page.goto("/tour/scene/cover/calendar"); await ready();
  await snap("calendar");
  await page.locator('[data-action="cover-layout:list"]').first().click();
  await snap("list");
  const m = await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll(".split-lists .panel")).map((p) => { const r = p.getBoundingClientRect(); const h = p.querySelector(".list-section-header")!.getBoundingClientRect(); const first = p.querySelector(".arrangement-row")?.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), headerH: Math.round(h.height), firstTop: first ? Math.round(first.top) : null }; });
    return ps;
  });
  console.log("MEASURE " + w + " " + JSON.stringify(m));
  for (const slug of ["track", "incoming", "handover", "deadline"]) { await page.goto(`/tour/scene/cover/${slug}`); await ready(); await snap(slug, false); }
  await context.close();
});
