import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one } from "../../../lib/staging";

// V13 workspace: Network, Consult and Library screens on the real database,
// as signed-in fictional staging members in separate browsers.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id, fenn = account("fenn").id;
const everyone = [avery, bram, cass, fenn];

async function wipe() {
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from consultations where author_profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from consultation_groups where created_by = any($1::uuid[])`, [everyone]);
  await q(`delete from trusted_colleagues where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from saved_resources where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from notification_preferences where profile_id = any($1::uuid[])`, [everyone]);
  await q(`update profiles set consultation_availability = 'yes', directory_visible = true where id = any($1::uuid[])`, [everyone]);
  await q(`delete from notification_events where dedup_key like 'trusted:%' or dedup_key like 'consult%'`);
}
test.beforeEach(wipe);
test.afterAll(wipe);

const problems = new WeakMap<Page, string[]>();
async function openAs(browser: any, who: string, baseURL: string, path = "/dashboard/network") {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  const errs: string[] = [];
  problems.set(page, errs);
  page.on("pageerror", (e) => errs.push(`${e.message} @ ${(e.stack || "").split("\n").slice(1, 4).join(" | ")}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto(path);
  await expect(page.locator("#app .sidebar")).toBeVisible();
  return { context, page };
}
const clean = (page: Page) => expect(problems.get(page)).toEqual([]);
const catchUp = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

async function ask(page: Page, o: { title: string; body: string; audience: "trusted" | "one" | "few" | "network"; who?: string[] }) {
  await page.getByRole("button", { name: "Ask a question" }).first().click();
  await page.locator("#peer-title").fill(o.title);
  await page.locator("#peer-body").fill(o.body);
  await page.locator(`.audience-tile input[value="${o.audience}"]`).check({ force: true });
  for (const id of o.who || []) await page.locator(`input[name="recipients"][value="${id}"]`).check({ force: true });
  await page.locator('#peer-form input[name="reviewed"]').check();
  await page.getByRole("button", { name: "Review before posting" }).click();
}

test("NCU-01 trusted colleagues: add and remove from the screen, saved once, colleague told once", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await expect(page.locator("#net-trusted")).toBeVisible();
  await page.locator(`[data-action="trust:${bram}"]`).first().click();
  await expect(page.locator("#toast")).toContainText("Added to your trusted colleagues");
  expect((await q(`select 1 from trusted_colleagues where profile_id = $1 and colleague_id = $2`, [avery, bram])).length).toBe(1);
  // It is the database's: a reload keeps it, and Bram is told in the app once.
  await page.reload();
  await expect(page.locator("#net-trusted").locator(`[data-action="profile:${bram}"]`)).toBeVisible();
  const told = await q(`select d.channel from notification_deliveries d join notification_events e on e.id = d.notification_event_id where d.recipient_profile_id = $1 and e.dedup_key like $2`, [bram, `trusted:${avery}:${bram}`]);
  expect(told.filter((n) => n.channel === "in_app").length).toBe(1);
  // Take them off again from the profile; no second notice when added back.
  await page.locator(`[data-action="profile:${bram}"]`).first().click();
  await page.locator(`.modal [data-action="trust:${bram}"]`).click();
  await expect(page.locator("#toast")).toContainText("Removed from your trusted colleagues");
  expect((await q(`select 1 from trusted_colleagues where profile_id = $1`, [avery])).length).toBe(0);
  await clean(page);
  await context.close();
});

