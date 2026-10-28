import { test, expect, type Page, type Browser } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one } from "../../../lib/staging";

// Version 14: the parts of the 18 October version brought back into the v13
// workspace (migration 0122), on the real local database, as signed-in
// fictional staging members. Each test names the pick it covers (G1..G7, D2..D9).
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const avery = account("avery"), bram = account("bram"), cass = account("cass"), fenn = account("fenn");
const others = ["gale", "dara", "sol", "esme"].map((k) => account(k));
const everyone = [avery.id, bram.id, cass.id, fenn.id, ...others.map((o) => o.id)];

// What a test may change, put back as it was.
let original: Record<string, string> = {};
test.beforeAll(async () => {
  const rows = await q(`select id, referral_availability from profiles where id = any($1::uuid[])`, [everyone]);
  original = Object.fromEntries(rows.map((r: any) => [r.id, r.referral_availability]));
});
async function tidy() {
  await q(`delete from do_not_work_with where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from trusted_colleagues where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from consultation_responses where responder_profile_id = $1 and body like 'FOL %'`, [avery.id]);
  await q(`delete from reports where reporter_profile_id = $1 and reason like 'FOL %'`, [avery.id]);
  await q(`delete from conversations where title like 'FOL %'`);
  await q(`delete from consultations where question like 'FOL %'`);
  for (const [id, v] of Object.entries(original)) await q(`update profiles set referral_availability = $2 where id = $1`, [id, v]);
}
test.beforeEach(tidy);
test.afterAll(tidy);

// Questions for Avery to find in Consult, filed under three topics.
async function seedQuestions() {
  const rows: Array<[string, string, string]> = [
    [bram.id, "FOL How do you handle a first session that runs long?", "Clinical practice"],
    [cass.id, "FOL When is a case note too detailed?", "Clinical practice"],
    [bram.id, "FOL Which intake forms do you recommend?", "Resources"],
    [cass.id, "FOL Setting a sustainable caseload", "Professional life"],
  ];
  for (const [author, question, topic] of rows)
    await q(
      `insert into consultations (author_profile_id, question, audience_type, status, deidentification_confirmed, kind, topic) values ($1, $2, 'wider_network', 'open', true, 'question', $3)`,
      [author, question, topic],
    );
}

const problems = new WeakMap<Page, string[]>();
async function openAs(browser: Browser, who: string, baseURL: string, path = "/dashboard", phone = false) {
  const context = await browser.newContext(
    phone
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1365, height: 900 } },
  );
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  const errs: string[] = [];
  problems.set(page, errs);
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(path);
  await expect(page.locator("#app .sidebar, #app .mobile-nav").first()).toBeAttached();
  return { context, page };
}
const clean = (page: Page) => expect(problems.get(page)).toEqual([]);

async function startReferral(page: Page) {
  // A saved draft would resume with its own ticks; these tests look at the ones the screen starts with.
  await q(`delete from workspace_drafts where profile_id = $1`, [avery.id]);
  await page.goto("/dashboard/referrals");
  await page.locator('[data-action="referral-start"]').first().click();
  await expect(page.locator("#referral-need-form")).toBeVisible();
  await page.locator("#referral-need-form select").first().selectOption({ label: "Anxiety/Panic Disorders" });
  await page.locator('.modal-footer button[type="submit"]').click();
  await expect(page.locator(".match-card").first()).toBeVisible();
}
const ticked = (page: Page) => page.locator('input[data-match="referral"]:checked').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test("FOL-01 Hub (D4): a greeting with the name, up to four discussions, and a year line that counts only what happened", async ({ browser, baseURL }) => {
  // One answer given this year, so the line has something to count.
  await seedQuestions();
  const asked = await one(`select id from consultations where question like 'FOL How do you handle%'`);
  await q(`insert into consultation_responses (consultation_id, responder_profile_id, body) values ($1, $2, 'FOL an answer')`, [asked.id, avery.id]);
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await expect(page.locator(".content h1")).toHaveText(/^Good (morning|afternoon|evening), Avery\.$/);
  const rows = page.locator(".home-discussion");
  await expect(page.locator(".home-discussion, .pulse-empty").first()).toBeAttached(); // discussions, or the honest empty note
  expect(await rows.count()).toBeLessThanOrEqual(4);
  const more = page.getByRole("button", { name: /^All \d+ discussions$/ });
  if (await more.count()) expect(Number((await more.innerText()).match(/\d+/)![0])).toBeGreaterThan(4);
  const items = page.locator(".home-ledger li");
  await expect(items.filter({ hasText: /question(s)? you answered/ })).toHaveCount(1);
  for (const item of await items.allInnerTexts()) expect(item).toMatch(/^[1-9]\d* /); // never "0 ..."
  await clean(page);
  await context.close();
});

