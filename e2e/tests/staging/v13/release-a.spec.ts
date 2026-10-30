import { test, expect, type Page, type Browser } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember, db } from "../../../lib/staging";

// Release A (brief of 29 Oct 2026): the three-card Hub, the one action list with Later and Set aside kept on the
// account, the Consult help group and nav dot, navigation order, the phone shell and global search with scopes.
// Real local database, fictional members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

// Fenn and Dara have no baseline work in the staging data, so the counts below are exact.
const avery = account("avery"), bram = account("fenn"), cass = account("dara");
const everyone = [avery.id, bram.id, cass.id];
const uuid = () => crypto.randomUUID();

const client = (over: Record<string, unknown> = {}) => ({
  label: "Client 1", focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", age: "", setting: "virtual",
  insurance: "", frequency: "Weekly", prescribing: false, language: "", city: "", selected: [], ...over,
});
const coverPlan = (over: Record<string, unknown> = {}) => ({
  requestId: uuid(), name: "RA Autumn leave", reason: "short", other: "", start: "2026-11-02", end: "2026-11-13",
  mode: "sequential", deadline: 48, message: "Weekly appointments.", ...over,
});
const rpc = async (who: string, sql: string, params: unknown[] = []) => (await asMember(who, sql, params)).rows[0]?.r;

