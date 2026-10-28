import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// The final product's screens (decisions D-02, D-05, D-09, D-13, D-14, D-15,
// D-21) on the real database, as signed-in fictional members in separate
// browsers. The rules underneath are proved in final-rules.spec.ts.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id;
const uuid = () => crypto.randomUUID();
const isoDay = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA");
const call = async (who: string, sql: string, params: unknown[] = []) => (await asMember(who, sql, params)).rows[0].r;

async function wipe() {
  const them = [avery, bram, cass];
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[])`, [them]);
  await q(`delete from referral_requests where requesting_profile_id = any($1::uuid[]) and client_request_id is not null`, [them]);
  await q(`delete from conversations where id in (select conversation_id from conversation_participants where profile_id = any($1::uuid[]))`, [them]);
  await q(`delete from consultations where author_profile_id = any($1::uuid[])`, [them]);
  await q(`delete from reports where reporter_profile_id = any($1::uuid[])`, [them]);
  await q(`delete from blocked_members where profile_id = any($1::uuid[]) or blocked_profile_id = any($1::uuid[])`, [them]);
  await q(`delete from provider_referrals where reason like 'QA:%'`);
  await q(`delete from notification_events where dedup_key like 'referral%' or dedup_key like 'message:%' or dedup_key like 'consult%'`);
  await q(`update profiles set approx_spaces = 3, referral_availability = 'yes', availability_paused_until = null, accepting_referrals = true,
           coverage_availability = 'yes', consultation_availability = 'yes', availability_confirmed_at = now() - interval '8 days' where id = any($1::uuid[])`, [them]);
}
test.beforeEach(wipe);
test.afterAll(wipe);

async function openAs(browser: any, who: string, baseURL: string, path = "/dashboard") {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  (page as any).__errs = errs;
  await page.goto(path);
  await expect(page.locator("#app .sidebar")).toBeVisible();
  return { context, page };
}
const clean = (page: Page) => expect((page as any).__errs).toEqual([]);

// ---------------------------------------------------------------------------------------------
test("FU-01 availability window: cover openness, pause-until and consult openness are saved and come back", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await a.page.getByRole("button", { name: "Edit" }).first().click();
  await a.page.locator("#availability-slots").fill("4");
  await a.page.locator('input[name="cover"][value="ask"]').check({ force: true });
  await a.page.locator("#availability-pause").fill(isoDay(10));
  await a.page.locator('input[name="consult"]').uncheck({ force: true });
  await a.page.locator('input[name="virtual-NY"]').check();
  await a.page.getByRole("button", { name: /Save & confirm availability/ }).click();
  await expect(a.page.locator("#toast")).toContainText("confirmed");
  const p = await one(`select approx_spaces, availability_paused_until::text as paused, accepting_referrals, coverage_availability, consultation_availability from profiles where id = $1`, [avery]);
  expect(p).toMatchObject({ approx_spaces: 4, paused: isoDay(10), accepting_referrals: false, coverage_availability: "ask_me", consultation_availability: "no" });
  await expect(a.page.locator(".hub-capacity")).toContainText(/Paused until/);
  // Nothing lived only in the browser.
  await a.page.reload();
  await a.page.getByRole("button", { name: "Edit" }).first().click();
  await expect(a.page.locator('input[name="cover"][value="ask"]')).toBeChecked();
  await expect(a.page.locator("#availability-pause")).toHaveValue(isoDay(10));
  await expect(a.page.locator('input[name="consult"]')).not.toBeChecked();
  clean(a.page);
  await a.context.close();
});

// ---------------------------------------------------------------------------------------------
test("FU-02 referral numbers are the sender's own, and the private title is private", async ({ browser, baseURL }) => {
  const mk = (n: number) => call(avery, `select public.referral_create($1::jsonb) as r`, [JSON.stringify({
    requestId: uuid(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual", insurance: "", language: "",
    prescribing: false, audience: "selected", selected: [bram], timeframe: "Within two weeks", message: `QA ${n}` })]);
  const r1 = await mk(1), r2 = await mk(2);
  // Numbers count up from the member's own last one, not from a shared counter.
  expect(r2.number).toBe(r1.number + 1);
  const own = await q(`select count(*)::int c, max(member_seq) m from referral_requests where requesting_profile_id = $1`, [avery]);
  expect(own[0].m).toBe(r2.number);
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/referrals");
  await expect(a.page.locator(".arrangement-row", { hasText: `Referral ${r1.number}` }).first()).toBeVisible();
  await expect(a.page.locator(".arrangement-row", { hasText: `Referral ${r2.number}` }).first()).toBeVisible();
  await a.page.locator(`[data-action="referral:${r2.referralId}"]`).first().click();
  await expect(a.page.locator(".referral-title-line")).toContainText("None yet");
  await a.page.getByRole("button", { name: "Add a title" }).click();
  // Initials and contact details are refused, in words, before anything is saved.
  await a.page.locator("#referral-title-input").fill("J.S. evenings");
  await a.page.getByRole("button", { name: "Save title" }).click();
  await expect(a.page.locator("#referral-title-error")).toContainText(/initials/i);
  await a.page.locator("#referral-title-input").fill("jane@example.com");
  await a.page.getByRole("button", { name: "Save title" }).click();
  await expect(a.page.locator("#referral-title-error")).toContainText(/email/i);
  expect(await q(`select 1 from referral_titles`)).toHaveLength(0);
  await a.page.locator("#referral-title-input").fill("Evening anxiety");
  await a.page.getByRole("button", { name: "Save title" }).click();
  await expect(a.page.locator("#toast")).toContainText("Private title saved");
  await expect(a.page.locator(".referral-title-line")).toContainText("Evening anxiety");
  expect((await one(`select title from referral_titles where profile_id = $1`, [avery])).title).toBe("Evening anxiety");
  await a.page.keyboard.press("Escape");
  await expect(a.page.locator(".arrangement-row", { hasText: "Evening anxiety" })).toBeVisible();
  // The colleague sees the number and the need, never the title.
  const b = await openAs(browser, "bram", baseURL!, "/dashboard/referrals");
  await expect(b.page.locator(".arrangement-row", { hasText: `Referral ${r2.number}` }).first()).toBeVisible();
  expect(await b.page.locator("#app").innerText()).not.toContain("Evening anxiety");
  clean(a.page); clean(b.page);
  await a.context.close(); await b.context.close();
});

// ---------------------------------------------------------------------------------------------
test("FU-03 flag a profile, then block: the flag reaches the admin queue, the block hides each of you", async ({ browser, baseURL }) => {
  const b = await openAs(browser, "bram", baseURL!, `/dashboard/network?profile=${avery}`);
  await b.page.getByRole("button", { name: "Flag this profile" }).click();
  await b.page.locator("#report-category").selectOption("conduct");
  await b.page.locator("#report-reason").fill("A fictional concern for the test.");
  await b.page.getByRole("button", { name: "Send flag" }).click();
  await expect(b.page.locator("#toast")).toContainText("Flag sent");
  const rep = await one(`select * from reports where reporter_profile_id = $1`, [bram]);
  expect(rep).toMatchObject({ target_type: "profile", target_id: avery, category: "conduct", status: "open", reason: "A fictional concern for the test." });
  // Block: asks first, says what it does, and is undone in Settings.
  await b.page.getByRole("button", { name: /^Block / }).click();
  await expect(b.page.locator(".modal")).toContainText("stop seeing each other");
  await b.page.getByRole("button", { name: "Cancel" }).click();
  expect(await q(`select 1 from blocked_members where profile_id = $1`, [bram])).toHaveLength(0);
  await b.page.getByRole("button", { name: /^Block / }).click();
  await b.page.getByRole("button", { name: "Block", exact: true }).click();
  await expect(b.page.locator("#toast")).toContainText("Blocked");
  expect(await q(`select 1 from blocked_members where profile_id = $1 and blocked_profile_id = $2`, [bram, avery])).toHaveLength(1);
  const people = (await call(bram, `select public.workspace_people() as r`)) as any[];
  expect(people.map((p) => p.id)).not.toContain(avery);
  clean(b.page);
  await b.context.close();
});

// ---------------------------------------------------------------------------------------------
test("FU-04 consult: the asker marks a question resolved; others see why replies stopped; Flag on the question and on a reply", async ({ browser, baseURL }) => {
  const post = await call(avery, `select public.consult_post($1::jsonb) as r`, [JSON.stringify({
    clientRequestId: uuid(), title: "How do you handle late cancellations?", body: "", topic: "Professional life", audience: "network", confirmed: "true", tags: [] })]);
  await call(cass, `select public.consult_reply($1::bigint, $2, $3::uuid) as r`, [post.id, "A written policy helps.", uuid()]);
  const a = await openAs(browser, "avery", baseURL!, `/dashboard/consult?discussion=${post.id}`);
  await expect(a.page.locator(".modal")).toContainText("Your question");
  await expect(a.page.locator("#reply-form")).toBeVisible();
  await expect(a.page.getByRole("button", { name: "Flag this discussion" })).toHaveCount(0);
  await a.page.getByRole("button", { name: "Mark as resolved" }).click();
  await expect(a.page.locator("#toast")).toContainText("resolved");
  expect((await one(`select status from consultations where id = $1`, [post.id])).status).toBe("resolved");
  await expect(a.page.locator("#reply-form")).toHaveCount(0);
  await expect(a.page.locator("#discussion-resolved")).toContainText("You marked this question resolved");
  await a.page.keyboard.press("Escape");
  await expect(a.page.locator(".modal")).toHaveCount(0);
  await a.page.locator("#main").getByRole("button", { name: "Following" }).click();
  await expect(a.page.locator(".discussion-row", { hasText: "late cancellations" }).locator(".label", { hasText: "Your question" })).toBeVisible();
  await expect(a.page.locator(".discussion-row", { hasText: "late cancellations" }).locator(".label", { hasText: "Resolved" })).toBeVisible();
  await expect(a.page.getByRole("button", { name: "Mine" })).toHaveCount(0);
  // A colleague sees why they cannot reply, and can report the question or Cass's reply.
  const b = await openAs(browser, "bram", baseURL!, `/dashboard/consult?discussion=${post.id}`);
  await expect(b.page.locator("#discussion-resolved")).toContainText("marked this question resolved");
  await expect(b.page.locator("#reply-form")).toHaveCount(0);
  await expect(b.page.getByRole("button", { name: "Mark as resolved" })).toHaveCount(0);
  await b.page.locator(".reply .row-menu summary").first().click(); // the flag sits in the reply's ... menu
  await b.page.locator(".reply .report-link").first().click();
  await b.page.locator("#report-reason").fill("A fictional concern about this reply.");
  await b.page.getByRole("button", { name: "Send flag" }).click();
  await expect(b.page.locator("#toast")).toContainText("Flag sent");
  await b.page.getByRole("button", { name: "Flag this discussion" }).click();
  await b.page.locator("#report-category").selectOption("patient_information");
  await b.page.locator("#report-reason").fill("A fictional concern about this question.");
  await b.page.getByRole("button", { name: "Send flag" }).click();
  await expect(b.page.locator("#report-form")).toHaveCount(0);
  const reps = await q(`select target_type, target_id, category from reports where reporter_profile_id = $1 order by id`, [bram]);
  expect(reps).toHaveLength(2);
  expect(reps[0].target_type).toBe("consultation_response");
  expect(reps[1]).toMatchObject({ target_type: "consultation", target_id: String(post.id), category: "patient_information" });
  // Reopen: replies work again.
  await a.page.locator(".discussion-row", { hasText: "late cancellations" }).getByRole("button", { name: /late cancellations/ }).click();
  await a.page.getByRole("button", { name: "Reopen question" }).click();
  await expect(a.page.locator("#reply-form")).toBeVisible();
  expect((await one(`select status from consultations where id = $1`, [post.id])).status).toBe("responses_received");
  clean(a.page); clean(b.page);
  await a.context.close(); await b.context.close();
});

// ---------------------------------------------------------------------------------------------
test("FU-05 physician referrals are a tab inside Referrals; the old address forwards there", async ({ browser, baseURL }) => {
  const ruben = account("ruben").id;
  await q(`insert into provider_referrals (referring_provider_id, target_profile_id, patient_age_range, reason, urgency, contact_details) values ($1, $2, '30-39', 'QA: anxiety, evening availability', 'soon', 'fictional')`, [ruben, bram]);
  await q(`insert into provider_referrals (referring_provider_id, target_profile_id, patient_age_range, reason, urgency, contact_details, status, responded_at) values ($1, $2, '40-49', 'QA: low mood', 'routine', 'fictional', 'declined', now())`, [ruben, bram]);
  const b = await openAs(browser, "bram", baseURL!, "/dashboard/referrals");
  const tab = b.page.getByRole("button", { name: /From physicians \(1\)/ });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(b.page.locator(".arrangement-row", { hasText: "anxiety, evening availability" })).toContainText("Ruben Referral");
  await expect(b.page.locator(".arrangement-row", { hasText: "anxiety, evening availability" })).toContainText("Reach them at fictional");
  await expect(b.page.locator(".arrangement-row", { hasText: "anxiety, evening availability" })).toContainText("Client age 30-39");
  await expect(b.page.locator(".arrangement-row", { hasText: "low mood" })).toContainText("Declined");
  await b.page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(b.page.locator("#toast")).toContainText("Acknowledged");
  const row = await one(`select status, responded_at is not null as answered from provider_referrals where reason like 'QA: anxiety%'`);
  expect(row).toMatchObject({ status: "acknowledged", answered: true });
  await expect(b.page.getByRole("button", { name: /From physicians$/ })).toBeVisible();
  // Another member cannot see or answer it.
  const c = await call(cass, `select public.workspace_inbound() as r`);
  expect(Number(c.physicianAll)).toBe(0);
  // The old address and the deep link both land on the tab.
  await b.page.goto("/dashboard/physician-referrals");
  await expect(b.page).toHaveURL(/\/dashboard\/referrals/);
  await expect(b.page.locator(".arrangement-row", { hasText: "low mood" })).toBeVisible();
  clean(b.page);
  await b.context.close();
});

// ---------------------------------------------------------------------------------------------
test("FU-06 an open conversation hears the other person within seconds, without a refresh", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/messages");
  await a.page.getByRole("button", { name: "New message" }).click();
  await a.page.locator(`[data-action="person-message:${bram}"]`).click();
  await expect(a.page.locator("#message-input")).toBeVisible();
  await a.page.locator("#message-input").fill("Hello Bram.");
  await a.page.getByRole("button", { name: "Send message" }).click();
  await expect(a.page.locator(".message-group.outgoing .delivery-state.sent").last()).toBeVisible();
  const key = `direct-${[avery, bram].sort()[0]}-${[avery, bram].sort()[1]}`;
  // Bram answers from the database, the way his own page would.
  await call(bram, `select public.message_send($1, $2, $3::uuid, null) as r`, [key, "Hello Avery, I can help.", uuid()]);
  // No reload and no forced refresh: the fast poll finds it.
  await expect(a.page.locator(".message-group", { hasText: "Hello Avery, I can help." })).toBeVisible({ timeout: 9000 });
  clean(a.page);
  await a.context.close();
});