test("FOL-02 Consult (G3): topic labels and a topic filter that narrows the list, and the posting guide", async ({ browser, baseURL }) => {
  await seedQuestions();
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  await expect(page.locator(".consult-grid")).toBeVisible();
  const chips = page.locator(".topic-bar button");
  await expect(chips.first()).toHaveText("All topics");
  expect(await chips.count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator(".guidance-card")).toContainText("de-identified");
  const all = await page.locator(".discussion-row").count();
  const topic = (await chips.nth(1).innerText()).trim();
  await chips.nth(1).click();
  const rows = page.locator(".discussion-row");
  expect(await rows.count()).toBeLessThanOrEqual(all);
  expect(await rows.count()).toBeGreaterThan(0);
  for (const r of await rows.all()) await expect(r).toContainText(topic);
  await page.locator('[data-action="consult-topic:"]').click();
  expect(await page.locator(".discussion-row").count()).toBe(all);
  await clean(page);
  await context.close();
});

test("FOL-03 Consult (G6): a reply ticked as a clarifying question is saved and shown as one; a plain reply is not", async ({ browser, baseURL }) => {
  await seedQuestions();
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  await expect(page.locator(".consult-grid")).toBeVisible();
  await page.locator(".discussion-row:not(:has(.label.gray)) [data-action^=\"discussion:\"]").first().click();
  await expect(page.locator("#reply-form")).toBeVisible();
  await page.locator("#discussion-reply").fill("FOL a clarifying question about how long they have been in treatment?");
  await page.locator("#reply-form input[name=clarifying]").check();
  await page.locator("#reply-form button[type=submit]").click();
  await expect(page.locator(".reply-kind")).toContainText("asked a clarifying question");
  await expect
    .poll(async () => (await q(`select response_type from consultation_responses where responder_profile_id = $1 and body like 'FOL %'`, [avery.id])).map((r: any) => r.response_type))
    .toEqual(["clarifying_question"]);
  await page.locator("#discussion-reply").fill("FOL and thank you for the context.");
  await page.locator("#reply-form button[type=submit]").click();
  await expect
    .poll(async () => (await q(`select response_type from consultation_responses where responder_profile_id = $1 and body like 'FOL %' order by id`, [avery.id])).map((r: any) => r.response_type))
    .toEqual(["clarifying_question", "reply"]);
  expect(await page.locator(".reply-kind").count()).toBe(1);
  await clean(page);
  await context.close();
});

test("FOL-04 Availability (G4, D8): three referral choices saved as the member's own, the rules explained, and Last confirmed shown", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await expect(page.locator(".content")).toBeVisible();
  await page.locator('[data-action="availability"]:visible').first().click();
  const form = page.locator("#availability-form");
  await expect(form).toBeVisible();
  for (const label of ["Accepting", "Selected referrals only", "Not accepting"]) await expect(form.locator(".av-seg label", { hasText: label }).first()).toBeVisible();
  await expect(page.locator(".modal")).toContainText("Last confirmed");
  await expect(page.locator(".modal")).toContainText("At a glance");
  await expect(page.locator(".modal")).toContainText("30");
  await expect(page.locator(".modal")).toContainText("90");
  await form.locator(".av-seg label", { hasText: "Selected referrals only" }).first().click();
  await page.getByRole("button", { name: /Save & confirm availability/ }).click();
  await expect(page.locator("#toast, .toast").first()).toBeVisible();
  await expect.poll(async () => (await one(`select referral_availability as v from profiles where id = $1`, [avery.id])).v).toBe("limited");
  await page.reload();
  await page.locator('[data-action="availability"]:visible').first().click();
  await expect(page.locator('#availability-form input[type="radio"][value="limited"]')).toBeChecked();
  await clean(page);
  await context.close();
});

