import { test } from "@playwright/test";
import { signInAs } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

const OUT = process.env.SHOT_DIR || "/tmp/shots";
const TAG = process.env.SHOT_TAG || "cur";
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

for (const [name, vp] of [["desk", { width: 1365, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`shots ${name}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: vp });
    await signInAs(context, "avery", baseURL!);
    const page = await context.newPage();
    const snap = async (n: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${TAG}-${name}-${n}.png`, fullPage: n !== "referral" && n !== "search" }); };
    await page.goto("/dashboard");
    await page.locator(".hub-cards").waitFor();
    await snap("hub");
    await page.locator('[data-action="referral-start"]').first().click();
    await page.waitForTimeout(600);
    await snap("referral");
    await page.keyboard.press("Escape");
    await page.goto("/dashboard/cover"); await page.waitForTimeout(1200); await snap("cover");
    await page.goto("/dashboard/network"); await page.waitForTimeout(1200); await snap("network");
    await page.goto("/dashboard/consult"); await page.waitForTimeout(1200); await snap("consult");
    await context.close();
  });
}
