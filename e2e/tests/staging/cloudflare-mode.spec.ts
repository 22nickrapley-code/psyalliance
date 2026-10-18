import { test, expect } from "@playwright/test";
import { signInAs, account, memberClient } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";
import { referral } from "../../lib/scenarios";

// Saves as they behave on Cloudflare, where a save that moves on arrives
// without the next page and the browser loads it in full. Run against a
// staging server whose request to itself is blocked (as on Cloudflare):
//   CF_MODE=1 E2E_BASE_URL=http://localhost:3602 npx playwright test cloudflare-mode
// R17-03: an inline reply that returns to the same page at a #section
// settles; R17-08: a second menu change shows; R17-05: a tab from before a
// new version recovers.
test.skip(process.env.CF_MODE !== "1", "needs a server in Cloudflare mode");
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

test("CF-01 an inline referral reply settles and shows (R17-03)", async ({ page, context, baseURL }) => {
  const id = await referral("avery", ["bram"]);
  const bram = await memberClient("bram");
  const { error } = await bram
    .from("referral_responses")
    .insert({ referral_request_id: id, responding_profile_id: account("bram").id, status: "question", message: "QA: is this for telehealth only?" });
  expect(error, error?.message).toBeNull();
  await signInAs(context, "avery", baseURL!);
  await page.goto(`/dashboard/refer/${id}`);
  const text = `QA inline answer ${Date.now()}`;
  const box = page.getByPlaceholder(/Answer Bram/);
  await box.fill(text);
  await page.locator("form.it-reply").getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".it-list").getByText(text)).toBeVisible({ timeout: 8000 });
  await expect(page.locator("form.it-reply button.is-pending")).toHaveCount(0);
  await expect(page.getByPlaceholder(/Answer Bram/)).toHaveValue("");
});

test("CF-02 hiding then showing Demos updates the menu both times (R17-08)", async ({ page, context, baseURL }) => {
  await signInAs(context, "dara", baseURL!);
  await page.goto("/dashboard/settings#menu");
  const menu = page.locator("aside");
  await page.locator("details#menu > summary").click();
  await page.getByRole("button", { name: "Hide Demos" }).click();
  await expect(menu.getByRole("link", { name: /^Demos/ })).toHaveCount(0, { timeout: 8000 });
  await page.locator("details#menu").evaluate((d: HTMLDetailsElement) => (d.open = true));
  await page.getByRole("button", { name: "Show Demos" }).click();
  await expect(menu.getByRole("link", { name: /^Demos/ })).toBeVisible({ timeout: 8000 });
  // And once more, from the same address.
  await page.locator("details#menu").evaluate((d: HTMLDetailsElement) => (d.open = true));
  await page.getByRole("button", { name: "Hide Demos" }).click();
  await expect(menu.getByRole("link", { name: /^Demos/ })).toHaveCount(0, { timeout: 8000 });
  await page.locator("details#menu").evaluate((d: HTMLDetailsElement) => (d.open = true));
  await page.getByRole("button", { name: "Show Demos" }).click();
  await expect(menu.getByRole("link", { name: /^Demos/ })).toBeVisible({ timeout: 8000 });
});

test("CF-03 a tab from before a new version recovers and says what happened (R17-05)", async ({ page, context, baseURL }) => {
  await signInAs(context, "dara", baseURL!);
  await page.goto("/dashboard/settings#menu");
  // The save this old tab knows about no longer exists on the server.
  await page.route("**/dashboard/settings**", async (route) => {
    const h = route.request().headers();
    if (route.request().method() === "POST" && h["next-action"]) return route.continue({ headers: { ...h, "next-action": "0".repeat(42) } });
    return route.continue();
  });
  await page.locator("details#menu > summary").click();
  const loads: number[] = [];
  page.on("load", () => loads.push(Date.now()));
  const label = (await page.getByRole("button", { name: /^(Hide|Show) Demos$/ }).innerText()).trim();
  await page.getByRole("button", { name: label }).click();
  await expect(page.locator(".live-note")).toContainText("PsyAlliance was just updated", { timeout: 8000 });
  expect(loads.length, "the page loaded again").toBeGreaterThan(0);
  await page.unroute("**/dashboard/settings**");
});
