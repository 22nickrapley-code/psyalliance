import { test, expect } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { assertLocal, q, asMember } from "../../lib/staging";
const OUT = process.env.SHOT_DIR || "/tmp/bshots";
const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id;
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
for (const [name, vp] of [["desk", { width: 1365, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`shotsB ${name}`, async ({ browser, baseURL }) => {
    await q(`delete from coverage_plans where profile_id = $1 and title like 'Shot %'`, [avery]);
    await q(`delete from trusted_colleagues where profile_id = $1`, [avery]);
    const context = await browser.newContext(name === "phone" ? { viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: vp });
    await signInAs(context, "avery", baseURL!);
    const page = await context.newPage();
    const snap = async (n: string, full = false) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/b-${name}-${n}.png`, fullPage: full }); };
    await page.goto("/dashboard/cover");
    await page.locator('[data-action="cover-start"]').first().click();
    await page.locator("#cover-name").fill("Shot plan");
    await page.getByRole("button", { name: "Continue to needs" }).click();
    for (let i = 0; i < 3; i++) {
      await page.locator("#cover-focus").selectOption("Anxiety/Panic Disorders");
      await page.locator("#cover-setting").selectOption("virtual");
      await page.getByRole("button", { name: "Save client", exact: true }).click();
      if (i < 2) await page.getByRole("button", { name: "Add another client" }).click();
    }
    await page.getByRole("button", { name: "Continue to colleagues" }).click();
    for (const id of [1, 2, 3]) { await page.locator(`[data-action="match-client:${id}"]`).click(); await page.locator(`input[data-match="cover"][data-client="${id}"][value="${bram}"]`).check(); }
    await page.locator('[data-action="match-client:1"]').click();
    await page.locator(`input[data-match="cover"][data-client="1"][value="${cass}"]`).check();
    await snap("cover-colleagues");
    await page.getByRole("button", { name: "Review invitations" }).click();
    await snap("cover-review");
    await page.locator(".modal-body, .modal").first().evaluate((e) => { const b = e.querySelector(".workload-list"); b?.scrollIntoView({ block: "center" }); });
    await snap("cover-review-workload");
    await page.keyboard.press("Escape");
    await page.goto("/dashboard");
    await page.locator('[data-action="referral-start"]').first().click();
    await page.locator("#referral-focus").locator("xpath=following-sibling::button[contains(@class,'search-pick-cover')]").click();
    await page.locator(".search-pick input").fill("anx");
    await snap("referral-search");
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    // Network circle with six trusted colleagues
    const visible = (await asMember(avery, `select public.workspace_people() as p`)).rows[0].p as { id: string; name: string }[];
    for (const p of visible.filter((p) => p.id !== avery).slice(0, 6)) await q(`insert into trusted_colleagues (profile_id, colleague_id) values ($1, $2) on conflict do nothing`, [avery, p.id]);
    await page.goto("/dashboard/network"); await page.waitForTimeout(1200); await snap("network", true);
    await q(`delete from trusted_colleagues where profile_id = $1`, [avery]);
    await context.close();
  });
}
