import { test, expect, type Page, type Browser } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q } from "../../../lib/staging";

// Version 15: the changes made after Nick's 28 October testing, on the real
// local database, as signed-in fictional staging members.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery"), bram = account("bram"), cass = account("cass");
const everyone = [avery.id, bram.id, cass.id];

async function tidy() {
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from coverage_plans where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from consultation_responses where body like 'V15 %'`);
  await q(`delete from consultations where question like 'V15 %'`);
  await q(`delete from conversations where context_key like 'cover-%'`);
}
test.beforeEach(tidy);
test.afterAll(tidy);

const problems = new WeakMap<Page, string[]>();
async function openAs(browser: Browser, who: string, baseURL: string, path = "/dashboard", phone = false) {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1365, height: 900 } });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  const errs: string[] = [];
  problems.set(page, errs);
  page.on("pageerror", (e) => errs.push(`${e.message} @ ${page.url()}`));
  await page.goto(path);
  await expect(page.locator("#app .sidebar, #app .mobile-nav").first()).toBeAttached();
  return { context, page };
}
const clean = (page: Page) => expect(problems.get(page)).toEqual([]);

test("V15-01 Cover and Referrals use the same filters, clearer panel titles, no Open plan buttons, and a row that opens as a whole", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  const names = async () => (await page.locator(".toolbar .filter-pills button").allInnerTexts()).map((t) => t.trim());
  expect(await names()).toEqual(["All", "Active", "Completed"]);
  await expect(page.locator(".list-section-header h2", { hasText: "Colleagues covering your clients" })).toBeVisible();
  await expect(page.locator(".list-section-header h2", { hasText: "You covering colleagues’ clients" })).toBeVisible();
  await expect(page.locator(".direction-caption", { hasText: "WHEN YOU’RE AWAY" })).toBeVisible();
  // A plan, made the ordinary way.
  await page.locator('[data-action="cover-start"]').first().click();
  await page.locator("#cover-name").fill("V15 Autumn leave");
  await page.getByRole("button", { name: "Continue to needs" }).click();
  await page.locator("#cover-focus").selectOption("Anxiety/Panic Disorders");
  await page.locator("#cover-setting").selectOption("virtual");
  await page.getByRole("button", { name: "Save client", exact: true }).click();
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await page.locator(`input[data-match="cover"][value="${bram.id}"]`).check();
  await page.getByRole("button", { name: "Review invitations" }).click();
  // The deadline says what happens when the time is up.
  await expect(page.locator('label[for="cover-deadline"]')).toHaveText("How long each colleague has to reply");
  await expect(page.locator("#cover-send-form")).toContainText("the next colleague on your list is asked automatically");
  await page.locator('#cover-send-form input[name="reviewed"]').check();
  await page.getByRole("button", { name: "Send cover requests" }).click();
  await expect(page.locator("#toast")).toContainText("Cover requests sent");
  await page.goto("/dashboard/cover");
  const row = page.locator(".arrangement-row", { hasText: "V15 Autumn leave" });
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/row-active/);
  await expect(page.getByRole("button", { name: /^(Open plan|Reply|Review replies)$/ })).toHaveCount(0);
  await expect(page.locator(".row-act")).toHaveCount(0);
  // Anywhere on the row opens the plan.
  await row.locator(".arrangement-main > small").first().click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.keyboard.press("Escape");
  // Calendar chips carry the plan's own name, not "Yours 1" or "Peers 1".
  await page.locator('[data-action="cover-layout:calendar"]').click();
  await expect(page.locator(".calendar-key")).toContainText("Your cover plans");
  await expect(page.locator(".month-day-counts", { hasText: /Yours \d|Peers \d/ })).toHaveCount(0);
  for (let n = 0; n < 4 && (await page.locator(".cal-chip").count()) === 0; n++) await page.locator('[data-action="calendar-month:1"]').click();
  if (await page.locator(".cal-chip").count()) await expect(page.locator(".cal-chip").first()).toContainText("V15 Autumn leave");
  // Referrals: the same words.
  await page.goto("/dashboard/referrals");
  expect((await page.locator(".toolbar .filter-pills button").allInnerTexts()).map((t) => t.trim())).toEqual(["All", "Active", "Completed"]);
  await clean(page);
  await context.close();
});

test("V15-02 the search box takes several criteria separated by commas", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/network");
  await page.locator('[data-action="network-tab:directory"]').first().click();
  const count = async (text: string) => {
    await page.locator("#page-dir-q").fill(text);
    await page.locator("#directory-form button[type=submit]").click();
    const meta = page.locator(".results-meta b").first();
    await expect(meta).toBeVisible();
    return Number(await meta.innerText());
  };
  const everyoneN = await count("");
  const dep = await count("depression");
  const ny = await count("ny");
  const both = await count("depression, ny");
  expect(everyoneN).toBeGreaterThan(0);
  expect(both).toBeLessThanOrEqual(Math.min(dep, ny));
  expect(await count("depression, zzzznotathing")).toBe(0);
  // Order and spacing do not matter.
  expect(await count(" NY ,Depression")).toBe(both);
  await clean(page);
  await context.close();
});

test("V15-03 Make a referral starts a new one even with a draft; several drafts can be open and each resumes", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/referrals");
  const begin = async (focus: string) => {
    await page.locator('[data-action="referral-start"]').first().click();
    await expect(page.locator("#referral-need-form")).toBeVisible();
    // A new referral always starts empty.
    expect(await page.locator("#referral-need-form select").first().inputValue()).toBe("");
    await page.locator("#referral-need-form select").first().selectOption({ label: focus });
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal")).toHaveCount(0);
  };
  await begin("Anxiety/Panic Disorders");
  await expect(page.locator(".draft-banner")).toHaveCount(1);
  await begin("Depression");
  await expect(page.locator(".draft-banner")).toHaveCount(2);
  // Each draft resumes with its own answers.
  await page.locator(".draft-banner", { hasText: "Anxiety/Panic Disorders" }).getByRole("button", { name: "Continue draft" }).click();
  await expect(page.locator("#referral-need-form")).toBeVisible();
  expect(await page.locator("#referral-need-form select").first().inputValue()).toMatch(/anxiety/i);
  await page.keyboard.press("Escape");
  // Deleting one leaves the other.
  await page.locator(".draft-banner", { hasText: "Depression" }).getByRole("button", { name: "Delete draft" }).click();
  await page.locator(".modal").getByRole("button", { name: /Delete/ }).last().click();
  await expect(page.locator(".draft-banner")).toHaveCount(1);
  await clean(page);
  await context.close();
});

test("V15-04 a message opened from the Network has a Back button to where you were", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/network");
  await page.locator('[data-action="network-tab:directory"]').first().click();
  await page.locator('.people-grid [data-action^="person-message:"]').first().click();
  const back = page.locator(".chat-origin");
  await expect(back).toBeVisible();
  await expect(back).toContainText("Back to");
  await back.click();
  await expect(page).toHaveURL(/\/dashboard\/network$/);
  await expect(page.locator(".directory-search")).toBeVisible();
  // From the inbox itself there is no such button.
  await page.goto("/dashboard/messages");
  await expect(page.locator(".chat-origin")).toHaveCount(0);
  await clean(page);
  await context.close();
});

test("V15-05 Consult replies: Useful stays, Flag lives in a menu, and nothing says Report", async ({ browser, baseURL }) => {
  const [c] = await q(`insert into consultations (author_profile_id, question, audience_type, status, deidentification_confirmed, kind, topic) values ($1, 'V15 How do you close a case?', 'wider_network', 'open', true, 'question', 'Clinical practice') returning id`, [bram.id]);
  await q(`insert into consultation_responses (consultation_id, responder_profile_id, body) values ($1, $2, 'V15 A reply from Cass')`, [c.id, cass.id]);
  const { page, context } = await openAs(browser, "avery", baseURL!, `/dashboard/consult?discussion=${c.id}`);
  const reply = page.locator(".reply", { hasText: "V15 A reply from Cass" });
  await expect(reply.locator(".useful-button")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Report/ })).toHaveCount(0);
  await expect(reply.locator(".report-link")).toBeHidden();
  await reply.locator(".row-menu summary").click();
  await expect(reply.locator(".report-link")).toContainText("Flag this reply");
  await reply.locator(".report-link").click();
  await expect(page.locator(".modal")).toContainText("Flag a concern");
  await clean(page);
  await context.close();
});

test("V15-06 Library: PDF templates come first, are tagged, and can be filtered", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/library");
  await expect(page.locator('[data-action="resource-filter:PDF templates"]')).toBeVisible();
  await expect(page.locator(".resource-card").first().locator(".pdf-tag")).toBeVisible();
  await page.locator('[data-action="resource-filter:PDF templates"]').click();
  const cards = page.locator(".resource-card");
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  for (const c of await cards.all()) await expect(c.locator(".pdf-tag")).toBeVisible();
  await clean(page);
  await context.close();
});

test("V15-07 your own profile uses the same layout as a colleague's", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard");
  await page.locator('[data-action="profile:me"]').first().click();
  await expect(page.locator(".modal .pf-hero.is-own")).toBeVisible();
  await expect(page.locator(".modal .pf-cols")).toBeVisible();
  await expect(page.locator(".modal")).toContainText("Practice at a glance");
  await expect(page.locator(".modal")).toContainText("Current availability");
  await clean(page);
  await context.close();
});

test("V15-08 Hub: a visible greeting, three service cards in one row, nothing else crowding", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard");
  // 1.0: a short visible greeting on the page; the top bar names the place.
  await expect(page.locator(".topbar .breadcrumbs strong")).toHaveText("The Hub");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Avery$/);
  await expect(page.locator(".hub-hello")).toBeVisible();
  const areas = page.locator(".hub-card");
  await expect(areas).toHaveCount(3);
  const boxes = await areas.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(2); // one row
  await expect(page.getByText(/actions? waiting/i)).toHaveCount(0);
  await clean(page);
  await context.close();
});

test("V15-09 phone: the Hub fits the screen and nothing scrolls sideways", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard", true);
  await expect(page.locator(".hub-hello")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  for (const path of ["/dashboard/cover", "/dashboard/referrals", "/dashboard/network", "/dashboard/consult"]) {
    await page.goto(path);
    await expect(page.locator("#app .mobile-nav")).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), path).toBe(true);
  }
  await clean(page);
  await context.close();
});