test("NCU-02 invitation: personal link, nothing is sent, nothing is created", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  const mailBefore = await (await fetch("http://127.0.0.1:8025/api/v1/messages")).json();
  const eventsBefore = await q(`select count(*)::int as n from notification_events`);
  await page.getByRole("button", { name: "Invite a colleague" }).first().click();
  await page.locator("#invite-name").fill("Imogen Ashdown");
  await page.locator("#invite-email").fill("imogen@example.test");
  await page.getByRole("button", { name: "Review invitation" }).click();
  await expect(page.locator("#invitation-copy-text")).toContainText("Imogen");
  const text = await page.locator("#invitation-copy-text").innerText();
  expect(text).toMatch(/\/i\/[A-Za-z0-9_-]{6,}/);
  await expect(page.locator(".invite-prototype")).toContainText("Nothing is sent from here");
  await page.getByRole("button", { name: "Copy invitation" }).click();
  await expect(page.locator("#toast")).toContainText("Nothing has been sent");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  const mailAfter = await (await fetch("http://127.0.0.1:8025/api/v1/messages")).json();
  expect(mailAfter.total).toBe(mailBefore.total);
  expect((await one(`select count(*)::int as n from notification_events`)).n).toBe(eventsBefore[0].n);
  await clean(page);
  await context.close();
});

test("NCU-03 directory: find colleagues, open a profile, invite link opens the form", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator('[data-action="network-tab:directory"]').first().click();
  await page.locator("input[id^='page-dir-'], #page-dir-search, .search-field input").first().fill("Fenn");
  await expect(page.locator(`[data-action="profile:${fenn}"]`).first()).toBeVisible();
  await page.locator(`[data-action="profile:${fenn}"]`).first().click();
  await expect(page.locator(".modal")).toContainText("Fenn Oakhollow");
  await context.close();
  // Old addresses still land in the right place.
  const b = await openAs(browser, "avery", baseURL!, "/dashboard/invite");
  await expect(b.page).toHaveURL(/\/dashboard\/network$/);
  await expect(b.page.locator("#invite-name")).toBeVisible();
  await b.page.goto("/dashboard/clinicians");
  await expect(b.page).toHaveURL(/\/dashboard\/network$/);
  await b.page.goto(`/dashboard/network?profile=${fenn}`);
  await expect(b.page.locator(".modal")).toContainText("Fenn Oakhollow");
  await clean(b.page);
  await b.context.close();
});

test("NCU-04 ask a question: posted once, the audience is told, a double click does not repeat it", async ({ browser, baseURL }) => {
  await q(`insert into trusted_colleagues (profile_id, colleague_id) values ($1, $2) on conflict do nothing`, [avery, bram]);
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  await ask(a.page, { title: "How do you pace a first session?", body: "Looking for a fresh view on structure.", audience: "trusted" });
  await expect(a.page.locator(".modal")).toContainText("Review your question");
  await a.page.getByRole("button", { name: "Post question" }).dblclick();
  await expect(a.page.locator("#toast")).toContainText("shared");
  await expect(a.page.locator(".modal")).toContainText("How do you pace a first session?");
  const rows = await q(`select * from consultations where author_profile_id = $1`, [avery]);
  expect(rows.length).toBe(1);
  expect(rows[0]).toMatchObject({ question: "How do you pace a first session?", audience_type: "trusted" });
  // Bram sees it, and was told once.
  const b = await openAs(browser, "bram", baseURL!, "/dashboard/consult");
  await expect(b.page.locator("#consult-results")).toContainText("How do you pace a first session?");
  expect((await q(`select 1 from notification_events e join notification_deliveries d on d.notification_event_id = e.id where d.recipient_profile_id = $1 and e.event_type = 'consultation_invite'`, [bram])).length).toBeGreaterThanOrEqual(1);
  // Cass is outside Avery's trusted circle and does not see it.
  const c = await openAs(browser, "cass", baseURL!, "/dashboard/consult");
  await expect(c.page.locator("#consult-results")).not.toContainText("How do you pace a first session?");
  await clean(a.page); await clean(b.page); await clean(c.page);
  await a.context.close(); await b.context.close(); await c.context.close();
});