test("FOL-05 Referral matches (G5): ranked 1, 2, 3 with reasons; a colleague who takes selected referrals only is listed but not ticked", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/referrals");
  await startReferral(page);
  const ranks = await page.locator(".match-rank").allInnerTexts();
  expect(ranks.length).toBeGreaterThanOrEqual(2);
  expect(ranks).toEqual(ranks.map((_, i) => String(i + 1)));
  for (const r of await page.locator(".match-reasons").all()) expect(await r.locator("span").count()).toBeGreaterThanOrEqual(2);
  const first = await ticked(page);
  expect(first.length).toBeGreaterThan(0);
  const x = first[0];
  await context.close();

  await q(`update profiles set referral_availability = 'limited' where id = $1`, [x]);
  const again = await openAs(browser, "avery", baseURL!, "/dashboard/referrals");
  await startReferral(again.page);
  const box = again.page.locator(`input[data-match="referral"][value="${x}"]`);
  await expect(box).toHaveCount(1); // still listed, so the member can choose them
  await expect(box).not.toBeChecked(); // but not ticked for the member
  await expect(box).toBeEnabled();
  await clean(again.page);
  await again.context.close();
});

test("FOL-06 Exclude (G7, D6): private and silent, saved as the member's own, and the colleague is left out of the ticks", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/referrals");
  await startReferral(page);
  const x = (await ticked(page))[0];
  const name = (await one(`select full_name as n from profiles where id = $1`, [x])).n as string;
  await context.close();

  const eventsBefore = Number((await one(`select count(*)::int as n from notification_events`)).n);
  const mine = await openAs(browser, "avery", baseURL!, "/dashboard/network");
  await mine.page.locator(`[data-action="profile:${x}"]`).first().click().catch(async () => {
    await mine.page.getByRole("button", { name: /Find colleagues/ }).first().click();
    await mine.page.locator('input[name="q"]').first().fill(name);
    await mine.page.keyboard.press("Enter");
    await mine.page.locator(`[data-action="profile:${x}"]`).first().click();
  });
  const modal = mine.page.locator(".modal");
  // D6: the fuller profile.
  for (const h of ["Practice at a glance", "What is known here", "Your controls"]) await expect(modal).toContainText(h);
  await expect(modal).toContainText("is never told");
  await modal.locator(`[data-action="exclude-toggle:${x}"]`).click();
  await expect(mine.page.locator("#toast")).toContainText("won’t be suggested to you");
  await expect
    .poll(async () => (await q(`select block_type from do_not_work_with where profile_id = $1 and blocked_profile_id = $2`, [avery.id, x])).map((r: any) => r.block_type))
    .toEqual(["exclude"]);
  await expect(modal.locator(`[data-action="exclude-toggle:${x}"]`)).toContainText("Include in suggestions again");
  // Silent: nobody is notified of it.
  expect(Number((await one(`select count(*)::int as n from notification_events`)).n)).toBe(eventsBefore);
  await clean(mine.page);
  await mine.context.close();

  // Left out of the ticks, still listed so the member can choose them.
  const again = await openAs(browser, "avery", baseURL!, "/dashboard/referrals");
  await startReferral(again.page);
  expect(await ticked(again.page)).not.toContain(x);
  await again.context.close();

  // Put back from the same control.
  const back = await openAs(browser, "avery", baseURL!, "/dashboard/network");
  await back.page.locator(`[data-action="profile:${x}"]`).first().click().catch(async () => {
    await back.page.getByRole("button", { name: /Find colleagues/ }).first().click();
    await back.page.locator('input[name="q"]').first().fill(name);
    await back.page.keyboard.press("Enter");
    await back.page.locator(`[data-action="profile:${x}"]`).first().click();
  });
  await back.page.locator(`.modal [data-action="exclude-toggle:${x}"]`).click();
  await expect(back.page.locator("#toast")).toContainText("can be suggested to you again");
  await expect.poll(async () => (await q(`select 1 from do_not_work_with where profile_id = $1 and blocked_profile_id = $2`, [avery.id, x])).length).toBe(0);
  await back.context.close();
});

