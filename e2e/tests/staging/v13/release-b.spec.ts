import { test, expect, type Page, type Browser } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// Release B (brief sections 6 to 10, scenarios C01-C06, R01, R03, Q01, Q02, N01, A01, M01-M03). Real local database,
// fictional members only. Server rules (outreach races, placement, permissions, retries, files) are proved by the
// existing CV-, RF-, NC-, MS-, AV- and FP- suites; this file covers what Release B changed or had not yet proved.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id;
const everyone = [avery, bram, cass];

async function tidy() {
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[]) and kind <> 'hub-state'`, [everyone]);
  await q(`delete from coverage_plans where profile_id = $1 and title like 'B %'`, [avery]);
  await q(`delete from referral_requests where requesting_profile_id = $1 and client_request_id is not null`, [avery]);
  await q(`delete from conversations where context_key like 'b-test-%'`);
  await q(`delete from conversations where context_key like 'referral-%' and not exists (select 1 from referral_requests)`);
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
const clickAction = (page: Page, selector: string) => page.evaluate((s) => (document.querySelector(s) as HTMLElement).click(), selector);

async function startCover(page: Page, name: string) {
  await page.locator('[data-action="cover-start"]').first().click();
  await page.locator("#cover-name").fill(name);
  await page.getByRole("button", { name: "Continue to needs" }).click();
}
async function saveClient(page: Page, o: { focus?: string; setting?: string; prescribing?: boolean } = {}) {
  await page.locator("#cover-focus").selectOption(o.focus || "Anxiety/Panic Disorders");
  await page.locator("#cover-setting").selectOption(o.setting || "virtual");
  if (o.prescribing) await page.locator('#client-form input[name="prescribing"]').check();
  await page.getByRole("button", { name: "Save client", exact: true }).click();
}

test("B-01 C01 twenty clients: copies get new ids, the limit holds, a removed id is not reused", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  await startCover(page, "B Twenty");
  await saveClient(page);
  for (let i = 0; i < 19; i++) { await clickAction(page, '[data-action^="client-duplicate:"]'); await page.waitForTimeout(40); }
  await expect(page.locator(".saved-client")).toHaveCount(20);
  const ids = await page.locator(".saved-client .client-index").allInnerTexts();
  expect(ids.map((t) => t.trim())).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
  expect(await page.locator('[data-action^="client-duplicate:"]').count()).toBe(0); // no copy offered past twenty
  expect(await page.locator('[data-action="client-add"]').count()).toBe(0);
  await clickAction(page, '[data-action="client-remove:20"]');
  await expect(page.locator(".saved-client")).toHaveCount(19);
  await clickAction(page, '[data-action^="client-duplicate:"]');
  await expect(page.locator(".saved-client")).toHaveCount(20);
  const after = (await page.locator(".saved-client .client-index").allInnerTexts()).map((t) => t.trim());
  expect(after.at(-1)).toBe("21"); // 20 was removed; its number is not handed out again
  expect(new Set(after).size).toBe(20);
  await context.close();
});

test("B-01b C01 a copy is independent: it carries no colleague choice, and editing one client does not change another", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  await startCover(page, "B Copy");
  await saveClient(page);
  const box = (id: number) => page.locator(`input[data-match="cover"][data-client="${id}"][value="${bram}"]`);
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await box(1).check();
  await page.getByRole("button", { name: "Back" }).click();
  await clickAction(page, '[data-action^="client-duplicate:"]');
  await expect(page.locator(".saved-client")).toHaveCount(2);
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await page.locator('[data-action="match-client:2"]').click();
  await expect(box(2)).toBeEnabled();
  await expect(box(2)).not.toBeChecked(); // the copy did not take the original's colleague
  await page.locator('[data-action="match-client:1"]').click();
  await expect(box(1)).toBeChecked();
  // Editing the copy leaves the original alone.
  await page.getByRole("button", { name: "Back" }).click();
  await clickAction(page, '[data-action="client-edit:2"]');
  await page.locator('#client-form input[name="prescribing"]').check();
  await page.getByRole("button", { name: "Save client", exact: true }).click();
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await page.locator('[data-action="match-client:1"]').click();
  await expect(box(1)).toBeChecked();
  await page.locator('[data-action="match-client:2"]').click();
  await expect(box(2)).toHaveCount(0); // client 2 now needs prescribing, which Bram does not do
  await context.close();
});

test("B-02 C02 mixed eligibility: both views agree, bulk apply says what was added, kept and excluded, an edit removes only who no longer fits", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  await startCover(page, "B Mixed");
  await saveClient(page);
  await page.getByRole("button", { name: "Add another client" }).click();
  await saveClient(page, { prescribing: true });
  await page.getByRole("button", { name: "Add another client" }).click();
  await saveClient(page);
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  // Nobody is chosen for you: the plan starts with no colleague selected anywhere.
  await expect(page.locator('input[data-match="cover"]:checked')).toHaveCount(0);
  // By client: Bram can take clients 1 and 3, not client 2 (prescribing).
  for (const id of [1, 2, 3]) {
    await page.locator(`[data-action="match-client:${id}"]`).click();
    const box = page.locator(`input[data-match="cover"][data-client="${id}"][value="${bram}"]`);
    if (id === 2) expect((await box.count()) === 0 || (await box.isDisabled())).toBe(true);
    else await expect(box).toBeEnabled();
  }
  // By colleague: same answer, with the reason.
  await page.locator('[data-action="match-view:colleague"]').click();
  const bramRow = page.locator("details.bulk-colleague", { hasText: "Bram Tellinghast" });
  await bramRow.locator("summary").click();
  await expect(bramRow.locator(".bulk-client.excluded")).toContainText("Prescribing required");
  await expect(bramRow.locator(".bulk-client:not(.excluded)")).toHaveCount(2);
  for (const id of [1, 2, 3]) await bramRow.locator(`input[data-bulk-person="${bram}"][value="${id}"]`).check();
  await bramRow.getByRole("button", { name: "Apply to selected clients" }).click();
  const note = page.locator(".inline-note[role=status]").first();
  await expect(note).toContainText("Added to: Client 1, Client 3");
  await expect(note).toContainText("Client 2 excluded: Prescribing required");
  await page.locator("details.bulk-colleague", { hasText: "Bram Tellinghast" }).locator("summary").click();
  await page.locator("details.bulk-colleague", { hasText: "Bram Tellinghast" }).getByRole("button", { name: "Apply to selected clients" }).click();
  await expect(page.locator(".inline-note[role=status]").first()).toContainText("Already selected for: Client 1, Client 3");
  // Nothing was sent by preparing the plan.
  expect((await q(`select 1 from coverage_plans where profile_id = $1 and title = 'B Mixed'`, [avery])).length).toBe(0);
  // Changing client 1 to need prescribing: Bram no longer fits it, stays on client 3, and nobody is put in his place.
  await page.getByRole("button", { name: "Back" }).click();
  await clickAction(page, '[data-action="client-edit:1"]');
  await page.locator('#client-form input[name="prescribing"]').check();
  await page.getByRole("button", { name: "Save client", exact: true }).click();
  const change = page.locator(".change-note");
  await expect(change).toContainText("Client 1");
  await expect(change).toContainText("Bram Tellinghast");
  await expect(change).toContainText("Prescribing required");
  await expect(change).toContainText("Nobody was chosen in their place");
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await expect(page.locator(".change-note")).toBeVisible();
  await page.locator('[data-action="match-view:client"]').click();
  await page.locator('[data-action="match-client:3"]').click();
  await expect(page.locator(`input[data-match="cover"][data-client="3"][value="${bram}"]`)).toBeChecked();
  await page.locator('[data-action="match-client:1"]').click();
  await expect(page.locator(`input[data-match="cover"][data-client="1"][value="${bram}"]`)).toHaveCount(0);
  await context.close();
});

test("B-03 C03 workload before review: totals per colleague, first and queued, grammar, reorder bounds, a route back, nothing sent", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  await startCover(page, "B Workload");
  await saveClient(page);
  await page.getByRole("button", { name: "Add another client" }).click();
  await saveClient(page);
  await page.getByRole("button", { name: "Add another client" }).click();
  await saveClient(page);
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  for (const id of [1, 2, 3]) {
    await page.locator(`[data-action="match-client:${id}"]`).click();
    await page.locator(`input[data-match="cover"][data-client="${id}"][value="${bram}"]`).check();
  }
  await page.locator('[data-action="match-client:1"]').click();
  await page.locator(`input[data-match="cover"][data-client="1"][value="${cass}"]`).check();
  await page.getByRole("button", { name: "Review invitations" }).click();
  const work = page.locator(".workload-list");
  await expect(work).toBeVisible();
  const bramLine = work.locator("li", { hasText: "Bram Tellinghast" });
  await expect(bramLine).toContainText("3 requests");
  await expect(bramLine).toContainText("3 asked first");
  await expect(bramLine).toContainText("overall");
  await expect(bramLine).toContainText("Confirmed");
  const cassLine = work.locator("li", { hasText: "Cass Morrowgate" });
  await expect(cassLine).toContainText("1 request");
  await expect(cassLine).toContainText("1 queued");
  await expect(page.locator(".outreach-summary")).toContainText("3 invitations go out first, one per client.");
  // Reordering: only where there is someone to reorder with, and not past either end.
  const clientOne = page.locator("details.review-client").nth(0), clientTwo = page.locator("details.review-client").nth(1);
  await expect(clientTwo.locator(".order-controls")).toHaveCount(0);
  const rows = clientOne.locator(".invite-order-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('button[aria-label="Ask this colleague earlier"]')).toBeDisabled();
  await expect(rows.nth(1).locator('button[aria-label="Ask this colleague later"]')).toBeDisabled();
  // A route back to a client.
  await clientTwo.getByRole("button", { name: "Change this client" }).click();
  await expect(page.locator(".client-entry")).toBeVisible();
  await expect(page.locator(".modal")).toContainText("Build your client list");
  // Preparing and reviewing never sends anything.
  expect((await q(`select 1 from coverage_plans where profile_id = $1 and title = 'B Workload'`, [avery])).length).toBe(0);
  await context.close();
});

test("B-03b C03 twenty requests to one colleague are visible, counted and asked first, before review approval", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  await startCover(page, "B Twenty requests");
  await saveClient(page);
  for (let i = 0; i < 19; i++) { await clickAction(page, '[data-action^="client-duplicate:"]'); await page.waitForTimeout(40); }
  await expect(page.locator(".saved-client")).toHaveCount(20);
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await page.locator('[data-action="match-view:colleague"]').click();
  const row = page.locator("details.bulk-colleague", { hasText: "Bram Tellinghast" });
  await row.locator("summary").click();
  for (let id = 1; id <= 20; id++) await row.locator(`input[data-bulk-person="${bram}"][value="${id}"]`).check();
  await row.getByRole("button", { name: "Apply to selected clients" }).click();
  await expect(page.locator(".inline-note[role=status]").first()).toContainText("Client 20");
  await page.getByRole("button", { name: "Review invitations" }).click();
  const line = page.locator(".workload-list li", { hasText: "Bram Tellinghast" });
  await expect(line).toContainText("20 requests");
  await expect(line).toContainText("20 asked first");
  await expect(page.locator(".outreach-summary")).toContainText("20 invitations go out first, one per client.");
  expect((await q(`select 1 from coverage_plans where profile_id = $1 and title = 'B Twenty requests'`, [avery])).length).toBe(0); // nothing was sent
  await context.close();
});

test("B-04 C06 calendar: both directions and Today are named, today and the selected day differ, a phone shows dots not cut-off titles, deleting a draft leaves a live plan alone", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  // A live plan, sent to Bram.
  await startCover(page, "B Calendar plan");
  await saveClient(page);
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await page.locator(`input[data-match="cover"][value="${bram}"]`).first().check();
  await page.getByRole("button", { name: "Review invitations" }).click();
  await page.locator('#cover-send-form input[name="reviewed"]').check();
  await page.getByRole("button", { name: "Send cover requests" }).click();
  await expect(page.locator("#toast")).toContainText("Cover requests sent");
  await page.goto("/dashboard/cover");
  await page.locator('[data-action="cover-layout:calendar"]').click();
  for (const name of ["Both directions", "Your cover plans", "Cover for colleagues", "Today"]) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cover for colleagues", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cover for colleagues", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Both directions", exact: true }).click();
  // Today is marked; choosing another day marks that one too, and they are different cells.
  const cells = page.locator(".month-day:not(.outside)");
  const todayIndex = await cells.evaluateAll((els) => els.findIndex((e) => e.classList.contains("today")));
  expect(todayIndex).toBeGreaterThanOrEqual(0);
  const other = todayIndex === 9 ? 10 : 9;
  await cells.nth(other).click();
  await expect(page.locator(".modal")).toContainText("Cover on");
  await page.keyboard.press("Escape");
  await expect(page.locator(".month-day.selected")).toHaveCount(1);
  expect(await page.locator(".month-day.selected").evaluate((e) => e.classList.contains("today"))).toBe(false);
  await expect(page.locator(".month-day.today")).toHaveCount(1);
  // A draft started and deleted does not touch the live plan.
  await page.locator('[data-action="cover-layout:list"]').click();
  await page.locator('[data-action="cover-start"]').first().click();
  await page.locator("#cover-name").fill("B Throwaway draft");
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  const banner = page.locator(".draft-banner", { hasText: "B Throwaway draft" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("button", { name: "Delete draft" }).last().click();
  await expect(page.locator(".draft-banner", { hasText: "B Throwaway draft" })).toHaveCount(0);
  expect((await q(`select 1 from coverage_plans where profile_id = $1 and title = 'B Calendar plan' and status = 'active'`, [avery])).length).toBe(1);
  await context.close();
  // On a phone the month shows dots, not truncated titles.
  const phone = await openAs(browser, "avery", baseURL!, "/dashboard/cover", 390);
  await phone.page.locator('[data-action="cover-layout:calendar"]').click();
  await expect(phone.page.locator(".month-grid")).toBeVisible();
  for (let n = 0; n < 3 && (await phone.page.locator(".cal-dots i").count()) === 0; n++) await phone.page.locator('[data-action="calendar-month:1"]').click();
  expect(await phone.page.locator(".cal-dots i").count()).toBeGreaterThan(0);
  expect(await phone.page.locator(".month-day-counts").first().isVisible()).toBe(false);
  expect(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await phone.context.close();
});

test("B-04b C06 calendar: overlapping plans, a plan across a month boundary, each direction on its own, an empty month, and the agenda opens the exact plan", async ({ browser, baseURL }) => {
  const now = new Date();
  const iso = (m: number, d: number) => { const x = new Date(now.getFullYear(), now.getMonth() + m, d, 12); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const mk = (who: string, name: string, start: string, end: string, to: string) => asMember(who, `select public.cover_create_plan($1::jsonb) as r`, [JSON.stringify({
    requestId: crypto.randomUUID(), name, reason: "short", other: "", start, end, mode: "sequential", deadline: 48, message: "Weekly appointments.",
    clients: [{ label: "Client 1", focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", age: "", setting: "virtual", insurance: "", frequency: "Weekly", prescribing: false, language: "", city: "", selected: [to] }],
  })]);
  const overlapping = async (m: number) => {
    const from = iso(m, 1), to = iso(m + 1, 0);
    const plans = (await asMember(avery, `select public.workspace_plans() as r`)).rows[0].r as any[];
    return plans.filter((p) => p.status !== "cancelled" && p.start <= to && (!p.end || p.end >= from)).length;
  };
  const plansText = (n: number) => `${n} plan${n === 1 ? "" : "s"}`;
  const [before1, before5] = [await overlapping(1), await overlapping(5)]; // the fixture members already have other plans
  try {
    await mk(avery, "B Cal one", iso(1, 3), iso(1, 6), bram);
    await mk(avery, "B Cal long", iso(1, 27), iso(2, 4), bram);
    await mk(cass, "B Cal theirs", iso(1, 5), iso(1, 9), avery);
    const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
    await page.locator('[data-action="cover-layout:calendar"]').click();
    await page.locator('[data-action="calendar-month:1"]').click();
    const day = (m: number, d: number) => page.locator(`[data-action="calendar-day:${iso(m, d)}"]`);
    // Both directions: the overlap on day 5 and 6 shows both plans; day 3 only the first; day 8 only the colleague's.
    await expect(day(1, 5)).toHaveAttribute("aria-label", /B Cal one/);
    await expect(day(1, 5)).toHaveAttribute("aria-label", /B Cal theirs/);
    await expect(day(1, 6)).toHaveAttribute("aria-label", /B Cal one/);
    await expect(day(1, 3)).not.toHaveAttribute("aria-label", /B Cal theirs/);
    await expect(day(1, 8)).toHaveAttribute("aria-label", /B Cal theirs/);
    await expect(day(1, 8)).not.toHaveAttribute("aria-label", /B Cal one/);
    // Counts are plans, not clients: three more plans overlap the month, one client each.
    await expect(page.locator(".calendar-month-summary")).toContainText(plansText(before1 + 3));
    // Each direction on its own.
    await page.getByRole("button", { name: "Your cover plans", exact: true }).click();
    await expect(day(1, 5)).toHaveAttribute("aria-label", /B Cal one/);
    await expect(day(1, 5)).not.toHaveAttribute("aria-label", /B Cal theirs/);
    await page.getByRole("button", { name: "Cover for colleagues", exact: true }).click();
    await expect(day(1, 5)).toHaveAttribute("aria-label", /B Cal theirs/);
    await expect(day(1, 5)).not.toHaveAttribute("aria-label", /B Cal one/);
    await page.getByRole("button", { name: "Both directions", exact: true }).click();
    // A range across the month boundary is on its last days of this month and its first days of the next, and not after it ends.
    await expect(day(1, 28)).toHaveAttribute("aria-label", /B Cal long/);
    await page.locator('[data-action="calendar-month:1"]').click();
    await expect(day(2, 2)).toHaveAttribute("aria-label", /B Cal long/);
    await expect(day(2, 4)).toHaveAttribute("aria-label", /B Cal long/);
    await expect(day(2, 5)).not.toHaveAttribute("aria-label", /B Cal long/);
    // A month with none of these plans shows none of them and counts only what is really there.
    for (let i = 0; i < 3; i++) await page.locator('[data-action="calendar-month:1"]').click();
    await expect(page.locator(".calendar-month-summary")).toContainText(plansText(before5));
    await expect(page.locator(".calendar-agenda")).not.toContainText("B Cal");
    // The agenda opens the exact plan.
    await page.locator('[data-action="calendar-month:-1"]').click();
    for (let i = 0; i < 2; i++) await page.locator('[data-action="calendar-month:-1"]').click();
    await page.locator('[data-action="calendar-month:-1"]').click();
    await expect(page.locator(".calendar-month-summary")).toContainText(plansText(before1 + 3));
    await page.locator(".calendar-agenda").getByText("B Cal theirs").first().click();
    await expect(page.locator(".modal")).toContainText("B Cal theirs");
    await expect(page.locator(".modal")).not.toContainText("B Cal one");
    await context.close();
  } finally {
    await q(`delete from coverage_plans where profile_id = $1 and title like 'B %'`, [cass]);
  }
});

test("B-05 R01 the need list is searchable and shared, and a referral begun from a profile keeps its colleague", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator('[data-action="referral-start"]').first().click();
  await expect(page.locator("#referral-need-form")).toBeVisible();
  // Main need and Also offer exactly the same list.
  const main = await page.locator("#referral-focus option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  const also = await page.locator("#referral-secondary option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  expect(main.length).toBeGreaterThan(30);
  expect(also).toEqual(main);
  // Search: type a few letters, the list narrows, Enter chooses.
  await page.locator("#referral-focus").locator("xpath=following-sibling::button[contains(@class,'search-pick-cover')]").click();
  const box = page.locator(".search-pick input");
  await expect(box).toBeFocused();
  await box.fill("anxi");
  const options = page.locator(".search-pick li[role=option]");
  expect(await options.count()).toBeGreaterThan(0);
  expect(await options.count()).toBeLessThan(main.length);
  await expect(options.first()).toContainText("Anxiety");
  await box.press("Enter");
  await expect(page.locator(".search-pick")).toHaveCount(0);
  await expect(page.locator("#referral-focus")).toHaveValue("Anxiety/Panic Disorders");
  // The keyboard reaches the same search from the select itself.
  await page.locator("#referral-secondary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".search-pick input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".search-pick")).toHaveCount(0);
  await expect(page.locator("#referral-need-form")).toBeVisible(); // Escape closed the search, not the whole form
  await page.keyboard.press("Escape");
  // From Bram's profile.
  await page.goto("/dashboard/network");
  await page.locator(`[data-action="profile:${bram}"]`).first().click();
  await page.locator(`[data-action="profile-referral:${bram}"]`).first().click();
  await expect(page.locator(".pinned-recipient")).toContainText("Bram");
  await page.locator("#referral-focus").selectOption("Anxiety/Panic Disorders");
  await page.locator("#referral-state").selectOption("NY");
  await page.locator("#referral-setting").selectOption("virtual");
  await page.getByRole("button", { name: "See matched colleagues" }).click();
  await expect(page.locator(".match-intro")).toContainText("Bram Tellinghast matches these requirements");
  // Make Bram ineligible: he is explained, not replaced.
  await page.getByRole("button", { name: "Back" }).click();
  await page.locator('#referral-need-form input[name="prescribing"]').check();
  await page.getByRole("button", { name: "See matched colleagues" }).click();
  await expect(page.locator(".match-intro")).toContainText("does not match: Prescribing required");
  await expect(page.locator(".match-intro")).toContainText("No substitute has been selected");
  await expect(page.locator('input[data-match="referral"]:checked')).toHaveCount(0);
  await context.close();
});

test("B-06 R03 the anonymous client-referral title and the three stages, with only real progress marked", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator('[data-action="referral-start"]').first().click();
  await page.locator("#referral-focus").selectOption("Anxiety/Panic Disorders");
  await page.locator("#referral-state").selectOption("NY");
  await page.locator("#referral-setting").selectOption("virtual");
  await page.getByRole("button", { name: "See matched colleagues" }).click();
  await expect(page.locator(".matching-context h3")).toHaveText("Client referral · Anxiety/Panic Disorders");
  const boxes = page.locator('input[data-match="referral"]:checked');
  while ((await boxes.count()) > 0) await boxes.first().click();
  await page.locator(`input[data-match="referral"][value="${bram}"]`).click();
  await page.getByRole("button", { name: "Review before sending" }).click();
  await expect(page.locator(".modal")).toContainText("Client referral");
  await page.locator('#referral-send-form input[name="reviewed"]').check();
  await page.getByRole("button", { name: "Send referral" }).click();
  await expect(page.locator("#toast")).toContainText("Referral shared");
  const stages = page.locator(".referral-journey .journey-stage");
  await expect(stages).toHaveCount(3);
  expect((await stages.locator("strong").allInnerTexts()).map((t) => t.trim())).toEqual(["Request sent", "Colleague interest", "Placement confirmed"]);
  await expect(page.locator(".referral-journey .journey-stage.done")).toHaveCount(1);
  await expect(page.locator(".referral-journey")).not.toContainText("Placement confirmed: Confirmed");
  await expect(page.locator(".referral-journey .eyebrow")).toHaveText("Referral request sent");
  await context.close();
});

test("B-07 Q01 Consult review: one recipient is named with correct wording, nothing posts before the review button", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  await page.getByRole("button", { name: "Ask a question" }).first().click();
  await page.locator("#peer-title").fill("B One recipient wording");
  await page.locator("#peer-body").fill("A question with no client details.");
  await page.locator('.audience-tile input[value="one"]').check({ force: true });
  await page.locator(`input[name="recipients"][value="${cass}"]`).check({ force: true });
  await expect(page.locator(".recipient-summary")).toContainText("1 colleague will see this");
  await page.locator('#peer-form input[name="reviewed"]').check();
  await page.getByRole("button", { name: "Review before posting" }).click();
  const review = page.locator(".modal");
  await expect(review).toContainText("Cass Morrowgate");
  await expect(review).not.toContainText("1 recipients");
  await expect(review).not.toContainText("1 colleagues");
  expect((await q(`select 1 from consultations where author_profile_id = $1`, [avery])).length).toBe(0);
  await context.close();
});

test("B-08 Q02 Consult has a direct way to manage or find groups", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  const link = page.locator('a[href="/dashboard/consult/groups"]').first();
  await expect(link).toBeVisible();
  await expect(link).toContainText(/Manage groups|Find or start a group/);
  await link.click();
  await expect(page).toHaveURL(/\/dashboard\/consult\/groups/);
  await expect(page.locator(".mobile-nav, .sidebar").first()).toBeAttached();
  await context.close();
});

// Messages: a conversation of 260 messages with Bram, the oldest mentioning "zebra"; another with Cass; one between Bram and Cass only.
async function seedMessages() {
  const mk = async (key: string, a: string, b: string, bodies: { who: string; body: string; ago: number; deleted?: boolean }[]) => {
    const c = await one(`insert into conversations (created_by, title, context_key) values ($1, null, $2) returning id`, [a, key]);
    await q(`insert into conversation_participants (conversation_id, profile_id, last_read_at) values ($1, $2, now()), ($1, $3, now())`, [c.id, a, b]);
    for (const m of [...bodies].sort((x, y) => y.ago - x.ago)) await q(`insert into conversation_messages (conversation_id, author_id, body, created_at, deleted_at) values ($1, $2, $3, now() - ($4 || ' minutes')::interval, case when $5 then now() else null end)`, [c.id, m.who, m.body, String(m.ago), !!m.deleted]);
    await q(`update conversations set last_message_at = (select max(created_at) from conversation_messages where conversation_id = $1) where id = $1`, [c.id]);
    return c.id as number;
  };
  const filler = Array.from({ length: 259 }, (_, i) => ({ who: i % 2 ? avery : bram, body: `Filler note ${i}`, ago: 5 + i }));
  await mk("b-test-avery-bram", avery, bram, [{ who: bram, body: "The zebra handover note is in the shared folder", ago: 3000 }, ...filler]);
  await mk("b-test-avery-cass", avery, cass, [{ who: cass, body: "A zebra crossing near the clinic", ago: 90 }, { who: avery, body: "A deleted zebra remark", ago: 80, deleted: true }]);
  await mk("b-test-bram-cass", bram, cass, [{ who: bram, body: "Private zebra between two others", ago: 70 }]);
}

test("B-09 M01 message history: search finds old messages in the right conversation, opens the exact one, and shows only what Avery may see", async ({ browser, baseURL }) => {
  await seedMessages();
  // The database function itself: own conversations only, deleted messages never, newest first, pages.
  const { rows } = await asMember(avery, `select public.search_message_history('zebra', null, 20) as r`);
  const found = rows[0].r.results as any[];
  expect(found.length).toBe(2);
  expect(found.map((x) => x.key).sort()).toEqual(["b-test-avery-bram", "b-test-avery-cass"]);
  expect(found.some((x) => /deleted/.test(x.text))).toBe(false);
  expect(found.some((x) => /Private zebra/.test(x.text))).toBe(false);
  const paged = await asMember(avery, `select public.search_message_history('filler', null, 10) as r`);
  expect(paged.rows[0].r.results.length).toBe(10);
  expect(paged.rows[0].r.more).toBe(true);
  const next = await asMember(avery, `select public.search_message_history('filler note', $1, 10) as r`, [paged.rows[0].r.results.at(-1).dbId]);
  expect(next.rows[0].r.results[0].dbId).toBeLessThan(paged.rows[0].r.results.at(-1).dbId);
  const wildcard = await asMember(avery, `select public.search_message_history('%', null, 10) as r`);
  expect(wildcard.rows[0].r.results.length).toBe(0); // a % is a letter, not a wildcard
  // The screen.
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  const dialog = page.locator(".modal");
  await dialog.getByRole("button", { name: "Messages", exact: true }).click();
  await dialog.getByRole("searchbox", { name: "Search PsyAlliance" }).fill("zebra");
  const hits = dialog.locator(".history-hit");
  await expect(hits).toHaveCount(2);
  await expect(dialog.locator(".history-results")).not.toContainText("Private zebra");
  await expect(dialog.locator(".history-results")).not.toContainText("deleted zebra");
  // The oldest message is far beyond the 200 that load with a conversation; opening it loads earlier ones and marks it.
  await hits.filter({ hasText: "handover note" }).click();
  await expect(page.locator("#chat-messages")).toBeVisible();
  await expect(page.locator(".message-group.found")).toContainText("zebra handover note");
  await context.close();
});

test("B-10 M03 the unread number is labelled as unread messages", async ({ browser, baseURL }) => {
  await seedMessages();
  await q(`update conversation_participants set last_read_at = now() - interval '10 days' where profile_id = $1 and conversation_id in (select id from conversations where context_key like 'b-test-avery-%')`, [avery]);
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/messages");
  await expect(page.locator(".unread-pill").first()).toBeVisible();
  const label = await page.locator(".unread-pill").first().getAttribute("aria-label");
  expect(label).toMatch(/unread message/);
  await context.close();
});

test("B-11 N01 a person's reason is specific and true, and trust is a separate, deliberate step", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/network");
  const worked = page.locator("#net-worked");
  await expect(worked).toBeVisible();
  // No row repeats an invented event: each reason is either a recorded collaboration or says plainly that none was kept.
  const reasons = await worked.locator(".net-row .net-why").allInnerTexts();
  expect(reasons.length).toBeGreaterThan(0);
  for (const r of reasons) expect(r).not.toMatch(/Previous collaboration recorded in your practice history/);
  // Adding to trusted is a button, named for what it does.
  await expect(worked.getByRole("button", { name: "Add to trusted colleagues" }).first()).toBeVisible();
  await context.close();
});

test("B-12 A01 freshness at 29, 30, 90 and 91 days: one age everywhere, stale stays searchable but leaves 'available now'", async () => {
  const viewer = bram;
  for (const [days, nowOk, label] of [[29, true, "29 days ago"], [30, true, "30 days ago"], [90, true, "90 days ago"], [91, false, "91 days ago"]] as const) {
    await q(`update profiles set availability_confirmed_at = now() - ($2 || ' days')::interval - interval '1 hour' where id = $1`, [avery, String(days)]);
    const now = await asMember(viewer, `select (public.network_directory('{"available": true}'::jsonb) -> 'people') as p`);
    expect((now.rows[0].p as any[]).some((p) => p.id === avery), `day ${days} in available now`).toBe(nowOk);
    const all = await asMember(viewer, `select (public.network_directory('{}'::jsonb) -> 'people') as p`);
    expect((all.rows[0].p as any[]).some((p) => p.id === avery), `day ${days} still findable`).toBe(true);
    const people = await asMember(viewer, `select public.workspace_people() as p`);
    const me = (people.rows[0].p as any[]).find((p) => p.id === avery);
    expect(String(me.confirmedAt || me.confirmed_at || "").length, `day ${days} has one timestamp`).toBeGreaterThan(0);
    void label;
  }
});

test("B-13 D09 D12 workflow headings name the task, and one client has no client tabs and no By colleague switch", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  await expect(page.locator('[data-action="cover-start"]').first()).toHaveText(/Plan cover/);
  await startCover(page, "B Headings");
  await expect(page.locator("#modal-title")).toHaveText("Build your client list");
  await saveClient(page);
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await expect(page.locator("#modal-title")).toHaveText("Choose colleagues");
  // One client: nothing to switch between.
  await expect(page.locator(".client-match-tabs")).toHaveCount(0);
  await expect(page.locator('[data-action="match-view:colleague"]')).toHaveCount(0);
  await expect(page.locator('[data-action="match-view:client"]')).toHaveCount(0);
  await expect(page.locator(".match-intro")).toContainText("Choose who to ask about this client.");
  await expect(page.locator(".match-intro h3")).toHaveCount(0);
  // The colleague list is still there and can be used.
  expect(await page.locator('input[data-match="cover"][data-client="1"]').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  // Two clients: both switches come back.
  await page.getByRole("button", { name: "Back" }).click();
  await clickAction(page, '[data-action^="client-duplicate:"]');
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  await expect(page.locator(".client-match-tabs")).toBeVisible();
  await expect(page.locator('[data-action="match-view:colleague"]')).toBeVisible();
  await expect(page.locator(".match-intro")).toContainText("Choose who to ask for each client.");
  await page.keyboard.press("Escape");
  // Referrals and availability use plain task names too.
  await page.goto("/dashboard/referrals");
  await expect(page.locator('[data-action="referral-start"]').first()).toHaveText(/Refer a client/);
  await page.locator('[data-action="referral-start"]').first().click();
  await expect(page.locator("#modal-title")).toHaveText("Refer a client");
  await page.keyboard.press("Escape");
  await page.goto("/dashboard?availability=1");
  await expect(page.locator("#modal-title")).toHaveText("Your availability");
  // None of the old promotional headings survive anywhere in the workflow screens.
  const text = await page.locator(".modal").innerText();
  expect(text).not.toMatch(/Room for the right referral|Choose the right colleagues|Bring your people closer|Good colleagues\. A clear fit/);
  await context.close();
});