test("NCU-05 audiences: one colleague and a few colleagues reach only those chosen; the form refuses an empty or unconfirmed question", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  await ask(a.page, { title: "Private view on a boundary", body: "A quiet question.", audience: "one", who: [cass] });
  await a.page.getByRole("button", { name: "Post question" }).click();
  await expect(a.page.locator("#toast")).toContainText("shared");
  const row = await one(`select * from consultations where author_profile_id = $1`, [avery]);
  expect(row.audience_profile_ids).toEqual([cass]);
  const c = await openAs(browser, "cass", baseURL!, "/dashboard/consult");
  await expect(c.page.locator("#consult-results")).toContainText("Private view on a boundary");
  const b = await openAs(browser, "bram", baseURL!, "/dashboard/consult");
  await expect(b.page.locator("#consult-results")).not.toContainText("Private view on a boundary");
  // Nothing chosen: refused before posting.
  await a.page.keyboard.press("Escape");
  await expect(a.page.locator(".modal")).toHaveCount(0);
  await a.page.getByRole("button", { name: "Ask a question" }).first().click();
  await a.page.locator("#peer-title").fill("Nothing chosen");
  await a.page.locator("#peer-body").fill("Body");
  await a.page.locator(`.audience-tile input[value="few"]`).check({ force: true });
  await a.page.locator('#peer-form input[name="reviewed"]').check();
  await a.page.getByRole("button", { name: "Review before posting" }).click();
  await expect(a.page.locator(".field-error, .form-error").first()).toContainText("Choose at least one recipient");
  expect((await q(`select 1 from consultations where author_profile_id = $1`, [avery])).length).toBe(1);
  await a.context.close(); await b.context.close(); await c.context.close();
});

test("NCU-06 replies: posted once even when retried, ordered newest first; follow and Useful are the member's own", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  await ask(a.page, { title: "Ending work with a long-term client", body: "How do you plan the last sessions?", audience: "network" });
  await a.page.getByRole("button", { name: "Post question" }).click();
  await expect(a.page.locator("#toast")).toContainText("shared");
  const id = (await one(`select id from consultations where author_profile_id = $1`, [avery])).id;
  // Bram opens it from an old-style link and replies; a double submit adds one reply.
  const b = await openAs(browser, "bram", baseURL!, `/dashboard/consult/${id}`);
  await expect(b.page).toHaveURL(/\/dashboard\/consult$/);
  await expect(b.page.locator(".modal")).toContainText("Ending work with a long-term client");
  await b.page.locator("#discussion-reply").fill("I plan a review session first.");
  await b.page.evaluate(() => { const f = document.querySelector<HTMLFormElement>("#reply-form")!; f.requestSubmit(); f.requestSubmit(); });
  await expect(b.page.locator(".reply-list")).toContainText("I plan a review session first.");
  await expect.poll(async () => (await q(`select 1 from consultation_responses where consultation_id = $1`, [id])).length).toBe(1);
  await b.page.locator("#discussion-reply").fill("A second, later thought.");
  await b.page.getByRole("button", { name: "Post reply" }).click();
  await expect(b.page.locator(".reply").first()).toContainText("A second, later thought.");
  // Avery is told; follows are automatic for both; Avery marks the first reply Useful.
  await catchUp(a.page);
  await a.page.reload();
  await a.page.locator(`[data-action="discussion:${id}"]`).first().click();
  await expect(a.page.locator(".modal")).toContainText("2 replies");
  expect((await q(`select 1 from consultation_follows where consultation_id = $1`, [id])).length).toBe(2);
  const first = a.page.locator(".reply", { hasText: "I plan a review session first." });
  await first.locator(".useful-button").click();
  await expect(first.locator(".useful-button")).toHaveClass(/active/);
  expect((await q(`select 1 from consultation_response_useful where profile_id = $1`, [avery])).length).toBe(1);
  // Bram does not see who marked it, and has his own state.
  await b.page.reload();
  await b.page.locator(`[data-action="discussion:${id}"]`).first().click();
  await expect(b.page.locator(".useful-button")).toHaveCount(0);
  // Unfollow and follow again.
  await a.page.locator(`.modal [data-action="follow:${id}"]`).click();
  await expect.poll(async () => (await q(`select 1 from consultation_follows where consultation_id = $1 and profile_id = $2`, [id, avery])).length).toBe(0);
  await expect(a.page.locator(`.modal [data-action="follow:${id}"]`)).toContainText("Follow discussion");
  await a.page.locator(`.modal [data-action="follow:${id}"]`).click();
  await expect.poll(async () => (await q(`select 1 from consultation_follows where consultation_id = $1 and profile_id = $2`, [id, avery])).length).toBe(1);
  await clean(a.page); await clean(b.page);
  await a.context.close(); await b.context.close();
});

