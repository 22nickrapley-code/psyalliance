import { test } from "@playwright/test";
import { signInAs } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test("measure referral form", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(context, "avery", baseURL!);
  const page = await context.newPage();
  await page.goto("/dashboard");
  await page.locator(".hub-cards").waitFor();
  await page.locator('[data-action="referral-start"]').first().click();
  await page.waitForTimeout(600);
  const out = await page.evaluate(() => {
    const g = document.querySelector("#referral-need-form .need-grid")!;
    const cs = getComputedStyle(g);
    const r = (e: Element) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    return {
      grid: { display: cs.display, cols: cs.gridTemplateColumns, rowGap: cs.rowGap, colGap: cs.columnGap, alignItems: cs.alignItems, rect: r(g) },
      fields: [...g.children].map((f) => ({ cls: f.className, html: f.outerHTML.slice(0, 220), rect: r(f), style: (() => { const s = getComputedStyle(f); return { m: s.margin, p: s.padding, self: s.alignSelf, mt: s.marginTop }; })(), label: f.querySelector("label") ? r(f.querySelector("label")!) : null, ctl: f.querySelector("select,input") ? r(f.querySelector("select,input")!) : null })),
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await context.close();
});
