import { test } from "@playwright/test";
import { signInAs } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";
const OUT = process.env.SHOT_DIR || "/tmp/shots";
const TAG = process.env.SHOT_TAG || "cur";
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
for (const [name, vp] of [["desk", { width: 1365, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`zero + search ${name}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: vp });
    await signInAs(context, "dara", baseURL!);
    const page = await context.newPage();
    const snap = async (n: string, full = true) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${TAG}-${name}-${n}.png`, fullPage: full }); };
    await page.goto("/dashboard"); await page.locator(".hub-cards").waitFor(); await snap("zero");
    await context.close();
    const c2 = await browser.newContext({ viewport: vp });
    await signInAs(c2, "avery", baseURL!);
    const p2 = await c2.newPage();
    await p2.goto("/dashboard"); await p2.locator(".hub-cards").waitFor();
    await p2.locator(".hub-search").first().click();
    await p2.waitForTimeout(500);
    await p2.getByRole("button", { name: "Colleagues", exact: true }).click();
    await p2.locator("#global-search").fill("a");
    await p2.waitForTimeout(700);
    await p2.screenshot({ path: `${OUT}/${TAG}-${name}-search.png` });
    await c2.close();
  });
}