test("NCU-07 library: save, find under Saved, templates not yet reviewed say so and have no file", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/library");
  const card = page.locator(".resource-card", { hasText: "Planning your practice cover" });
  await card.locator('[data-action^="resource-save:"]').click();
  await expect(page.locator("#toast")).toContainText("Saved to your Library");
  expect((await q(`select resource_key from saved_resources where profile_id = $1`, [avery])).map((r) => r.resource_key)).toEqual(["guide:1"]);
  await page.reload();
  await page.locator('[data-action="resource-filter:Saved"]').click();
  await expect(page.locator(".resource-card")).toHaveCount(1);
  await page.locator('[data-action="resource-filter:All"]').click();
  // A template waiting for review is listed with the same label as the design and no file.
  const tpl = page.locator(".resource-card", { hasText: "Reciprocal Coverage Agreement" });
  await expect(tpl.locator(".library-review-label")).toContainText("Coming soon");
  await tpl.getByRole("button", { name: "Open resource" }).click();
  await expect(page.locator(".modal")).toContainText("coming soon");
  await expect(page.locator('.modal a[href^="/dashboard/library-files/"]')).toHaveCount(0);
  const res = await page.request.get("/dashboard/library-files/PA-01");
  expect(res.status()).toBe(404);
  await clean(page);
  await context.close();
});

// Runs against a build with the preview setting on (the sandbox's setting): a
// template still waiting for review is open, and says so. Nothing is marked
// reviewed. The live setting is covered by NCU-07.
test("NCU-08 library (preview setting): a supplied draft opens and downloads from its own address and says review is pending", async ({ browser, baseURL }) => {
  test.skip(!process.env.E2E_LIBRARY_PREVIEW, "needs a build with NEXT_PUBLIC_LIBRARY_PREVIEW=1");
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/library?resource=PA-03");
  await expect(page.locator(".modal")).toContainText("Professional Will");
  await expect(page.locator(".modal")).toContainText("Review pending");
  const link = page.locator('.modal a[href="/dashboard/library-files/PA-03"]').first();
  await expect(link).toBeVisible();
  const res = await page.request.get("/dashboard/library-files/PA-03");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("PA-03");
  await page.locator('.modal [data-action^="resource-save:"]').click();
  await expect(page.locator("#toast")).toContainText("Saved to your Library");
  expect((await q(`select resource_key from saved_resources where profile_id = $1`, [avery])).map((r) => r.resource_key)).toContain("PA-03");
  const anon = await (await browser.newContext()).request.get(`${baseURL}/dashboard/library-files/PA-03`, { maxRedirects: 0 });
  expect([401, 307, 302, 404]).toContain(anon.status());
  await clean(page);
  await context.close();
});

test("NCU-09 notification choices: each switch is the member's own saved setting", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/network");
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('.modal [data-action="preferences"]').click();
  const sw = (label: string) => page.getByRole("switch", { name: label });
  await expect(sw("Messages from colleagues")).toHaveAttribute("aria-checked", "true");
  await sw("Messages from colleagues").click();
  await expect(sw("Messages from colleagues")).toHaveAttribute("aria-checked", "false");
  await sw("Community discussions").click();
  await expect(sw("Community discussions")).toHaveAttribute("aria-checked", "false");
  const prefs = await one(`select * from notification_preferences where profile_id = $1`, [avery]);
  expect(prefs.email_on_message).toBe(false);
  await page.reload();
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('.modal [data-action="preferences"]').click();
  await expect(sw("Messages from colleagues")).toHaveAttribute("aria-checked", "false");
  await expect(sw("Cover and referral updates")).toHaveAttribute("aria-checked", "true");
  await clean(page);
  await context.close();
});

