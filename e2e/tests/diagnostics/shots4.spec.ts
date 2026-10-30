import { test } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { assertLocal, q } from "../../lib/staging";
const OUT = process.env.SHOT_DIR || "/tmp/shots";
const TAG = process.env.SHOT_TAG || "cur";
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
const avery = account("avery"), fenn = account("fenn"), dara = account("dara");
for (const [name, vp] of [["desk", { width: 1365, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`cover steps ${name}`, async ({ browser, baseURL }) => {
    await q(`delete from workspace_drafts where profile_id = any($1::uuid[]) and kind <> 'hub-state'`, [[avery.id, fenn.id, dara.id]]);
    const phone = vp.width < 700;
    const context = await browser.newContext(phone ? { viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: vp });
    await signInAs(context, "avery", baseURL!);
    const page = await context.newPage();
    const snap = async (n: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${TAG}-${name}-cv-${n}.png` }); };
    await page.goto("/dashboard/cover"); await page.waitForTimeout(1000);
    await page.locator('[data-action="cover-start"]').first().click(); await page.waitForTimeout(600);
    await page.locator("#cover-name").fill("Autumn leave");
    await page.getByRole("button", { name: "Continue to needs" }).click(); await page.waitForTimeout(500);
    await page.locator("#cover-focus").selectOption("Anxiety/Panic Disorders");
    await page.locator("#cover-setting").selectOption("virtual");
    await page.getByRole("button", { name: "Save client", exact: true }).click(); await snap("1-saved");
    await page.getByRole("button", { name: "Continue to colleagues" }).click(); await snap("2-match");
    const boxes = page.locator('input[data-match="cover"]');
    const n = await boxes.count();
    for (let i = 0; i < Math.min(n, 2); i++) await boxes.nth(i).check();
    await snap("2-picked");
    await page.getByRole("button", { name: "Review invitations" }).click(); await snap("3-review");
    await page.locator('#cover-send-form input[name="reviewed"]').check(); await snap("3-reviewed");
    await context.close();
  });
}
