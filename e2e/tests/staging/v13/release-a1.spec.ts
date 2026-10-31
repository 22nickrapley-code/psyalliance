import { test, expect, type Page, type Browser } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q } from "../../../lib/staging";

// Release A.1 (Nick's sandbox review, 30 Oct 2026): the referral form lines up, Consult starts a new question, colleagues in
// Search carry their relationship colour, the Hub has a search field and calmer bars, Cover and Network lists are consistent,
// and nothing scrolls sideways on a phone. Real local database, fictional members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery"), fenn = account("fenn"), dara = account("dara");
const everyone = [avery.id, fenn.id, dara.id];
async function tidy() {
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[]) and kind <> 'hub-state'`, [everyone]);
  await q(`delete from coverage_plans where profile_id = any($1::uuid[]) and title like 'A1 %'`, [everyone]);
  await q(`delete from conversations where context_key like 'cover-%' and not exists (select 1 from coverage_plans)`);
}
test.beforeEach(tidy);
test.afterAll(tidy);

async function openAs(browser: Browser, who: string, baseURL: string, path = "/dashboard", width = 1365) {
  const phone = width < 700;
  const context = await browser.newContext(phone ? { viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("#app .sidebar, #app .mobile-nav").first()).toBeAttached();
  return { context, page };
}
const top = async (page: Page, sel: string) => Math.round((await page.locator(sel).boundingBox())!.y);
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("A1-01 two-column pop-up fields sit on one line, and rows are evenly spaced", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator('[data-action="referral-start"]').first().click();
  await expect(page.locator("#referral-need-form")).toBeVisible();
  await page.waitForTimeout(900); // the pop-up finishes opening
  expect(await top(page, "#referral-focus")).toBe(await top(page, "#referral-secondary"));
  expect(await top(page, "#referral-state")).toBe(await top(page, "#referral-age"));
  expect(await top(page, "#referral-setting")).toBe(await top(page, "#referral-insurance"));
  const gaps = [await top(page, "#referral-state"), await top(page, "#referral-setting"), await top(page, "#referral-city")];
  const first = await top(page, "#referral-focus");
  const pitch = [gaps[0] - first, gaps[1] - gaps[0], gaps[2] - gaps[1]];
  expect(new Set(pitch).size).toBe(1);
  await context.close();
});

test("A1-02 Consult always starts a new question; a saved draft is offered on the Consult page", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator('[data-action="peer-start"]').first().click();
  await expect(page.locator("#peer-title")).toHaveValue("");
  await page.fill("#peer-title", "A1 A question I started earlier");
  await page.fill("#peer-body", "Some context that is not finished.");
  await expect(page.locator("#save-state, .save-note").first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(0);
  // Clicking Ask a question again begins a blank one, not the old one.
  await page.locator('[data-action="peer-start"]').first().click();
  await expect(page.locator("#peer-title")).toHaveValue("");
  await expect(page.getByText("Your draft is restored.")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // The earlier question is waiting as a draft on the Consult page.
  await page.locator('.sidebar .nav-item[data-action="nav:consult"]').click();
  const banner = page.locator(".draft-banner", { hasText: "A1 A question I started earlier" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Continue draft" }).click();
  await expect(page.locator("#peer-title")).toHaveValue("A1 A question I started earlier");
  await page.keyboard.press("Escape");
  await banner.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("button", { name: "Delete draft" }).last().click();
  await expect(page.locator(".draft-banner", { hasText: "A1 A question I started earlier" })).toHaveCount(0);
  await context.close();
});

test("A1-03 an old single Consult draft becomes one entry of the list and is not lost", async ({ browser, baseURL }) => {
  await q(`insert into workspace_drafts (profile_id, kind, key, data) values ($1, 'peer', '', $2::jsonb)
           on conflict (profile_id, kind, key) do update set data = excluded.data`,
    [avery.id, JSON.stringify({ type: "peer", step: 0, title: "A1 Older saved question", body: "From an earlier version.", tag: "Clinical practice", tags: "", audience: "trusted", recipients: [], group: "thursday", reviewed: false, error: "" })]);
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  const banner = page.locator(".draft-banner", { hasText: "A1 Older saved question" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Continue draft" }).click();
  await expect(page.locator("#peer-title")).toHaveValue("A1 Older saved question");
  await context.close();
});

test("A1-04 colleagues in Search carry their relationship colour and name", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  const dialog = page.locator(".modal");
  await dialog.getByRole("button", { name: "Colleagues", exact: true }).click();
  await dialog.getByRole("searchbox", { name: "Search PsyAlliance" }).fill("a");
  const rows = dialog.locator("#global-results .global-result.has-avatar");
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  expect(n).toBeGreaterThan(1);
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const klass = (await row.locator(".avatar").getAttribute("class")) || "";
    const label = (await row.locator(".relationship-label").getAttribute("class")) || "";
    const tier = /relation-(trusted|worked|suggested|other)/.exec(klass)?.[1];
    expect(tier).toBeTruthy();
    expect(label).toContain(`relation-${tier}`);
  }
  // The colour itself differs by relationship: solid fill, white initials.
  const colours = await rows.evaluateAll((els) => els.map((e) => getComputedStyle(e.querySelector(".avatar")!).backgroundColor));
  expect(colours.every((c) => c !== "rgba(0, 0, 0, 0)")).toBe(true);
  await context.close();
});

test("A1-05 Search is one prominent field in the top bar (1.0: not repeated on the Hub), and opening it opens Search", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await expect(page.locator(".hub-page .hub-search")).toHaveCount(0);
  const field = page.locator(".topbar .top-search");
  await expect(field).toBeVisible();
  await expect(field).toContainText("Search colleagues, referrals, cover, consults, Library");
  const box = (await field.boundingBox())!;
  expect(box.width).toBeGreaterThan(300);
  await field.click();
  await expect(page.locator(".modal").getByRole("searchbox", { name: "Search PsyAlliance" })).toBeVisible();
  await context.close();
});

test("A1-06 'You are up to date' is a status bar of its own, and the invite is a card with one button", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "dara", baseURL!);
  const bar = page.locator(".hub-clear-bar");
  await expect(bar).toBeVisible();
  await expect(bar.locator(".hub-attn-clear")).toHaveText("You’re up to date");
  await expect(bar.locator(".hub-clear-mark svg")).toBeVisible();
  const card = page.locator(".hub-invite-card");
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Invite a colleague" })).toHaveCount(1);
  const cardBox = (await card.boundingBox())!, btnBox = (await card.getByRole("button", { name: "Invite a colleague" }).boundingBox())!;
  expect(btnBox.width).toBeLessThan(cardBox.width / 2);
  expect(btnBox.height).toBeLessThan(60);
  await context.close();
});

test("A1-07 Cover lists line up: same header height, same row look whatever the status", async ({ browser, baseURL }) => {
  // Other Cover tests clear the plans, so this one makes its own: a plan with one invitation sent.
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  await page.locator('[data-action="cover-start"]').first().click();
  await page.locator("#cover-name").fill("A1 Autumn leave");
  await page.getByRole("button", { name: "Continue to needs" }).click();
  await page.locator("#cover-focus").selectOption("Anxiety/Panic Disorders");
  await page.locator("#cover-setting").selectOption("virtual");
  await page.getByRole("button", { name: "Save client", exact: true }).click();
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await page.locator('input[data-match="cover"]').first().check();
  await page.getByRole("button", { name: "Review invitations" }).click();
  await page.locator('#cover-send-form input[name="reviewed"]').check();
  await page.getByRole("button", { name: "Send cover requests" }).click();
  await expect(page.locator("#toast")).toContainText("Cover requests sent");
  await page.goto("/dashboard/cover");
  await expect(page.locator(".arrangement-row").first()).toBeVisible();
  const panels = page.locator(".split-lists > .panel");
  await expect(panels).toHaveCount(2);
  const bodies = page.locator(".split-lists > .panel .list-section-body");
  const t0 = Math.round((await bodies.nth(0).boundingBox())!.y), t1 = Math.round((await bodies.nth(1).boundingBox())!.y);
  expect(t0).toBe(t1);
  // No coloured left bar: every row has the same left border width.
  const widths = await page.locator(".arrangement-row").evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).borderLeftWidth))]);
  expect(widths).toEqual(["0px"]);
  await context.close();
});

test("A1-08 Network groups sit in three columns on a computer (1.0, Nick 31 Oct), rows inside their panel, avatars carry the relationship colour", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/network");
  const groups = page.locator(".relationship-groups > .relationship-group");
  await expect(groups).toHaveCount(3);
  const boxes = [];
  for (let i = 0; i < 3; i++) boxes.push((await groups.nth(i).boundingBox())!);
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);
  expect(Math.abs(boxes[1].y - boxes[2].y)).toBeLessThan(2);
  expect(boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x).toBe(true);
  const group = page.locator("#net-worked");
  const card = group.locator(".net-list .net-row").first();
  await expect(card).toBeVisible();
  const g = (await group.boundingBox())!, c = (await card.boundingBox())!;
  expect(c.x - g.x).toBeGreaterThanOrEqual(0);
  expect(c.x + c.width).toBeLessThanOrEqual(g.x + g.width + 1);
  await expect(card.locator(".avatar")).toHaveClass(/relation-worked/);
  const bg = await card.locator(".avatar").evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  await expect(group.locator(".net-head p")).toContainText("Builds itself after a referral, cover or consult together");
  await context.close();
});

for (const width of [390, 320]) {
  test(`A1-09 nothing scrolls sideways on a ${width}px phone: Hub, Cover, Network, Referrals, Consult`, async ({ browser, baseURL }) => {
    const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard", width);
    for (const path of ["/dashboard", "/dashboard/cover", "/dashboard/network", "/dashboard/referrals", "/dashboard/consult"]) {
      await page.goto(path);
      await page.waitForTimeout(900);
      expect(await noSidewaysScroll(page), path).toBe(true);
    }
    await page.goto("/dashboard");
    await page.locator('[data-action="referral-start"]').first().click();
    await expect(page.locator("#referral-need-form")).toBeVisible();
    expect(await noSidewaysScroll(page), "referral form").toBe(true);
    await context.close();
  });
}

test("A1-10 Cover pop-up on a phone: the step bar does not wrap, the colleague card is tidy, one invitation reads correctly", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover", 390);
  await page.locator('[data-action="cover-start"]').first().click();
  await page.locator("#cover-name").fill("A1 Phone check");
  await page.getByRole("button", { name: "Continue to needs" }).click();
  await page.locator("#cover-focus").selectOption("Anxiety/Panic Disorders");
  await page.locator("#cover-setting").selectOption("virtual");
  await page.getByRole("button", { name: "Save client", exact: true }).click();
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await page.waitForTimeout(900);
  const steps = (await page.locator(".workflow-steps").boundingBox())!;
  expect(steps.height).toBeLessThan(64);
  await expect(page.locator(".workflow-step.active")).toContainText("Colleagues");
  const card = page.locator(".match-card").first();
  const link = (await card.locator(".match-profile-link").boundingBox())!, name = (await card.locator(".match-card-select strong").boundingBox())!;
  expect(link.y).toBeGreaterThan(name.y); // the Profile link sits under the name, not squeezed beside it
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.locator('input[data-match="cover"]').first().check();
  await page.getByRole("button", { name: "Review invitations" }).click();
  await expect(page.locator(".outreach-summary")).toContainText("1 invitation goes out first, one per client with a colleague selected.");
  const field = (await page.locator("#cover-deadline").boundingBox())!, modal = (await page.locator(".modal").boundingBox())!;
  expect(field.width).toBeGreaterThan(modal.width * 0.7); // full width, not half beside the note
  await context.close();
});
