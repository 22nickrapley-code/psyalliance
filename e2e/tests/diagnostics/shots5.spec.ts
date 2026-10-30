import { test } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { assertLocal, q } from "../../lib/staging";
const OUT = process.env.SHOT_DIR || "/tmp/shots";
const TAG = process.env.SHOT_TAG || "cur";
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
const avery = account("avery"), fenn = account("fenn"), dara = account("dara");
for (const [name, vp] of [["desk", { width: 1365, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`cover many clients ${name}`, async ({ browser, baseURL }) => {
    await q(`delete from workspace_drafts where profile_id = any($1::uuid[]) and kind <> 'hub-state'`, [[avery.id, fenn.id, dara.id]]);
    const phone = vp.width < 700;
    const context = await browser.newContext(phone ? { viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: vp });
    await signInAs(context, "avery", baseURL!);
    const page = await context.newPage();
    const snap = async (n: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${TAG}-${name}-cm-${n}.png` }); };
    await page.goto("/dashboard/cover"); await page.waitForTimeout(1000);
    await page.locator('[data-action="cover-start"]').first().click(); await page.waitForTimeout(600);
    await page.locator("#cover-name").fill("Autumn leave");
    await page.getByRole("button", { name: "Continue to needs" }).click(); await page.waitForTimeout(500);
    const foci = ["Anxiety/Panic Disorders", "Anxiety/Panic Disorders", "Anxiety/Panic Disorders"];
    for (let i = 0; i < foci.length; i++) {
      await page.locator("#cover-focus").selectOption(foci[i]);
      await page.locator("#cover-setting").selectOption("virtual");
      await page.getByRole("button", { name: "Save client", exact: true }).click(); await page.waitForTimeout(500);
      if (i < foci.length - 1) { await page.getByRole("button", { name: "Add another client" }).click(); await page.waitForTimeout(400); }
    }
    await snap("1-list");
    await page.getByRole("button", { name: "Continue to colleagues" }).click(); await snap("2-byclient");
    const boxes = page.locator('input[data-match="cover"]');
    for (let i = 0; i < Math.min(await boxes.count(), 3); i++) await boxes.nth(i).check();
    await page.locator('[data-action="match-view:colleague"]').click(); await snap("3-bycolleague");
    await page.getByRole("button", { name: "Review invitations" }).click(); await snap("4-review");
    await context.close();
  });
}
