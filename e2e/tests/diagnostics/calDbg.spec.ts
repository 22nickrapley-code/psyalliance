import { test } from "@playwright/test";
import { signInAs } from "../../lib/auth";
test("calDbg", async ({ browser, baseURL }) => {
  for (const mode of ["scene", "live"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    if (mode === "live") await signInAs(context, "avery", baseURL!);
    const page = await context.newPage();
    if (mode === "scene") { await page.goto("/tour/scene/cover/calendar"); await page.waitForFunction(() => document.documentElement.dataset.scene === "ready"); }
    else { await page.goto("/dashboard/cover"); await page.locator('[data-action="cover-layout:calendar"]').first().click(); }
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => { const c = document.querySelector(".month-day-counts") as HTMLElement | null; const chip = document.querySelector(".month-day .cal-chip") as HTMLElement | null; return { counts: c ? getComputedStyle(c).display : null, chip: chip ? getComputedStyle(chip).display : null, vw: window.innerWidth, mq: matchMedia("(max-width:760px)").matches, sheets: Array.from(document.styleSheets).map((s) => s.href || "inline").filter((h) => /css/.test(h)).map((h) => h.split("/").pop()) }; });
    console.log("CAL " + mode + " " + JSON.stringify(r));
    await context.close();
  }
});
