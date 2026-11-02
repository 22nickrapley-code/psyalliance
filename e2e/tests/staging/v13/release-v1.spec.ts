import { test, expect, type Browser } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// PsyAlliance 1.0: the one design (homepage, trial, sign-up, Hub, edit profile, Network) and @mentions.
// Fictional people only. Local database.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id;

async function as(browser: Browser, who: string, baseURL: string, width = 1365) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, ...(width < 700 ? { isMobile: true, hasTouch: true } : {}) });
  await signInAs(context, who, baseURL);
  return { context, page: await context.newPage() };
}

test("V1-01 homepage tells the story in order: problem, every stage, Library, why we built it, trust, questions; fits a 390 and 320 phone", async ({ browser, baseURL }) => {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(baseURL! + "/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your own practice, with a group behind you.");
    await expect(page.getByRole("link", { name: "Create your account" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Show me how it could help" })).toHaveAttribute("href", "/start");
    const order = await page.evaluate(() => ["how", "stages", "library", "why", "verification", "faq"].map((id) => document.getElementById(id)!.getBoundingClientRect().top));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // 1 Nov (Nick, B): the moments as Without / With PsyAlliance.
    await expect(page.locator("#how")).toContainText("Without PsyAlliance");
    await expect(page.locator("#how")).toContainText("With PsyAlliance");
    await expect(page.locator("#why")).toContainText("Rena Pazienza, PhD");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await context.close();
  }
});

// 1 Nov (Nick, A): one calm page. Choosing a need asks "Which describes you best?" (optional) and goes to that need's demo.
test("V1-02 the trial: choose a need, answer or skip the optional question, and land on that need's demo", async ({ browser, baseURL }) => {
  for (const width of [1365, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(baseURL! + "/start");
    await page.locator('[data-need="time_away"]').click();
    const dlg = page.locator("dialog.guide-dialog[open]");
    await expect(dlg).toContainText("Which describes you best?");
    await dlg.getByRole("button", { name: /Skip/ }).click();
    await expect(page).toHaveURL(/\/tour\/time-away/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await context.close();
  }
});

test("V1-03 sign-up shows the goal chosen on the trial, with a way to change it", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await context.addCookies([{ name: "pa_start", value: encodeURIComponent(JSON.stringify({ need: "time_away", exp: Date.now() + 600000 })), url: baseURL! }]);
  const page = await context.newPage();
  await page.goto(baseURL! + "/auth/sign-up");
  await expect(page.locator("[data-join-goal]")).toContainText("Your goal: Arrange time away.");
  await expect(page.locator("[data-join-goal] a")).toHaveAttribute("href", "/start");
  // The form comes before "what happens next".
  const form = (await page.locator(".join-card").boundingBox())!, intro = (await page.locator(".join-intro").boundingBox())!;
  expect(form.x).toBeLessThan(intro.x);
  await context.close();
});

// 1 Nov (Nick, D, LinkedIn style): the profile as colleagues see it; each section's pencil opens a card; a link to a
// section opens its card; every field stays in the one form, so one Save keeps them all.
test("V1-04 edit profile: a pencil opens a section's card, a link to a section opens it, and every field stays in the one form", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "avery", baseURL!);
  await page.goto(`${baseURL}/dashboard/profile`);
  await expect(page.locator("#dlg-insurance")).toBeHidden();
  await page.locator('[data-edit="insurance"]').first().click();
  await expect(page.locator("#dlg-insurance")).toBeVisible();
  await page.locator("#dlg-insurance [data-cancel]").first().click();
  await expect(page.locator("#dlg-insurance")).toBeHidden();
  expect(await page.locator("#profile-form #full_name").count()).toBe(1);
  await page.goto(`${baseURL}/dashboard/profile#languages`);
  await expect(page.locator("#dlg-languages")).toBeVisible();
  await context.close();
});

test("V1-05 quick start: a link that isn't a Psychology Today profile is not opened, and says what to do instead", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "dara", baseURL!);
  await page.goto(`${baseURL}/dashboard/profile?edit=1`);
  const open = page.getByRole("button", { name: "Import" });
  if (await open.isVisible().catch(() => false)) await open.click();
  await page.getByLabel("Your existing profile").fill("https://example.com/my-profile");
  await page.getByRole("button", { name: "Fill in from this link" }).click();
  await expect(page.locator("#quick-start [role=status]")).toContainText("We couldn't open that page");
  await context.close();
});