async function tidy() {
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from coverage_plans where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from referral_requests where requesting_profile_id = any($1::uuid[]) and client_request_id is not null`, [everyone]);
  await q(`delete from consultation_responses where body like 'RA %'`);
  await q(`delete from consultations where question like 'RA %'`);
  await q(`delete from conversations where context_key like 'cover-%' or context_key like 'referral-%'`);
  await q(`update profiles set availability_confirmed_at = now() - interval '5 days' where id = any($1::uuid[])`, [everyone]);
}
test.beforeEach(tidy);
test.afterAll(tidy);

// Bram receives two cover requests (one per client), one referral and one question sent straight to him.
async function seedForBram() {
  const plan = await rpc(avery.id, `select public.cover_create_plan($1::jsonb) as r`, [JSON.stringify(coverPlan({ clients: [client({ label: "Client 1", selected: [bram.id] }), client({ label: "Client 2", focus: "Depression", selected: [bram.id] })] }))]);
  const referral = await rpc(avery.id, `select public.referral_create($1::jsonb) as r`, [JSON.stringify({
    requestId: uuid(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual", insurance: "", language: "",
    prescribing: false, audience: "selected", selected: [bram.id, cass.id], timeframe: "Within two weeks", message: "Weekly sessions, no identifying details.",
  })]);
  const question = await rpc(avery.id, `select public.consult_post($1::jsonb) as r`, [JSON.stringify({
    title: "RA How do you structure a first session?", body: "Context, no identifying details.", topic: "Clinical practice", tags: [], confirmed: "true",
    clientRequestId: uuid(), audience: "one", recipients: [bram.id],
  })]);
  return { plan, referral, question };
}

const problems = new WeakMap<Page, string[]>();
async function openAs(browser: Browser, who: string, baseURL: string, path = "/dashboard", phone = false, width = 390) {
  const context = await browser.newContext(phone ? { viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1365, height: 900 } });
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
const headline = (page: Page) => page.locator(".hub-attn-main, .hub-attn-clear");
const counted = (page: Page) => page.locator(".hub-group:not(.hub-group-help):not(.hub-group-aside) .hub-row");
const ensureOpen = async (page: Page) => {
  const t = page.locator(".hub-attn-toggle");
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await expect(t).toHaveAttribute("aria-expanded", "true");
};
const PATHS: Record<string, string> = { home: "/dashboard", referrals: "/dashboard/referrals", cover: "/dashboard/cover", consult: "/dashboard/consult" };
const go = async (page: Page, view: string) => {
  await page.locator(`.sidebar .nav-item[data-action="nav:${view}"]`).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(PATHS[view]);
};
const plural = (n: number) => (n === 0 ? "You’re up to date" : n === 1 ? "1 thing needs your attention" : `${n} things need your attention`);

test("RA-01 the Hub is a compact heading, one actions control, three plain cards and a small invitation", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  const cards = page.locator(".hub-cards .hub-card");
  await expect(cards).toHaveCount(3);
  // Referrals first (Nick's order), then Cover, then Consult; each is one button with the action in its name.
  expect((await cards.allInnerTexts()).map((t) => t.split("\n")[0].trim())).toEqual(["Referrals", "Cover", "Consult"]);
  await expect(cards.nth(0)).toContainText("Refer a client");
  await expect(cards.nth(1)).toContainText("Plan cover");
  await expect(cards.nth(2)).toContainText("Ask a question");
  for (let i = 0; i < 3; i++) {
    expect(await cards.nth(i).evaluate((e) => e.tagName)).toBe("BUTTON");
    expect(await cards.nth(i).locator("button, a, input, [data-action]").count()).toBe(0);
    await expect(cards.nth(i).locator(".nav-count, .badge, .label, .hub-area-count")).toHaveCount(0);
  }
  // None of the removed Hub parts come back.
  for (const gone of [".hub-areas", ".hub-capacity", ".hub-community", ".pulse-conversations", ".hub-network", "#home-discussions"]) await expect(page.locator(gone)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invite a colleague" })).toBeVisible();
  // Desktop navigation order.
  expect((await page.locator(".sidebar .nav-item:not(.nav-mobile-only)").allInnerTexts()).map((t) => t.replace(/\d+$/, "").trim())).toEqual(
    ["The Hub", "Referrals", "Cover", "Consult", "Network / Search", "Messages", "Library"]);
  await clean(page);
  await context.close();
});

test("RA-02 a creation card opens its overlay; it does not navigate, and navigation does not start a plan", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator(".hub-card", { hasText: "Plan cover" }).click();
  await expect(page.locator("#cover-name")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/dashboard");
  await page.keyboard.press("Escape");
  await page.locator(".hub-card", { hasText: "Refer a client" }).click();
  await expect(page.locator("#referral-need-form")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".hub-card", { hasText: "Ask a question" }).click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(0);
  // The sidebar Cover opens the overview, not a new plan.
  await page.locator('.sidebar [data-action="nav:cover"]').click();
  await expect(page.locator(".modal")).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/dashboard/cover");
  await clean(page);
  await context.close();
});

test("RA-03 the actions list counts every actionable row, groups reconcile, Collapse works and the state survives navigation", async ({ browser, baseURL }) => {
  await seedForBram();
  const { page, context } = await openAs(browser, "fenn", baseURL!);
  await expect(headline(page)).toHaveText(plural(4));
  await expect(page.locator(".hub-row")).toHaveCount(0); // collapsed
  await page.locator(".hub-attn-toggle").click();
  await expect(page.locator(".hub-attn-toggle")).toHaveAttribute("aria-expanded", "true");
  // Two cover rows (one per client), the referral and the direct question. A reply deadline is shown where there is one.
  await expect(counted(page)).toHaveCount(4);
  await expect(page.locator(".hub-group", { hasText: "Cover" }).locator(".hub-row")).toHaveCount(2);
  await expect(page.locator(".hub-group", { hasText: "Referrals" }).locator(".hub-row")).toHaveCount(1);
  await expect(page.locator(".hub-group", { hasText: "Consult" }).locator(".hub-row")).toHaveCount(1);
  const subtotals = (await page.locator(".hub-group:not(.hub-group-help):not(.hub-group-aside) h2 span").allInnerTexts()).map(Number);
  expect(subtotals.reduce((a, b) => a + b, 0)).toBe(4);
  await expect(page.locator(".hub-row", { hasText: "Client 2" })).toContainText("Reply to");
  // Anonymous context only: no client identity beyond the label and need.
  await expect(page.locator(".hub-row", { hasText: "Client 1" })).not.toContainText("@");
  // The state survives a trip to another page.
  await page.locator('.sidebar [data-action="nav:referrals"]').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/dashboard/referrals");
  await page.locator('.sidebar .nav-item[data-action="nav:home"]').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/dashboard");
  await expect(page.locator(".hub-attn-toggle")).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Collapse" }).click();
  await expect(page.locator(".hub-row")).toHaveCount(0);
  // Clicking an action opens the right arrangement.
  await page.locator(".hub-attn-toggle").click();
  await page.locator(".hub-row", { hasText: "referral" }).getByRole("button", { name: /Reply|Continue/ }).first().click();
  await expect(page.locator(".modal")).toBeVisible();
  await clean(page);
  await context.close();
});

test("RA-04 Later sets a task aside on the account, Restore brings it back, and nothing is accepted by setting it aside", async ({ browser, baseURL }) => {
  const seeded = await seedForBram();
  const { page, context } = await openAs(browser, "fenn", baseURL!);
  await page.locator(".hub-attn-toggle").click();
  await page.locator(".hub-row", { hasText: "Client 1" }).getByRole("button", { name: /^Later/ }).click();
  await expect(headline(page)).toHaveText(plural(3));
  await expect(page.locator(".hub-group-aside .hub-row")).toHaveCount(1);
  // It is on the server, not only in this browser.
  await expect.poll(async () => (await q(`select data from workspace_drafts where profile_id = $1 and kind = 'hub-state'`, [bram.id]))[0]?.data?.setAside ? Object.keys((await q(`select data from workspace_drafts where profile_id = $1 and kind = 'hub-state'`, [bram.id]))[0].data.setAside).length : 0).toBe(1);
  // The underlying request is still open: setting aside does not accept or decline anything.
  const open = await q(`select count(*)::int n from coverage_requests where requested_profile_id = $1 and status = 'sent'`, [bram.id]);
  expect(open[0].n).toBe(2);
  // A fresh browser (another device) sees the same thing.
  await page.reload();
  await expect(headline(page)).toHaveText(plural(3));
  await ensureOpen(page);
  await page.locator(".hub-group-aside .hub-row").getByRole("button", { name: /^Restore/ }).click();
  await expect(headline(page)).toHaveText(plural(4));
  await expect(page.locator(".hub-group-aside")).toHaveCount(0);
  void seeded;
  await clean(page);
  await context.close();
});

test("RA-05 a materially new event brings a set-aside task back", async ({ browser, baseURL }) => {
  // Dara owns the referral; Fenn and Bram are asked. Neither has anything else waiting for Dara.
  const realBram = account("bram");
  const made = await rpc(cass.id, `select public.referral_create($1::jsonb) as r`, [JSON.stringify({
    requestId: uuid(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual", insurance: "", language: "",
    prescribing: false, audience: "selected", selected: [bram.id, realBram.id], timeframe: "Within two weeks", message: "Weekly sessions, no identifying details.",
  })]);
  await rpc(bram.id, `select public.referral_answer($1::bigint, 'interested', true, null, $2::uuid) as r`, [made.referralId, uuid()]);
  const { page, context } = await openAs(browser, "dara", baseURL!);
  await expect(headline(page)).toHaveText(plural(1));
  await page.locator(".hub-attn-toggle").click();
  await page.locator(".hub-row").getByRole("button", { name: /^Later/ }).click();
  await expect(headline(page)).toHaveText("You’re up to date");
  // The control stays usable so the set-aside list is reachable.
  await ensureOpen(page);
  await expect(page.locator(".hub-group-aside .hub-row")).toHaveCount(1);
  // Bram now answers as well: that is new, so the task is active again.
  await rpc(realBram.id, `select public.referral_answer($1::bigint, 'interested', true, null, $2::uuid) as r`, [made.referralId, uuid()]);
  await page.reload();
  await expect(headline(page)).toHaveText(plural(1));
  await ensureOpen(page);
  await expect(page.locator(".hub-row")).toContainText(["2 colleagues are interested"]);
  await expect(page.locator(".hub-group-aside")).toHaveCount(0);
  await clean(page);
  await context.close();
});

test("RA-06 relevant questions are a separate, uncounted group with a quiet dot on Consult, not a feed", async ({ browser, baseURL }) => {
  const spec = await q<{ value: string }>(`select lv.value from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id where v.profile_id = $1 and lv.category = 'treatment_specialism' order by v.rank nulls last, lv.value limit 1`, [bram.id]);
  const word = (spec[0]?.value || "Anxiety").split(/[^A-Za-z]+/).filter((w) => w.length >= 5 && !/disorder/i.test(w))[0] || "Anxiety";
  await rpc(avery.id, `select public.consult_post($1::jsonb) as r`, [JSON.stringify({
    title: `RA Thoughts on ${word.toLowerCase()} work?`, body: "No identifying details.", topic: "Clinical practice", tags: [word], confirmed: "true", clientRequestId: uuid(), audience: "network",
  })]);
  const { page, context } = await openAs(browser, "fenn", baseURL!);
  // Nothing needs a decision, so the headline is quiet; the help is mentioned beside it, never counted.
  await expect(headline(page)).toHaveText("You’re up to date");
  await expect(page.locator(".hub-attn-note")).toContainText(/question[s]? you could help with/);
  await expect(page.locator('.sidebar [data-action="nav:consult"] .nav-dot')).toHaveCount(1);
  await expect(page.locator('.sidebar [data-action="nav:consult"] .nav-count')).toHaveCount(0);
  await expect(page.locator(".hub-card .label, .hub-card .nav-count")).toHaveCount(0);
  await page.locator(".hub-attn-toggle").click();
  const group = page.locator(".hub-group-help");
  const mineRow = group.locator(".hub-row", { hasText: "RA Thoughts on" });
  await expect(mineRow).toHaveCount(1);
  await expect(group).toContainText("Not required, and not counted above");
  // Visiting Consult clears the dot; it does not return for the same question.
  await go(page, "consult");
  await go(page, "home");
  await expect(page.locator('.sidebar [data-action="nav:consult"] .nav-dot')).toHaveCount(0);
  await ensureOpen(page);
  // Not for me hides that question.
  await page.locator(".hub-group-help .hub-row", { hasText: "RA Thoughts on" }).getByRole("button", { name: /Not for me/ }).click();
  await expect(page.locator(".hub-group-help .hub-row", { hasText: "RA Thoughts on" })).toHaveCount(0);
  await expect.poll(async () => JSON.stringify((await q(`select data from workspace_drafts where profile_id = $1 and kind = 'hub-state'`, [bram.id]))[0]?.data?.notForMe || [])).not.toBe("[]");
  await clean(page);
  await context.close();
});

test("RA-07 the Consult help group can be switched off and stays off on another device", async ({ browser, baseURL }) => {
  await rpc(avery.id, `select public.consult_post($1::jsonb) as r`, [JSON.stringify({
    title: "RA A question for a group I am in", body: "No identifying details.", topic: "Clinical practice", tags: [], confirmed: "true", clientRequestId: uuid(), audience: "trusted",
  })]);
  await q(`insert into trusted_colleagues (profile_id, colleague_id) values ($1, $2) on conflict do nothing`, [avery.id, bram.id]);
  const { page, context } = await openAs(browser, "fenn", baseURL!);
  await expect(page.locator(".hub-attn-note")).toContainText("could help with");
  await page.locator(".hub-attn-toggle").click();
  await page.getByRole("button", { name: "Hide this group" }).click();
  await expect(page.locator(".hub-attn-note")).toHaveCount(0);
  await expect.poll(async () => (await q(`select data->>'consultHelp' v from workspace_drafts where profile_id = $1 and kind = 'hub-state'`, [bram.id]))[0]?.v).toBe("false");
  await page.reload();
  await expect(page.locator(".hub-attn-note")).toHaveCount(0);
  await q(`delete from trusted_colleagues where profile_id = $1 and colleague_id = $2`, [avery.id, bram.id]);
  await clean(page);
  await context.close();
});

test("RA-08 availability reminder is separate from client work, with a one-tap confirmation", async ({ browser, baseURL }) => {
  await q(`update profiles set availability_confirmed_at = now() - interval '35 days' where id = $1`, [bram.id]);
  const { page, context } = await openAs(browser, "fenn", baseURL!);
  await expect(headline(page)).toHaveText("You’re up to date");
  const setup = page.locator(".hub-setup");
  await expect(setup).toContainText("Practice setup");
  await expect(setup).toContainText("35 days ago");
  await setup.getByRole("button", { name: "Confirm unchanged" }).click();
  await expect(page.locator(".hub-setup")).toHaveCount(0);
  const row = await one(`select availability_confirmed_at > now() - interval '1 hour' as fresh from profiles where id = $1`, [bram.id]);
  expect(row.fresh).toBe(true);
  await clean(page);
  await context.close();
});

test("RA-09 phone: five bottom items in order, a named Search in the top bar, stacked cards, no sideways scroll at 390 and 320", async ({ browser, baseURL }) => {
  for (const width of [390, 320]) {
    const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard", true, width);
    expect((await page.locator(".mobile-nav button").allInnerTexts()).map((t) => t.replace(/\d+$/, "").trim())).toEqual(["The Hub", "Referrals", "Cover", "Consult", "Messages"]);
    const search = page.getByRole("button", { name: "Search", exact: true }).first();
    await expect(search).toBeVisible();
    const sb = (await search.boundingBox())!;
    expect(sb.height).toBeGreaterThanOrEqual(43);
    expect(sb.x + sb.width).toBeLessThanOrEqual(width);
    const bell = (await page.getByRole("button", { name: "Notifications" }).boundingBox())!;
    expect(bell.x + bell.width).toBeLessThanOrEqual(width);
    const boxes = await page.locator(".hub-card").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width), Math.round(r.top)]; }));
    expect(new Set(boxes.map((b) => b[0])).size).toBe(1);
    expect(new Set(boxes.map((b) => b[1])).size).toBe(1);
    expect(boxes[0][2]).toBeLessThan(boxes[1][2]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // Labels in the bar are not smaller than 11px; the card action is at least 14px.
    expect(await page.locator(".mobile-nav button span").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(11);
    expect(await page.locator(".hub-card-go").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
    // Cards and the main control are real tap targets.
    for (const h of await page.locator(".hub-card, .hub-attn-toggle").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
    await clean(page);
    await context.close();
  }
});

test("RA-10 search in the top bar has named scopes and filters to them", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  const dialog = page.locator(".modal");
  await expect(dialog.getByRole("group", { name: "Search in" })).toBeVisible();
  expect((await dialog.locator(".search-scopes button").allInnerTexts())).toEqual(["All", "Colleagues", "Referrals", "Cover", "Consult", "Messages", "Library"]);
  await dialog.getByRole("searchbox", { name: "Search PsyAlliance" }).fill("a");
  await dialog.getByRole("button", { name: "Colleagues", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Colleagues", exact: true })).toHaveAttribute("aria-pressed", "true");
  const results = dialog.locator("#global-results .global-result");
  await expect(results.first()).toBeVisible();
  for (const text of await results.allInnerTexts()) expect(text).toMatch(/Colleague|Network \/ Search/);
  await expect(dialog.locator(".search-note")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Messages", exact: true }).click();
  // Release B searches every message once SQL 0124 is in place; before that the window still says older messages are not searched.
  await expect(dialog.locator(".search-note")).toContainText(/search every message in your conversations|Older messages are not searched here/);
  await dialog.getByRole("button", { name: "Library", exact: true }).click();
  for (const text of await dialog.locator("#global-results .global-result").allInnerTexts()) expect(text).toMatch(/Library|No results/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(0);
  await clean(page);
  await context.close();
});

// ---------------------------------------------------------------------------------------------------------------------
// Correctness items carried with Release A: F01 (one unread number), F02 (saving made visible), F04 (names on controls),
// F05/F06 (account pages share the five-item bar), D10 (a long member list stays bounded).

const send = (who: string, key: string, body: string) => rpc(who, `select public.message_send($1, $2, $3::uuid, null) as r`, [key, body, uuid()]);
const openDirect = async (who: string, person: string) => (await rpc(who, `select public.conversation_open('direct', null, null, $1::uuid) as r`, [person])) as { key: string };
async function dropConversations() {
  await q(`delete from conversations where id in (select conversation_id from conversation_participants where profile_id = $1)`, [bram.id]);
}

test("RA-11 one unread number: the workspace, the account pages and the phone bar agree, and notifications stay separate", async ({ browser, baseURL }) => {
  await dropConversations();
  const a = await openDirect(avery.id, bram.id), c = await openDirect(cass.id, bram.id);
  for (const t of ["one", "two"]) await send(avery.id, a.key, `RA unread ${t}`);
  for (const t of ["one", "two", "three"]) await send(cass.id, c.key, `RA unread ${t}`);
  expect((await rpc(bram.id, `select public.my_unread_message_count() as r`))).toBe(5);

  const { page, context } = await openAs(browser, "fenn", baseURL!);
  await expect(page.locator('.sidebar .nav-item[data-action="nav:messages"] .nav-count')).toHaveText("5");
  await page.goto("/dashboard/profile");
  await expect(page.locator('.sidebar a.nav-item[href="/dashboard/messages"] .nav-count')).toHaveText("5");
  await clean(page);
  await context.close();

  const phone = await openAs(browser, "fenn", baseURL!, "/dashboard/settings", true, 390);
  await expect(phone.page.locator('.mobile-nav a[href="/dashboard/messages"] .mobile-badge')).toHaveText("5");
  await phone.page.goto("/dashboard");
  await expect(phone.page.locator('.mobile-nav button[data-action="nav:messages"] .mobile-badge')).toHaveText("5");
  await clean(phone.page);
  await phone.context.close();

  // Reading one conversation lowers the number everywhere it is shown.
  await rpc(bram.id, `select public.conversation_read($1) as r`, [a.key]);
  expect((await rpc(bram.id, `select public.my_unread_message_count() as r`))).toBe(3);
  await dropConversations();
});

test("RA-12 account pages: exactly five fully visible destinations at 320px, the same order, a named Search, no More", async ({ browser, baseURL }) => {
  for (const path of ["/dashboard/profile", "/dashboard/settings", "/dashboard/documents?tab=mine"]) {
    const { page, context } = await openAs(browser, "fenn", baseURL!, path, true, 320);
    const links = page.locator(".mobile-nav a");
    await expect(links).toHaveCount(5);
    expect((await links.allInnerTexts()).map((t) => t.replace(/\d+$/, "").trim())).toEqual(["The Hub", "Referrals", "Cover", "Consult", "Messages"]);
    await expect(page.locator(".mobile-nav").getByText("More", { exact: true })).toHaveCount(0);
    const boxes = await links.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height }; }));
    for (const b of boxes) { expect(b.l).toBeGreaterThanOrEqual(0); expect(b.r).toBeLessThanOrEqual(320.5); expect(b.h).toBeGreaterThanOrEqual(44); }
    const fonts = await links.locator("span").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    for (const f of fonts) expect(f).toBeGreaterThanOrEqual(11);
    const search = page.getByRole("link", { name: "Search", exact: true }).first();
    await expect(search).toBeVisible();
    const sb = (await search.boundingBox())!; expect(sb.x + sb.width).toBeLessThanOrEqual(320); expect(sb.height).toBeGreaterThanOrEqual(43);
    const bell = (await page.locator('[data-bell]').boundingBox())!; expect(bell.x + bell.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await clean(page);
    await context.close();
  }
});

test("RA-13 saving is visible: Saving, Saved, then a plain failure message that recovers with the newest text", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "fenn", baseURL!);
  await page.locator(".hub-card", { hasText: "Plan cover" }).click();
  const name = page.locator("#cover-name");
  await expect(name).toBeVisible();
  const note = page.locator(".save-note");
  await expect(note).toContainText("Saves as you go");
  await name.fill("RA first title");
  await expect(note).toContainText("Saved");
  await expect.poll(async () => (await q(`select count(*)::int c from workspace_drafts where profile_id = $1 and data::text like '%RA first title%'`, [bram.id]))[0].c).toBe(1);

  await context.setOffline(true);
  await name.fill("RA newest title");
  await expect(note).toContainText("Could not save your changes");
  await name.fill("RA newest title, edited again");
  await context.setOffline(false);
  await note.getByRole("button", { name: "Try again" }).click();
  await expect(note).toContainText("Saved");
  await expect.poll(async () => (await q(`select count(*)::int c from workspace_drafts where profile_id = $1 and data::text like '%RA newest title, edited again%'`, [bram.id]))[0].c).toBe(1);
  expect((await q(`select count(*)::int c from workspace_drafts where profile_id = $1 and data::text like '%RA first title%'`, [bram.id]))[0].c).toBe(0);
  await page.keyboard.press("Escape");
  await clean(page);
  await context.close();
});

test("RA-14 collapsed navigation and person choices have names; a very long colleague list stays bounded and searchable", async ({ browser, baseURL }) => {
  // Tablet width collapses the sidebar to icons: every button must still say where it goes.
  const tablet = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await signInAs(tablet, "fenn", baseURL!);
  const tp = await tablet.newPage();
  await tp.goto("/dashboard");
  await expect(tp.locator(".sidebar .nav-item").first()).toBeAttached();
  const spanShown = await tp.locator(".sidebar .nav-item:not(.nav-mobile-only) > span").first().evaluate((e) => getComputedStyle(e).display);
  expect(spanShown).toBe("none");
  for (const name of ["The Hub", "Referrals", "Cover", "Consult", "Network / Search", "Messages", "Library"]) await expect(tp.getByRole("button", { name, exact: true })).toBeAttached();
  await expect(tp.getByRole("button", { name: /^Your profile: / })).toBeAttached();
  await tablet.close();

  // 1,200 fictional members.
  await q(`delete from auth.users where email like 'ra1200-%@mail.staging.example'`);
  const seed = await db().connect();
  try {
  await seed.query("begin");
  await seed.query("set local session_replication_role = replica");
  await seed.query(`insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
           select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'ra1200-' || g || '@mail.staging.example', now(),
                  jsonb_build_object('full_name', 'Zed Colleague ' || lpad(g::text, 4, '0')), now(), now() from generate_series(1, 1200) g`);
  await seed.query(`insert into profiles (id, full_name, credential_prefix, qualification_level, primary_state, primary_practice_city, states_qualified, verification_status, verified_at,
             account_kind, account_status, referral_availability, coverage_availability, consultation_availability, availability_confirmed_at, first_availability_confirmed_at, approx_spaces, contact_email)
           select u.id, u.raw_user_meta_data->>'full_name', 'Dr', 'PhD', 'NY', 'Albany', array['NY'], 'verified', now(), 'clinician', 'active', 'yes', 'yes', 'yes', now(), now(), 3, u.email
             from auth.users u where u.email like 'ra1200-%@mail.staging.example'`);
  await seed.query(`insert into licenses (profile_id, state, license_number, license_type, expiration_date, status, notes, reviewed_at)
           select p.id, 'NY', 'STG-RA-' || substr(p.id::text, 1, 8), 'Psychologist', current_date + 400, 'active', 'Fictional', now() from profiles p where p.contact_email like 'ra1200-%@mail.staging.example'`);
  await seed.query("commit");
  } catch (e) { await seed.query("rollback"); throw e; } finally { seed.release(); }
  try {
    const { page, context } = await openAs(browser, "fenn", baseURL!);
    await page.locator(".hub-card", { hasText: "Ask a question" }).click();
    await expect(page.locator("#peer-title")).toBeVisible();
    await page.getByLabel(/Choose a colleague|One colleague/i).first().check({ timeout: 3000 }).catch(() => {});
    const radio = page.locator('.audience-grid input[name="audience"]');
    const values = await radio.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    const pick = values.includes("one") ? "one" : values.includes("few") ? "few" : values[0];
    await page.locator(`.audience-grid input[name="audience"][value="${pick}"]`).check({ force: true });
    const rows = page.locator(".audience-person-list .recipient-choice");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThanOrEqual(45);
    await expect(page.locator(".audience-person-list")).toContainText("Search by name");
    // Every row's control names the person.
    const names = await page.locator('.audience-person-list input[name="recipients"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || ""));
    expect(names.every((n) => n.length > 3)).toBe(true);
    await page.locator("#audience-search").fill("Zed Colleague 0777");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Zed Colleague 0777");
    await rows.first().locator("input").check();
    await page.locator("#audience-search").fill("");
    await expect(page.locator('.audience-person-list input[name="recipients"]:checked')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await clean(page);
    await context.close();
  } finally {
    await q(`delete from auth.users where email like 'ra1200-%@mail.staging.example'`);
  }
});

test("RA-15 PSYPACT (F03): the screen and the server agree on who can take a client in another state", async ({ browser, baseURL }) => {
  const cases = [
    { label: "home NJ, PhD, taking part, virtual into PA", home: "NJ", cred: "PhD", part: true, state: "PA", setting: "virtual", ok: true },
    { label: "same, either setting", home: "NJ", cred: "PhD", part: true, state: "PA", setting: "either", ok: true },
    { label: "same, in person only", home: "NJ", cred: "PhD", part: true, state: "PA", setting: "in_person", ok: false },
    { label: "same, into a state that is not a member (CA)", home: "NJ", cred: "PhD", part: true, state: "CA", setting: "virtual", ok: false },
    { label: "an MD", home: "NJ", cred: "MD", part: true, state: "PA", setting: "virtual", ok: false },
    { label: "a DO", home: "NJ", cred: "DO", part: true, state: "PA", setting: "virtual", ok: false },
    { label: "not taking part", home: "NJ", cred: "PhD", part: false, state: "PA", setting: "virtual", ok: false },
  ];
  await q(`delete from licenses where profile_id = $1 and state = 'NJ'`, [bram.id]);
  await q(`insert into licenses (profile_id, state, license_number, license_type, status, reviewed_at) values ($1, 'NJ', 'FIC-NJ-RA', 'Psychologist', 'active', now())`, [bram.id]);
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/referrals");
  try {
    for (const c of cases) {
      await q(`update profiles set primary_state = $2, psypact_participating = $3, qualification_level = $4::qualification_level where id = $1`, [bram.id, c.home, c.part, c.cred]);
      await q(`delete from workspace_drafts where profile_id = $1`, [avery.id]);
      const server = (await one(`select private.licence_route($1::uuid, $2, $3) is not null as ok`, [bram.id, c.state, c.setting])).ok as boolean;
      await page.goto("/dashboard/referrals");
      await page.locator('[data-action="referral-start"]').first().click();
      await expect(page.locator("#referral-need-form")).toBeVisible();
      const form = page.locator("#referral-need-form");
      await form.locator('select[name="focus"]').selectOption({ label: "Anxiety/Panic Disorders" });
      await form.locator('select[name="state"]').selectOption(c.state);
      await form.locator('select[name="setting"]').selectOption(c.setting);
      await page.locator('.modal-footer button[type="submit"]').click();
      // The next step is the colleague list, which can be empty when nobody can take the client.
      await expect(page.locator("#referral-need-form")).toHaveCount(0);
      await expect(page.locator(".modal-body")).toBeVisible();
      const box = page.locator(`input[data-match="referral"][value="${bram.id}"]`);
      const screen = (await box.count()) === 1 && (await box.isEnabled());
      expect(server, `server: ${c.label}`).toBe(c.ok);
      expect(screen, `screen: ${c.label}`).toBe(c.ok);
      await page.keyboard.press("Escape");
    }
  } finally {
    await q(`update profiles set primary_state = 'NY', psypact_participating = false, qualification_level = 'PhD' where id = $1`, [bram.id]);
    await q(`delete from licenses where profile_id = $1 and state = 'NJ'`, [bram.id]);
    await q(`delete from workspace_drafts where profile_id = $1`, [avery.id]);
  }
  await clean(page);
  await context.close();
});
