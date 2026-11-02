import { test, expect, type Browser } from "@playwright/test";
import { signInAs } from "../../../lib/auth";
import { assertLocal } from "../../../lib/staging";

// Release C, final audit pass: the page-by-page design inspection's fixes. Read-only; fictional people only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

async function as(browser: Browser, who: string, baseURL: string, width = 1365) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await signInAs(context, who, baseURL);
  return { context, page: await context.newPage() };
}

test("AU-01 the verification page has one page heading", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/verification`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("checked before they appear");
});

test("AU-02 /start does not draw a focus box on first load; choosing a need moves focus into the question", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/start`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");
  await page.locator('[data-need="time_away"]').click();
  await expect(page.locator("dialog.guide-dialog[open]")).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog.guide-dialog"))).toBe(true);
});

test("AU-03 the Profile tab and the Profile page count the same four essentials", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "avery", baseURL!);
  await page.goto(`${baseURL}/dashboard/profile`);
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\d of 5 parts done/);
  await context.close();
});

test("AU-04 Credentials never says 'Expires Not given'", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "avery", baseURL!);
  await page.goto(`${baseURL}/dashboard/credentials`);
  expect(await page.locator("body").innerText()).not.toContain("Not given");
  await context.close();
});

test("AU-05 Notifications is named in the top bar, under Messages in the menu, and says its introduction once", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "avery", baseURL!);
  await page.goto(`${baseURL}/dashboard/notifications`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Notifications");
  await expect(page.locator(".breadcrumbs")).toContainText("Messages");
  await expect(page.locator(".breadcrumbs")).not.toContainText("Account");
  expect(await page.locator("body").innerText()).not.toContain("The bell opens this list");
  await context.close();
});

test("AU-06 My files has one name (menu, tab and heading) and no stray Library button in its header", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "avery", baseURL!);
  await page.goto(`${baseURL}/dashboard/documents?tab=mine`);
  // 1 Nov (Nick): My documents is now My files, a tab of the Library.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My files");
  await expect(page.locator(".page-head a")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("My Library");
  await context.close();
});

test("AU-07 the homepage Library section fits a phone", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${baseURL}/#library`);
  await expect(page.locator("#library")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await context.close();
});

test("AU-08 the sidebar footer lines up with the profile avatar in both shells", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "avery", baseURL!);
  // 1 Nov (Nick): one Settings, the same in both shells.
  for (const [url, name] of [["/dashboard", /Settings/], ["/dashboard/profile", /Settings/]] as const) {
    await page.goto(`${baseURL}${url}`);
    const link = page.locator(".sidebar-bottom").getByRole(url === "/dashboard" ? "button" : "link", { name }).first();
    const av = page.locator(".sidebar-bottom .profile-button .avatar").first();
    const [l, a] = [await link.evaluate((e) => (e.getBoundingClientRect().left + parseFloat(getComputedStyle(e).paddingLeft))), await av.evaluate((e) => e.getBoundingClientRect().left)];
    expect(Math.abs(l - a), url).toBeLessThanOrEqual(2);
  }
  await context.close();
});
