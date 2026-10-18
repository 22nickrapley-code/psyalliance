import { test, expect } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { assertLocal, q } from "../../lib/staging";

// The new app on a database without 0115's and 0116's new pieces: the
// window between deploying and running the SQL. Run only after the
// database has been put in that state (see the 18 Oct release notes), then
// run 0115 and 0116 again.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const PAGES = ["/dashboard", "/dashboard/network", "/dashboard/messages", "/dashboard/consult", "/dashboard/clinicians", "/dashboard/cover", "/dashboard/refer", "/dashboard/profile", "/dashboard/documents", "/dashboard/admin/network-health"];

test("new app before the SQL: pages load and a message sends", async ({ page, context, baseURL }) => {
  test.setTimeout(4 * 60_000);
  const missing = await q(`select to_regclass('public.suggested_colleagues') is null as no_suggestions, to_regprocedure('public.consultation_useful_marks(bigint)') is null as no_marks`);
  expect(missing[0].no_suggestions && missing[0].no_marks, "database is in the before-SQL state").toBe(true);
  for (const who of ["avery", "pell"]) {
    await context.clearCookies();
    await signInAs(context, who, baseURL!);
    for (const p of PAGES) {
      if (p.includes("/admin/") && who !== "pell") continue;
      const res = await page.goto(p);
      expect(res?.status(), `${who} ${p}`).toBeLessThan(400);
      await expect(page.getByText(/didn.t load completely|Something went wrong/), `${who} ${p}`).toHaveCount(0);
    }
  }
  const [c] = await q(`select c.id from consultations c where c.author_profile_id = $1 order by c.id desc limit 1`, [account("avery").id]);
  await context.clearCookies();
  await signInAs(context, "avery", baseURL!);
  if (c) {
    await page.goto(`/dashboard/consult/${c.id}`);
    await expect(page.getByText(/didn.t load completely|Something went wrong/)).toHaveCount(0);
  }
  await page.goto(`/dashboard/messages?to=${account("dara").id}`);
  const text = `QA before SQL ${Date.now()}`;
  await page.locator('textarea[name="body"]').fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-thread").getByText(text)).toBeVisible();
  await expect(page.locator(".chat-msg.pending")).toHaveCount(0, { timeout: 10_000 });
});
