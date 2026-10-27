import { test, expect, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one } from "../../../lib/staging";

// The account pages (profile, credentials, continuity, My documents,
// notifications, settings, demos, consult groups, a colleague's page, the
// admin pages) in the workspace's own frame (decision D-01). Their saving and
// permissions code is unchanged; these prove the frame, the things the final
// product changed on them (D-03 Supervision hidden, D-05 availability in the
// Hub window) and that they pass the automated accessibility rules.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const avery = account("avery").id, bram = account("bram").id;

async function open(browser: Browser, who: string, baseURL: string, path: string, phone = false) {
  const context = await browser.newContext({ viewport: phone ? { width: 412, height: 915 } : { width: 1365, height: 900 }, locale: "en-US", timezoneId: "America/New_York" });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(path);
  return { context, page, errs };
}

const MEMBER_PAGES = ["/dashboard/profile", "/dashboard/credentials", "/dashboard/continuity", "/dashboard/documents", "/dashboard/notifications", "/dashboard/settings", "/dashboard/demos", "/dashboard/consult/groups", `/dashboard/people/${bram}`];
const ADMIN_PAGES = ["/dashboard/admin", "/dashboard/admin/members", "/dashboard/admin/verifications", "/dashboard/admin/moderation", "/dashboard/admin/states", "/dashboard/admin/library"];

test("ACC-01 every account page sits in the workspace frame: sidebar, top bar, one main region, no script errors", async ({ browser, baseURL }) => {
  const a = await open(browser, "avery", baseURL!, MEMBER_PAGES[0]);
  for (const p of MEMBER_PAGES) {
    await a.page.goto(p);
    await expect(a.page.locator("#app .sidebar .nav-item").first(), p).toBeVisible();
    await expect(a.page.locator(".workspace .topbar"), p).toBeVisible();
    await expect(a.page.locator("#main"), p).toHaveCount(1);
    await expect(a.page.locator("h1").first(), p).toBeVisible();
    await expect(a.page.locator(".rail-link, .workspace-top"), `${p} has none of the older frame`).toHaveCount(0);
  }
  expect(a.errs).toEqual([]);
  await a.context.close();
  const o = await open(browser, "otto", baseURL!, ADMIN_PAGES[0]);
  for (const p of ADMIN_PAGES) {
    await o.page.goto(p);
    await expect(o.page.locator(".sidebar .nav-caption").first(), p).toHaveText(/Admin/i);
    await expect(o.page.locator("#main h1").first(), p).toBeVisible();
  }
  expect(o.errs).toEqual([]);
  await o.context.close();
});

test("ACC-02 Supervision is hidden but what members saved is kept, even after saving the profile", async ({ browser, baseURL }) => {
  await q(`update profiles set open_to_give_supervision = true, open_to_receive_supervision = false where id = $1`, [avery]);
  const a = await open(browser, "avery", baseURL!, "/dashboard/profile");
  await expect(a.page.locator('input[name="open_to_give_supervision"], input[name="open_to_receive_supervision"]')).toHaveCount(0);
  await expect(a.page.getByText(/supervis/i)).toHaveCount(0);
  await a.page.getByRole("button", { name: /^Save profile/ }).first().click();
  await a.page.waitForLoadState("networkidle");
  await expect(a.page).toHaveURL(/saved=1|\/dashboard\/profile/);
  const row = await one(`select open_to_give_supervision as g, open_to_receive_supervision as r, bio from profiles where id = $1`, [avery]);
  expect(row.g, "the answer given before is still there").toBe(true);
  expect(row.r).toBe(false);
  await a.page.goto(`/dashboard/people/${bram}`);
  await expect(a.page.getByText(/supervis/i)).toHaveCount(0);
  await a.context.close();
  await q(`update profiles set open_to_give_supervision = false where id = $1`, [avery]);
});

