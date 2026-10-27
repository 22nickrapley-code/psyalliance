import { test } from "@playwright/test";
import { signInAs } from "/root/pa/e2e/lib/auth";
test("probe", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  await signInAs(context, "avery", baseURL!);
  const page = await context.newPage();
  await page.goto("/dashboard/credentials");
  await page.waitForLoadState("networkidle");
  const r = await page.evaluate(() => [...document.querySelectorAll(".profile-tabs .section-tab")].map((e) => { const c = getComputedStyle(e); const b = e.querySelector("b")!; const bc = getComputedStyle(b); return [e.textContent, Math.round(e.getBoundingClientRect().width), c.overflow, c.flex, c.display, Math.round(b.getBoundingClientRect().width), bc.fontSize, bc.overflow, bc.textOverflow, bc.whiteSpace]; }));
  console.log(JSON.stringify(r));
});