test("FOL-07 Messages (G1, G2): a conversation of three is listed under Group, shows who wrote, replies once, and a message can be reported", async ({ browser, baseURL }) => {
  const c = await one(`insert into conversations (created_by, title) values ($1, 'FOL group of three') returning id`, [bram.id]);
  for (const p of [avery.id, bram.id, cass.id]) await q(`insert into conversation_participants (conversation_id, profile_id) values ($1, $2)`, [c.id, p]);
  await q(`insert into conversation_messages (conversation_id, author_id, body) values ($1, $2, 'FOL hello from Bram'), ($1, $3, 'FOL and hello from Cass')`, [c.id, bram.id, cass.id]);

  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/messages");
  await expect(page.locator("#inbox-list")).toBeVisible();
  const chip = page.locator('[data-action^="inbox-filter:"]', { hasText: /^Group$/ });
  await expect(chip).toBeVisible();
  await chip.click();
  const row = page.locator(".inbox-group").first();
  await expect(row).toBeVisible();
  await row.locator('[data-action^="thread:"]').first().click();
  const authors = await page.locator(".bubble-author").allInnerTexts();
  expect(authors.join(" ")).toContain(bram.name.split(" ")[0]);
  expect(authors.join(" ")).toContain(cass.name.split(" ")[0]);
  await page.locator('.chat-header [data-action^="group-members"]').click();
  for (const p of [avery, bram, cass]) await expect(page.locator(".group-members")).toContainText(p.name.split(" ")[0]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(0);

  // Reply once.
  await page.getByLabel("Write a message").fill("FOL thanks both");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(async () => Number((await one(`select count(*)::int as n from conversation_messages where conversation_id = $1 and author_id = $2`, [c.id, avery.id])).n)).toBe(1);

  // G2: report someone else's message; it lands in the existing moderation list.
  const theirs = page.locator(".message-group:not(.outgoing)").first();
  await theirs.hover();
  await theirs.locator(".message-menu-button").click({ force: true });
  await page.locator('.popover [data-action^="report-start"]').click();
  await page.selectOption("#report-category", "conduct");
  await page.fill("#report-reason", "FOL a test report");
  await page.locator('button[type=submit][form=report-form], .modal-footer [form="report-form"]').first().click();
  await expect
    .poll(async () => (await q(`select target_type, category, status from reports where reporter_profile_id = $1 and reason like 'FOL %'`, [avery.id])).map((r: any) => `${r.target_type}/${r.category}/${r.status}`))
    .toEqual(["message/conduct/open"]);
  await clean(page);
  await context.close();
});

test("FOL-08 Network (D9): every trusted colleague is listed, not the first few", async ({ browser, baseURL }) => {
  for (const o of [bram, cass, fenn, others[0], others[1]]) await q(`insert into trusted_colleagues (profile_id, colleague_id) values ($1, $2) on conflict do nothing`, [avery.id, o.id]);
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/network");
  await expect(page.locator("#net-trusted")).toBeVisible();
  await expect(page.locator("#net-trusted .net-row")).toHaveCount(5);
  await expect(page.locator("#net-trusted").getByRole("button", { name: /^View all/ })).toHaveCount(0);
  await clean(page);
  await context.close();
});

test("FOL-09 Phone bar (D2): Hub, Cover, Referrals, Consult, Messages, in that order", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard", true);
  const nav = page.locator(".mobile-nav");
  await expect(nav).toBeVisible();
  const labels = (await nav.innerText()).split("\n").map((s) => s.trim()).filter((s) => /^[A-Za-z ]+$/.test(s));
  expect(labels).toEqual(["The Hub", "Cover", "Referrals", "Consult", "Messages"]);
  await clean(page);
  await context.close();
});