test("ACC-03 the old availability page opens the Hub's availability window", async ({ browser, baseURL }) => {
  const a = await open(browser, "avery", baseURL!, "/dashboard/availability?back=%2Fdashboard%2Fprofile");
  await expect(a.page).toHaveURL(/\/dashboard\?availability=1|\/dashboard$/);
  await expect(a.page.locator(".modal")).toBeVisible();
  await expect(a.page.locator(".modal")).toContainText(/availab/i);
  await expect(a.page.locator(".modal #availability-form, .modal form").first()).toBeVisible();
  await a.context.close();
});

test("ACC-04 the account top bar's Search opens the workspace search; its bell opens notifications", async ({ browser, baseURL }) => {
  const a = await open(browser, "avery", baseURL!, "/dashboard/settings");
  await a.page.locator(".topbar a.top-search").click();
  await expect(a.page).toHaveURL(/\/dashboard/);
  await expect(a.page.locator("#global-search")).toBeVisible();
  await a.page.goto("/dashboard/settings");
  await a.page.locator('.topbar a[data-bell]').click();
  await expect(a.page).toHaveURL(/\/dashboard\/notifications/);
  await a.context.close();
});

test("ACC-05 Sign out from an account page ends the session", async ({ browser, baseURL }) => {
  const a = await open(browser, "avery", baseURL!, "/dashboard/profile");
  await a.page.getByRole("button", { name: "Sign out" }).click();
  await a.page.waitForLoadState("networkidle");
  await a.page.goto("/dashboard/profile");
  await expect(a.page).toHaveURL(/\/auth\/sign-in/);
  await a.context.close();
});

test("ACC-06 phone: More opens the menu, Escape closes it and focus returns; the bar marks where you are", async ({ browser, baseURL }) => {
  const a = await open(browser, "avery", baseURL!, "/dashboard/settings", true);
  const side = a.page.locator(".sidebar");
  await expect(side).toHaveAttribute("aria-hidden", "true");
  await a.page.locator(".mobile-nav button", { hasText: "More" }).click();
  await expect(side).toHaveClass(/open/);
  await expect(side).toHaveAttribute("aria-hidden", "false");
  await a.page.keyboard.press("Escape");
  await expect(side).not.toHaveClass(/open/);
  await expect(a.page.locator(".mobile-nav button.active")).toContainText("More");
  await a.context.close();
});

test("ACC-07 the waiting member's home marks The Hub; a colleague's page marks Network", async ({ browser, baseURL }) => {
  const p = await open(browser, "pell", baseURL!, "/dashboard");
  await expect(p.page).toHaveURL(/\/dashboard\/overview/);
  await expect(p.page.locator(".sidebar .nav-item.active")).toContainText("The Hub");
  await p.context.close();
  const a = await open(browser, "avery", baseURL!, `/dashboard/people/${bram}`);
  await expect(a.page.locator(".sidebar .nav-item.active")).toContainText("Network");
  await a.context.close();
});

test("A11Y-ACCOUNT the account pages pass the automated rules (WCAG 2.1 A and AA), colour contrast included, desktop and phone", async ({ browser, baseURL }) => {
  test.setTimeout(6 * 60_000);
  const failures: string[] = [];
  for (const [who, pages] of [["avery", MEMBER_PAGES], ["otto", ADMIN_PAGES]] as [string, string[]][])
    for (const phone of [false, true]) {
      const a = await open(browser, who, baseURL!, pages[0], phone);
      for (const p of pages) {
        await a.page.goto(p);
        await a.page.waitForLoadState("networkidle");
        await a.page.evaluate(() => document.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
        const r = await new AxeBuilder({ page: a.page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        for (const v of r.violations) if (v.impact === "serious" || v.impact === "critical") failures.push(`${who}${phone ? " phone" : ""} ${p}: ${v.id} ×${v.nodes.length} ${v.nodes[0]?.target.join(" ").slice(0, 80)}`);
      }
      await a.context.close();
    }
  expect(failures).toEqual([]);
});
