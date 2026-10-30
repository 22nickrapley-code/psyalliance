import { test } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { assertLocal, q } from "../../lib/staging";
const OUT = process.env.SHOT_DIR || "/tmp/bshots2";
const avery = account("avery").id;
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
for (const [name, vp] of [["desk", { width: 1365, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`shotsC ${name}`, async ({ browser, baseURL }) => {
    await q(`delete from coverage_plans where profile_id = $1 and title like 'Shot %'`, [avery]);
    await q(`delete from workspace_drafts where profile_id = $1 and kind <> 'hub-state'`, [avery]);
    const context = await browser.newContext(name === "phone" ? { viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: vp });
    await signInAs(context, "avery", baseURL!);
    const page = await context.newPage();
    const snap = async (n: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/c-${name}-${n}.png` }); };
    await page.goto("/dashboard/cover");
    await snap("cover-page");
    await page.locator('[data-action="cover-start"]').first().click();
    await page.locator("#cover-name").fill("Shot one client");
    await page.getByRole("button", { name: "Continue to needs" }).click();
    await page.locator("#cover-focus").selectOption("Anxiety/Panic Disorders");
    await page.locator("#cover-setting").selectOption("virtual");
    await page.getByRole("button", { name: "Save client", exact: true }).click();
    await page.getByRole("button", { name: "Continue to colleagues" }).click();
    await snap("one-client-colleagues");
    await page.keyboard.press("Escape");
    await q(`delete from workspace_drafts where profile_id = $1 and kind <> 'hub-state'`, [avery]);
    await context.close();
  });
}
