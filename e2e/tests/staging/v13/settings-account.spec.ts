import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "../../../lib/auth";
import { assertLocal } from "../../../lib/staging";

// V13 workspace, signed in: the Settings sheet carries the account and
// sign-out affordances the approved design leaves to the host product.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

async function open(browser: any, who: string, baseURL: string, viewport = { width: 1365, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await signInAs(context, who, baseURL);
  const page: Page = await context.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("/dashboard");
  await expect(page.locator("#app .sidebar")).toBeVisible();
  return { context, page, errs };
}

test("SET-01 Settings lists the account pages, and every link goes to a page that exists", async ({ browser, baseURL }) => {
  const { page, context, errs } = await open(browser, "avery", baseURL!);
  await page.locator('[data-action="settings"]').first().click();
  const modal = page.locator(".modal");
  for (const [label, href] of [
    ["Your profile and licenses", "/dashboard/profile"],
    ["Verification", "/dashboard/credentials"],
    ["My documents", "/dashboard/documents?tab=mine"],
    ["Continuity plan", "/dashboard/continuity"],
    ["All notifications", "/dashboard/notifications"],
    ["Privacy and account", "/dashboard/settings"],
    ["Demos and sandbox", "/dashboard/demos"],
  ]) {
    const row = modal.locator("a.global-result", { hasText: label });
    await expect(row, label).toHaveAttribute("href", href);
    const res = await page.request.get(href);
    expect(res.status(), `${label} → ${href}`).toBeLessThan(400);
  }
  // No admin row for a member who is not an admin.
  await expect(modal.locator("a.global-result", { hasText: "Admin console" })).toHaveCount(0);
  // Preview controls are for the sample data only, never on a member's own account.
  await expect(modal.getByText("Preview controls")).toHaveCount(0);
  expect(errs).toEqual([]);
  await context.close();
});

test("SET-02 Sign out ends the session and the workspace asks you to sign in again", async ({ browser, baseURL }) => {
  const { page, context, errs } = await open(browser, "avery", baseURL!, { width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('.modal [data-action="sign-out"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/dashboard"), { timeout: 15000 });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  expect(errs).toEqual([]);
  await context.close();
});