test("V1-06 typing @ in a message offers the people in that conversation, and choosing one inserts their name", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "avery", baseURL!);
  await page.goto(`${baseURL}/dashboard/messages`);
  await page.getByRole("button", { name: "New message" }).click();
  await page.locator(`[data-action="person-message:${bram}"]`).click();
  const box = page.locator("#message-input");
  await expect(box).toBeVisible();
  await box.fill("");
  await box.pressSequentially("Thanks @");
  const pop = page.locator(".mention-pop");
  await expect(pop).toBeVisible();
  const option = pop.locator(".mention-opt").first();
  await expect(option).toBeVisible();
  const name = (await option.locator("b").innerText()).trim();
  await box.press("Enter");
  await expect(pop).toHaveCount(0);
  await expect(box).toHaveValue(`Thanks @${name} `);
  await box.fill("");
  await context.close();
});

test("V1-07 @mention in a message: only people in the conversation are notified, and the notification opens that message", async () => {
  const conv = await one(`select cp.conversation_id from conversation_participants cp join conversation_participants o on o.conversation_id = cp.conversation_id and o.profile_id = $2
                           where cp.profile_id = $1 limit 1`, [avery, bram]).catch(() => null);
  test.skip(!conv, "no avery-bram conversation in the fixtures");
  const msg = await one(`insert into conversation_messages (conversation_id, author_id, body) values ($1, $2, 'QA V1 hello @Bram') returning id`, [conv.conversation_id, avery]);
  const res = await asMember(avery, `select public.mention_notify('message', $1, $2::uuid[]) as n`, [msg.id, [bram, cass]]);
  expect(res.rows[0].n).toBe(1);
  const ev = await q(`select d.recipient_profile_id as r, e.deep_link from notification_events e join notification_deliveries d on d.notification_event_id = e.id
                       where e.dedup_key like $1 and d.channel = 'in_app'`, [`mention:message:${msg.id}:%`]);
  expect(ev.map((x: any) => x.r)).toEqual([bram]);
  expect(ev[0].deep_link).toContain(`message=${msg.id}`);
  // Someone else cannot use another member's message to notify people.
  expect((await asMember(bram, `select public.mention_notify('message', $1, $2::uuid[]) as n`, [msg.id, [avery]])).rows[0].n).toBe(0);
  await q(`delete from notification_events where dedup_key like 'mention:message:' || $1 || ':%'`, [msg.id]);
  await q(`delete from conversation_messages where id = $1`, [msg.id]);
});

test("V1-08 @mention in a Consult reply: only members who can already see the discussion are notified", async () => {
  // A wider-network question by Bram (fictional), which Avery can see.
  const c = await one(`insert into consultations (author_profile_id, question, audience_type, status, deidentification_confirmed) values ($1, 'QA V1: what makes a useful handover?', 'wider_network', 'open', true) returning id`, [bram]);
  expect((await one(`select private.consult_can_see($1, $2) as a`, [c.id, avery])).a).toBe(true);
  const r = await one(`insert into consultation_responses (consultation_id, responder_profile_id, response_type, body) values ($1, $2, 'reply', 'QA V1 reply @Bram') returning id`, [c.id, avery]);
  const outsider = await one(`select p.id from profiles p where p.account_kind = 'clinician' and p.id not in ($2, $3) and not private.consult_can_see($1, p.id) limit 1`, [c.id, avery, bram]).catch(() => null);
  const ids = outsider ? [bram, outsider.id] : [bram];
  const res = await asMember(avery, `select public.mention_notify('consult', $1, $2::uuid[]) as n`, [r.id, ids]);
  expect(res.rows[0].n).toBe(1);
  const who = await asMember(avery, `select id from public.consult_mentionable($1)`, [c.id]);
  if (outsider) expect(who.rows.map((x: any) => x.id)).not.toContain(outsider.id);
  await q(`delete from notification_events where dedup_key like 'mention:consult:' || $1 || ':%'`, [r.id]);
  await q(`delete from consultation_responses where id = $1`, [r.id]);
  await q(`delete from consultations where id = $1`, [c.id]);
});