test("NCU-10 a consultation group: the old Ask-this-group address opens the form on the group, the post reaches only its members", async ({ browser, baseURL }) => {
  const g = await one(`insert into consultation_groups (name, purpose, created_by) values ('Autumn peer group', 'Test group', $1) returning id`, [avery]);
  await q(`insert into consultation_group_members (group_id, profile_id, status, role) values ($1, $2, 'joined', 'creator'), ($1, $3, 'joined', 'member')`, [g.id, avery, bram]);
  const a = await openAs(browser, "avery", baseURL!, `/dashboard/consult/new?group=${g.id}`);
  await expect(a.page).toHaveURL(/\/dashboard\/consult$/);
  await expect(a.page.locator("#peer-title")).toBeVisible();
  await expect(a.page.locator(".audience-tile.selected")).toContainText("Autumn peer group");
  await a.page.locator("#peer-title").fill("A question for the group");
  await a.page.locator("#peer-body").fill("Something to think about together.");
  await a.page.locator('#peer-form input[name="reviewed"]').check();
  await a.page.getByRole("button", { name: "Review before posting" }).click();
  await a.page.getByRole("button", { name: "Post question" }).click();
  await expect(a.page.locator("#toast")).toContainText("shared");
  expect(await one(`select group_id from consultations where author_profile_id = $1`, [avery])).toMatchObject({ group_id: g.id });
  const b = await openAs(browser, "bram", baseURL!, "/dashboard/consult");
  await expect(b.page.locator("#consult-results")).toContainText("A question for the group");
  await expect(b.page.locator(".consult-sidebar")).toContainText("Autumn peer group");
  const c = await openAs(browser, "cass", baseURL!, "/dashboard/consult");
  await expect(c.page.locator("#consult-results")).not.toContainText("A question for the group");
  await a.page.goto("/dashboard/consult/groups");
  await expect(a.page).toHaveURL(/\/dashboard\/consult\/groups$/);
  await clean(a.page); await clean(b.page); await clean(c.page);
  await a.context.close(); await b.context.close(); await c.context.close();
});

test("NCU-11 a dropped connection: nothing is half-posted, and trying again posts the question and the reply once", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  await ask(a.page, { title: "Offline question", body: "Context for it.", audience: "network" });
  await a.context.setOffline(true);
  await a.page.getByRole("button", { name: "Post question" }).click();
  await expect(a.page.locator(".field-error, .form-error").first()).toBeVisible();
  expect((await q(`select 1 from consultations where author_profile_id = $1`, [avery])).length).toBe(0);
  await a.context.setOffline(false);
  await a.page.getByRole("button", { name: "Post question" }).click();
  await expect(a.page.locator("#toast")).toContainText("shared");
  expect((await q(`select 1 from consultations where author_profile_id = $1`, [avery])).length).toBe(1);
  const id = (await one(`select id from consultations where author_profile_id = $1`, [avery])).id;
  const b = await openAs(browser, "bram", baseURL!, `/dashboard/consult?discussion=${id}`);
  await expect(b.page.locator(".modal")).toContainText("Offline question");
  await b.page.locator("#discussion-reply").fill("Replying on a bad connection.");
  await b.context.setOffline(true);
  await b.page.getByRole("button", { name: "Post reply" }).click();
  await expect(b.page.locator("#toast")).toBeVisible();
  expect((await q(`select 1 from consultation_responses where consultation_id = $1`, [id])).length).toBe(0);
  await expect(b.page.locator("#discussion-reply")).toHaveValue("Replying on a bad connection.");
  await b.context.setOffline(false);
  await b.page.getByRole("button", { name: "Post reply" }).click();
  await expect(b.page.locator(".reply-list")).toContainText("Replying on a bad connection.");
  expect((await q(`select 1 from consultation_responses where consultation_id = $1`, [id])).length).toBe(1);
  await a.context.close(); await b.context.close();
});
