import { test, expect } from "@playwright/test";
import { signInAs } from "../../../lib/auth";
import { assertLocal, gatewayFault } from "../../../lib/staging";

// Release A, H03: a failed load must never read as "nothing needs your attention".
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

test("RA-16 if the workspace cannot load, the page says so, offers Try again, and never says you are up to date", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(context, "avery", baseURL!);
  const page = await context.newPage();
  await page.goto("/dashboard");
  await expect(page.locator(".hub-cards")).toBeVisible();
  try {
    await gatewayFault({ path: "/rest/v1/rpc/workspace_boot", method: "POST", status: 503, times: 20 });
    await page.goto("/dashboard");
    await expect(page.getByRole("alert").getByText("We could not load your workspace.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByText("You’re up to date")).toHaveCount(0);
    expect(await page.locator(".hub-cards").count()).toBe(0);
  } finally {
    await gatewayFault({ clear: true });
  }
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".hub-cards")).toBeVisible();
  await context.close();
});
