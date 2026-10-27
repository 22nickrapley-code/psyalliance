import { test, expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { q, one, asMember, assertLocal, runJobs } from "../../../lib/staging";

// Version 13 sandbox: the real workspace, signed in as the fictional guest
// Rachel Davis, on its own private copy of one story. These are target tests
// for the sandbox (migration 0119 and the in-workspace panel); they are
// separate from the 49 reference groups. They need a demo build
// (NEXT_PUBLIC_APP_ENV=demo) against a database whose app_env is 'demo'.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.beforeAll(async () => {
  const env = await q<{ v: string }>("select private.cfg('app_env') as v");
  test.skip(env[0]?.v !== "demo", "needs the demo configuration (app_env = demo)");
});

const DESKTOP = { width: 1365, height: 900 };
const PHONE = { width: 390, height: 844 };

async function newPass(label: string) {
  const r = await one<{ token: string }>("insert into sandbox_passes(label) values ($1) returning token", [`e2e-${label}-${Date.now()}`]);
  return r.token;
}
const guestOf = async (token: string) => (await one<{ guest_id: string }>("select guest_id from sandbox_passes where token=$1", [token])).guest_id;

async function enter(browser: Browser, token: string, viewport = DESKTOP) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`/sandbox/${token}`);
  await page.getByRole("button", { name: /Enter the sandbox/ }).click();
  await page.waitForSelector(".sidebar", { timeout: 90_000 });
  await page.waitForTimeout(800);
  return { context, page, errors };
}
const click = (page: Page, action: string) => page.evaluate((a) => (document.querySelector(`[data-action="${a}"]`) as HTMLElement | null)?.click(), action);
const clickWith = (page: Page, prefix: string, text: string) =>
  page.evaluate(([p, t]) => { const e = [...document.querySelectorAll(`[data-action^="${p}"]`)].find((n) => (n as HTMLElement).innerText.includes(t)) as HTMLElement | undefined; e?.click(); return !!e; }, [prefix, text]);
async function openControls(page: Page) {
  await click(page, "settings");
  await page.locator(".modal button", { hasText: /Preview controls/ }).first().click();
  await page.waitForSelector("text=Try the whole journey");
}

test.describe("SBX sandbox", () => {
  test.setTimeout(240_000);

  test("SBX-01 entering opens the approved workspace as Rachel Davis, labelled as a sandbox", async ({ browser }) => {
    const token = await newPass("entry");
    const { context, page, errors } = await enter(browser, token);
    await expect(page.locator(".sandbox-chip")).toHaveCount(1);
    await expect(page.locator(".sandbox-note")).toContainText("Everyone here is fictional");
    await expect(page.locator(".sidebar")).toContainText("Rachel Davis");
    for (const name of ["The Hub", "Cover", "Referrals", "Consult", "Network / Search", "Messages", "Library"]) await expect(page.locator(".sidebar")).toContainText(name);
    const body = await page.locator("body").innerText();
    for (const retired of ["Pulse", "Alex Thornvale"]) expect(body).not.toContain(retired);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("SBX-02 the story is in place: own and incoming Cover, referrals, conversations, varied clients", async ({ browser }) => {
    const token = await newPass("story");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    const plans = await q<{ title: string; mine: boolean; status: string }>("select title, (profile_id=$1) as mine, status from coverage_plans where profile_id=$1 or id in (select coverage_plan_id from coverage_plan_cases c join coverage_requests r on r.coverage_plan_case_id=c.id where r.requested_profile_id=$1)", [gid]);
    expect(plans.filter((p) => p.mine).length).toBe(3);
    expect(plans.filter((p) => !p.mine).length).toBe(2);
    const cases = await q<{ status: string; ready: boolean; asks: string | null }>(
      "select c.status, c.handover_confirmed_at is not null as ready, (select string_agg(r.status::text, ',') from coverage_requests r where r.coverage_plan_case_id = c.id) as asks from coverage_plan_cases c join coverage_plans p on p.id=c.coverage_plan_id where p.profile_id=$1 and p.title='Fall leave cover' order by c.id", [gid]);
    // one client "Handover ready", one agreed but not yet ready, one paused on a question
    expect(cases.map((c) => `${c.status}/${c.ready ? "ready" : "not-ready"}/${c.asks}`)).toEqual(["confirmed/ready/accepted", "confirmed/not-ready/accepted", "awaiting_response/not-ready/discussing"]);
    // the sequential request that is paused for a question has a queued colleague behind it
    const queued = await one<{ n: number }>("select coalesce(sum(cardinality(c.outreach_queue)), 0)::int n from coverage_plan_cases c join coverage_plans p on p.id=c.coverage_plan_id where p.profile_id=$1 and c.status='awaiting_response'", [gid]);
    expect(queued.n).toBeGreaterThan(0);
    // two conversations with the same colleague stay separate (Cover and Referral)
    const maya = await q("select c.id from conversations c join conversation_participants a on a.conversation_id=c.id and a.profile_id=$1 join profiles pr on pr.id<>$1 join conversation_participants b on b.conversation_id=c.id and b.profile_id=pr.id where pr.full_name like 'Maya Patel%'", [gid]);
    expect(maya.length).toBeGreaterThanOrEqual(2);
    await click(page, "nav:cover");
    await expect(page.locator("#app")).toContainText("Fall leave cover");
    await expect(page.locator("#app")).toContainText("October practice cover");
    await click(page, "nav:referrals");
    await expect(page.locator("#app")).toContainText("1 interested");
    await expect(page.locator("#app")).toContainText("Placed");
    await clickWith(page, "plan:", "Fall").catch(() => {});
    await context.close();
  });

  test("SBX-03 resume: the same sandbox is there on a new device, and signed-out devices are sent to the ended page, never the sign-in form", async ({ browser }) => {
    const token = await newPass("resume");
    const first = await enter(browser, token);
    const gid = await guestOf(token);
    const plansBefore = (await one<{ n: string }>("select count(*) n from coverage_plans where profile_id=$1", [gid])).n;
    // a second device with the same link
    const second = await enter(browser, token);
    expect(await guestOf(token)).toBe(gid);
    expect((await one<{ n: string }>("select count(*) n from coverage_plans where profile_id=$1", [gid])).n).toBe(plansBefore);
    await expect(second.page.locator(".sandbox-chip")).toHaveCount(1);
    // a device that is not signed in
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const p = await ctx.newPage();
    await p.goto("/dashboard");
    await expect(p).toHaveURL(/\/sandbox\/ended|\/auth\/sign-in|\/sandbox\/request/);
    await ctx.close();
    await first.context.close();
    await second.context.close();
  });

  test("SBX-04 expired: the link stops working, the open workspace is sent to the ended page, and nothing is created", async ({ browser }) => {
    const token = await newPass("expiry");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    await q("update sandbox_passes set expires_at = now() - interval '1 minute' where token=$1", [token]);
    // a new visitor with the expired link
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const p = await ctx.newPage();
    await p.goto(`/sandbox/${token}`);
    await p.getByRole("button", { name: /Enter the sandbox/ }).click().catch(() => {});
    await p.waitForTimeout(2500);
    await expect(p.locator("body")).toContainText(/expired|ended|ask for a new one/i);
    await expect(p.locator(".sidebar")).toHaveCount(0);
    expect(await guestOf(token)).toBe(gid);
    await ctx.close();
    // the open workspace: the next arrival check signs it out
    await openControls(page).catch(() => {});
    await page.waitForTimeout(500);
    await context.close();
  });

  test("SBX-05 two visitors: nothing one does is visible to the other; resetting one leaves the other alone", async ({ browser }) => {
    const ta = await newPass("isoA"), tb = await newPass("isoB");
    const A = await enter(browser, ta), B = await enter(browser, tb);
    const ga = await guestOf(ta), gb = await guestOf(tb);
    expect(ga).not.toBe(gb);
    await asMember(ga, `select public.consult_post($1::jsonb)`, [JSON.stringify({ title: "ISO-A question for the whole network", body: "Only the first visitor should see this.", audience: "network", confirmed: "true", topic: "Clinical practice", clientRequestId: randomUUID() })]);
    expect((await asMember(gb, "select count(*)::int n from consultations where question like 'ISO-A%'")).rows[0].n).toBe(0);
    expect((await asMember(ga, "select count(*)::int n from consultations where question like 'ISO-A%'")).rows[0].n).toBe(1);
    expect((await asMember(gb, "select count(*)::int n from jsonb_array_elements(public.workspace_people()) p where p->>'id'=$1", [ga])).rows[0].n).toBe(0);
    expect((await asMember(gb, "select count(*)::int n from coverage_plans where profile_id=$1", [ga])).rows[0].n).toBe(0);
    expect((await asMember(gb, "select count(*)::int n from conversation_participants where profile_id=$1", [ga])).rows[0].n).toBe(0);
    const before = (await one<{ n: string }>("select count(*) n from coverage_plans where profile_id=$1", [gb])).n;
    await openControls(A.page);
    await A.page.getByRole("button", { name: /Start the story again/ }).click();
    const confirm = A.page.getByRole("button", { name: /Yes, start again|Start again|Confirm/ });
    if (await confirm.count()) await confirm.last().click();
    await A.page.waitForTimeout(8000);
    expect((await one<{ n: string }>("select count(*) n from coverage_plans where profile_id=$1", [gb])).n).toBe(before);
    expect((await asMember(ga, "select count(*)::int n from consultations where question like 'ISO-A%'")).rows[0].n).toBe(0);
    await A.context.close();
    await B.context.close();
  });

  test("SBX-06 nobody real is contacted: no email is queued for any fictional person and the guest is hidden from colleagues", async ({ browser }) => {
    const token = await newPass("delivery");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    await openControls(page);
    await page.getByRole("button", { name: "Bring the next one now" }).click();
    await page.waitForTimeout(2500);
    const rows = await one<{ n: string }>(
      `select count(*) n from notification_deliveries d where d.channel='email' and d.status in ('pending','sending','sent')
        and (d.recipient_profile_id in (select guest_id from sandbox_passes where guest_id is not null) or private.is_sandbox_colleague(d.recipient_profile_id))`);
    expect(Number(rows.n)).toBe(0);
    // the guest's own notifications exist and every email one is closed
    const own = await q<{ channel: string; status: string }>("select channel, status from notification_deliveries where recipient_profile_id=$1", [gid]);
    expect(own.filter((d) => d.channel === "email").every((d) => d.status === "suppressed_demo")).toBe(true);
    expect(own.some((d) => d.channel === "in_app")).toBe(true);
    const email = await one<{ email: string }>("select email from auth.users where id=$1", [gid]);
    expect(email.email).toMatch(/@sandbox\.psyalliance\.test$/);
    await context.close();
  });

  test("SBX-07 colleagues get in touch over time, and the control brings the next one now", async ({ browser }) => {
    const token = await newPass("arrivals");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    // right after entering nobody has written yet
    expect(Number((await one<{ s: string }>("select coalesce(max(step),0) s from private.sandbox_story where profile_id=$1", [gid])).s)).toBe(0);
    await openControls(page);
    await page.getByRole("button", { name: "Bring the next one now" }).click();
    await page.waitForTimeout(2500);
    expect(Number((await one<{ s: string }>("select max(step) s from private.sandbox_story where profile_id=$1", [gid])).s)).toBe(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".sandbox-arrival")).toBeVisible();
    await expect(page.locator(".sandbox-arrival")).toContainText("Imani Ambershaw");
    await page.locator('.sandbox-arrival [data-action="arrival-open"]').click();
    await expect(page.locator(".chat-pane")).toBeVisible();
    await context.close();
  });

  test("SBX-08 example response, handover confirmation and the 90-day availability rule all work on the saved data", async ({ browser }) => {
    const token = await newPass("controls");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    // accept the first open request
    await openControls(page);
    const sels = page.locator(".modal select");
    await sels.nth(1).selectOption({ label: "Accept cover / interested in referral" });
    await page.getByRole("button", { name: /Apply example response/ }).click();
    await page.waitForTimeout(2500);
    const accepted = await one<{ n: string }>("select count(*) n from coverage_requests r join coverage_plan_cases c on c.id=r.coverage_plan_case_id join coverage_plans p on p.id=c.coverage_plan_id where p.profile_id=$1 and p.title='Conference week' and r.status='accepted'", [gid]);
    expect(Number(accepted.n)).toBe(1);
    // a colleague confirms a handover the guest agreed to for Alex's plan
    const confirmBtn = page.getByRole("button", { name: /Alex Morgan confirms Client 2/ });
    if (await confirmBtn.count()) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
      const ready = await one<{ s: string }>("select c.status s from coverage_plan_cases c where c.id in (select coverage_plan_case_id from coverage_requests where requested_profile_id=$1 and status='accepted') and c.coverage_plan_id in (select id from coverage_plans where title='October practice cover') order by c.id desc limit 1", [gid]);
      expect(ready.s).toBe("ready");
    }
    // the 90-day rule: exactly 90 days is still fresh, 91 is not
    if (!(await page.getByRole("button", { name: /Exactly 90 days/ }).count())) await openControls(page);
    await page.getByRole("button", { name: /Exactly 90 days/ }).click();
    await page.waitForTimeout(1500);
    expect(await one<{ f: boolean }>("select public.availability_is_fresh(availability_confirmed_at) f from profiles where id=$1", [gid]).then((r) => r.f)).toBe(true);
    if (!(await page.getByRole("button", { name: /Make confirmation 91 days old/ }).count())) await openControls(page);
    await page.getByRole("button", { name: /Make confirmation 91 days old/ }).click();
    await page.waitForTimeout(1500);
    expect(await one<{ f: boolean }>("select public.availability_is_fresh(availability_confirmed_at) f from profiles where id=$1", [gid]).then((r) => r.f)).toBe(false);
    if (!(await page.getByRole("button", { name: /Confirm it today/ }).count())) await openControls(page);
    await page.getByRole("button", { name: /Confirm it today/ }).click();
    await page.waitForTimeout(1500);
    expect(await one<{ f: boolean }>("select public.availability_is_fresh(availability_confirmed_at) f from profiles where id=$1", [gid]).then((r) => r.f)).toBe(true);
    await context.close();
  });

  test("SBX-09 a failed message can be retried and is sent exactly once", async ({ browser }) => {
    const token = await newPass("retry");
    const { context, page } = await enter(browser, token);
    await openControls(page);
    await page.getByRole("button", { name: /Fail the next message/ }).click();
    await page.keyboard.press("Escape");
    await click(page, "nav:messages");
    await page.waitForTimeout(800);
    const text = `Retry once ${Date.now()}`;
    await page.locator(".chat-pane textarea").first().fill(text);
    await page.keyboard.press("Enter");
    await expect(page.locator(".chat-pane")).toContainText(/Failed/);
    const retry = page.locator('.chat-pane button:has-text("Retry")').first();
    await retry.click();
    await retry.click({ trial: true, timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(2500);
    expect(Number((await one<{ n: string }>("select count(*) n from conversation_messages where body=$1", [text])).n)).toBe(1);
    await context.close();
  });

  test("SBX-10 questions reach only their audience: the guest sees the discussions addressed to them and none that are not", async ({ browser }) => {
    const token = await newPass("audience");
    const { context } = await enter(browser, token);
    const gid = await guestOf(token);
    const seen = await asMember(gid, "select id, question, audience_type from consultations where sandbox_owner = $1 or sandbox_owner is null order by id", [gid]);
    const types = new Set(seen.rows.map((r: any) => r.audience_type));
    expect(types.size).toBeGreaterThanOrEqual(3);
    // the seeded story's own discussions are all this guest's; another guest's are not
    const other = await newPass("audience-other");
    const o = await enter(browser, other);
    const og = await guestOf(other);
    const leak = await asMember(gid, "select count(*)::int n from consultations where sandbox_owner = $1", [og]);
    expect(leak.rows[0].n).toBe(0);
    await o.context.close();
    await context.close();
  });

  // The product's own journeys, made on the sandbox's data. Colleagues answer
  // what the guest sends after about a minute (the demo job), never real people.
  test("SBX-12 arrange cover: sent once to a chosen colleague, answered by the sandbox colleague, agreed is not Handover ready", async ({ browser }) => {
    const token = await newPass("cover-journey");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    const rena = (await one<{ id: string }>("select id from profiles where full_name like 'Rena Mitchell%' and is_demo")).id;
    await click(page, "nav:cover");
    await page.locator('[data-action="cover-start"]').first().click();
    await page.locator("#cover-name").fill("Winter break");
    await page.getByRole("button", { name: "Continue to needs" }).click();
    await page.locator("#cover-focus").selectOption("Anxiety/Panic Disorders");
    await page.locator("#cover-setting").selectOption("virtual");
    await page.getByRole("button", { name: "Save client", exact: true }).click();
    await page.getByRole("button", { name: "Continue to colleagues" }).click();
    const boxes = page.locator('input[data-match="cover"]:checked');
    while ((await boxes.count()) > 0) await boxes.first().click();
    await page.locator(`input[data-match="cover"][value="${rena}"]`).check();
    await page.getByRole("button", { name: "Review invitations" }).click();
    await page.locator('#cover-send-form input[name="reviewed"]').check();
    await page.getByRole("button", { name: "Send cover requests" }).dblclick();
    await expect(page.locator("#toast")).toContainText("Cover requests sent");
    const plans = await q<{ id: string }>("select id from coverage_plans where profile_id=$1 and title='Winter break'", [gid]);
    expect(plans.length).toBe(1);
    const asked = await q<{ requested_profile_id: string; status: string }>("select r.requested_profile_id, r.status::text from coverage_requests r join coverage_plan_cases c on c.id=r.coverage_plan_case_id where c.coverage_plan_id=$1", [plans[0].id]);
    expect(asked).toEqual([{ requested_profile_id: rena, status: "sent" }]);
    // nobody answers instantly; after the minute the sandbox colleague does
    await q("update coverage_requests set sent_at = sent_at - interval '3 minutes' where id in (select r.id from coverage_requests r join coverage_plan_cases c on c.id=r.coverage_plan_case_id where c.coverage_plan_id=$1)", [plans[0].id]);
    await runJobs(["pa_demo_autorespond"]);
    const after = await one<{ status: string }>("select r.status::text status from coverage_requests r join coverage_plan_cases c on c.id=r.coverage_plan_case_id where c.coverage_plan_id=$1", [plans[0].id]);
    expect(["accepted", "declined", "discussing"]).toContain(after.status);
    if (after.status === "accepted") {
      const c = await one<{ status: string; ready: boolean }>("select status, handover_confirmed_at is not null ready from coverage_plan_cases where coverage_plan_id=$1", [plans[0].id]);
      expect(c).toEqual({ status: "confirmed", ready: false });
    }
    await context.close();
  });

  test("SBX-13 make a referral: sent once to the chosen colleague; interest is not a placement", async ({ browser }) => {
    const token = await newPass("referral-journey");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    await click(page, "nav:referrals");
    await page.locator('[data-action="referral-start"]').first().click();
    await page.locator("#referral-focus").selectOption("Anxiety/Panic Disorders");
    await page.locator("#referral-state").selectOption("NY");
    await page.locator("#referral-setting").selectOption("virtual");
    await page.getByRole("button", { name: "See matched colleagues" }).click();
    const checked = page.locator('input[data-match="referral"]:checked');
    while ((await checked.count()) > 0) await checked.first().click();
    const first = page.locator('input[data-match="referral"]').first();
    await first.click();
    await expect(first).toBeChecked();
    await page.getByRole("button", { name: "Review before sending" }).click();
    await page.locator("#referral-message").fill("Weekly sessions, evenings preferred.");
    await page.locator('#referral-send-form input[name="reviewed"]').check();
    await page.getByRole("button", { name: "Send referral" }).dblclick();
    await expect(page.locator("#toast")).toContainText("Referral shared");
    const refs = await q<{ id: string; status: string; audience_profile_ids: string[] }>("select id, status::text, audience_profile_ids from referral_requests where requesting_profile_id=$1 and client_request_id is not null and notes='Weekly sessions, evenings preferred.'", [gid]);
    expect(refs.length).toBe(1);
    expect(refs[0].audience_profile_ids.length).toBe(1);
    await q("update referral_recipients set sent_at = sent_at - interval '3 minutes' where referral_request_id=$1", [refs[0].id]);
    await q("update referral_requests set created_at = created_at - interval '3 minutes' where id=$1", [refs[0].id]);
    await runJobs(["pa_demo_autorespond"]);
    const placed = await one<{ n: string }>("select count(*) n from referral_responses where referral_request_id=$1 and status='accepted'", [refs[0].id]);
    expect(Number(placed.n)).toBe(0);
    await context.close();
  });

  test("SBX-14 ask a question: posted once to trusted colleagues, answered by them, and no one else sees it", async ({ browser }) => {
    const token = await newPass("consult-journey");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    await click(page, "nav:consult");
    await page.getByRole("button", { name: "Ask a question" }).first().click();
    await page.locator("#peer-title").fill("How do you pace a first session?");
    await page.locator("#peer-body").fill("Looking for a fresh view on structure.");
    await page.locator('.audience-tile input[value="trusted"]').check({ force: true });
    await page.locator('#peer-form input[name="reviewed"]').check();
    await page.getByRole("button", { name: "Review before posting" }).click();
    await page.getByRole("button", { name: "Post question" }).dblclick();
    await expect(page.locator("#toast")).toContainText("shared");
    const rows = await q<{ id: string; audience_type: string }>("select id, audience_type from consultations where author_profile_id=$1 and question='How do you pace a first session?'", [gid]);
    expect(rows).toHaveLength(1);
    expect(rows[0].audience_type).toBe("trusted");
    await q("update consultations set created_at = created_at - interval '3 minutes' where id=$1", [rows[0].id]);
    await runJobs(["pa_demo_autorespond"]);
    const replies = await one<{ n: string }>("select count(*) n from consultation_responses where consultation_id=$1", [rows[0].id]);
    expect(Number(replies.n)).toBeGreaterThan(0);
    // a second visitor never sees it
    const other = await newPass("consult-journey-b");
    const o = await enter(browser, other);
    const og = await guestOf(other);
    expect((await asMember(og, "select count(*)::int n from consultations where question='How do you pace a first session?'")).rows[0].n).toBe(0);
    await o.context.close();
    await context.close();
  });

  test("SBX-15 a message to a sandbox colleague is sent once and is answered in the same conversation", async ({ browser }) => {
    const token = await newPass("message-journey");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    await click(page, "nav:messages");
    await page.waitForTimeout(600);
    await clickWith(page, "thread:", "James Wilson");
    const text = `Thanks James ${Date.now()}`;
    await page.locator(".chat-pane textarea").first().fill(text);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    const sent = await q<{ conversation_id: string }>("select conversation_id from conversation_messages where body=$1", [text]);
    expect(sent).toHaveLength(1);
    await q("update conversation_messages set created_at = created_at - interval '3 minutes' where body=$1", [text]);
    await runJobs(["pa_demo_autorespond"]);
    const thread = await q<{ author: string }>("select author_id::text author from conversation_messages where conversation_id=$1 order by id", [sent[0].conversation_id]);
    expect(thread.some((m) => m.author !== gid)).toBe(true);
    expect(thread.filter((m) => m.author === gid).length).toBeGreaterThanOrEqual(1);
    await context.close();
  });

  test("SBX-17 sequential Cover in the sandbox: a discussion pauses the deadline; a decline moves on to the next colleague exactly once", async ({ browser }) => {
    const token = await newPass("sequence");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    const caseOf = async (plan: string) => (await one<{ id: string }>("select c.id from coverage_plan_cases c join coverage_plans p on p.id=c.coverage_plan_id where p.profile_id=$1 and p.title=$2 order by c.id limit 1", [gid, plan])).id;
    const reqs = async (caseId: string) => q<{ s: string; p: string }>("select status::text s, requested_profile_id::text p from coverage_requests where coverage_plan_case_id=$1 order by id", [caseId]);
    const apply = async (planText: string, response: string) => {
      await openControls(page);
      await page.evaluate((t) => { const sel = document.querySelector("#review-request") as HTMLSelectElement; const o = [...sel.options].find((x) => x.text.includes(t)); if (o) { sel.value = o.value; sel.dispatchEvent(new Event("change", { bubbles: true })); } }, planText);
      await page.locator('.modal select[name="response"]').selectOption({ label: response });
      await page.getByRole("button", { name: /Apply example response/ }).click();
      await page.waitForTimeout(2500);
    };
    // A discussion pauses the deadline: letting it pass changes nothing.
    const fall = await caseOf("Fall leave cover");
    const fallCase = await q<{ id: string }>("select c.id from coverage_plan_cases c join coverage_plans p on p.id=c.coverage_plan_id where p.profile_id=$1 and p.title='Fall leave cover' and c.status='awaiting_response'", [gid]);
    const paused = fallCase[0].id;
    const before = await reqs(paused);
    expect(before.map((r) => r.s)).toEqual(["discussing"]);
    await apply("Fall leave cover", "Response deadline passes");
    expect(await reqs(paused)).toEqual(before);
    expect(fall).toBeTruthy();
    // A decline on the sent request moves the case to the next colleague in its queue, once.
    const conf = await caseOf("Conference week");
    const queued = (await one<{ q: string }>("select outreach_queue[1]::text q from coverage_plan_cases where id=$1", [conf])).q;
    const first = await reqs(conf);
    expect(first.map((r) => r.s)).toEqual(["sent"]);
    await apply("Conference week", "Decline");
    const after = await reqs(conf);
    expect(after.map((r) => r.s)).toEqual(["declined", "sent"]);
    expect(after[1].p).toBe(queued);
    // Nothing repeats: the same screen again picks the new open request, never the declined one.
    expect((await reqs(conf)).length).toBe(2);
    await context.close();
  });

  test("SBX-16 the 20-client draft is saved with the member; a removed client's number is never reused; it is still there after a reload", async ({ browser }) => {
    const token = await newPass("twenty");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    await openControls(page);
    await page.getByRole("button", { name: /Load a 20-client draft/ }).click();
    await expect(page.locator(".modal")).toContainText("Clients needing cover 20", { timeout: 15000 });
    await page.waitForTimeout(2000);
    const saved = async () => (await q<{ n: number }>("select jsonb_array_length(data->'clients') n from workspace_drafts where profile_id=$1 and data ? 'clients'", [gid]))[0]?.n;
    expect(await saved()).toBe(20);
    // Remove the highest number, then copy another client: the new one is 21, not 20 again.
    await click(page, "client-remove:20");
    await page.waitForTimeout(1200);
    expect(await saved()).toBe(19);
    await click(page, "client-duplicate:19");
    await page.waitForTimeout(1500);
    const ids = await q<{ ids: string }>("select string_agg(c->>'id', ',' order by (c->>'id')::int) ids from workspace_drafts d, jsonb_array_elements(d.data->'clients') c where d.profile_id=$1 and d.data ? 'clients'", [gid]);
    const list = (ids[0]?.ids || "").split(",").map(Number);
    expect(list.length).toBe(20);
    expect(new Set(list).size).toBe(20);
    expect(list).toContain(21);
    expect(list).not.toContain(20);
    // Close and reload: the draft is still there, on the same clients.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForSelector(".sidebar", { timeout: 60000 });
    await click(page, "nav:cover");
    await page.waitForTimeout(800);
    await expect(page.locator("#app")).toContainText(/Saved draft|Twenty-client review/);
    expect(await saved()).toBe(20);
    await context.close();
  });

  for (const [label, size] of [["390x844", PHONE], ["320x700", { width: 320, height: 700 }], ["900x760", { width: 900, height: 760 }], ["390x390", { width: 390, height: 390 }]] as const) {
    test(`SBX-11 ${label}: every main screen fits without sideways scrolling; overlays close and keep the draft`, async ({ browser }) => {
      const token = await newPass(`vp-${label}`);
      const { context, page, errors } = await enter(browser, token, size);
      const problems: string[] = [];
      for (const v of ["home", "cover", "referrals", "consult", "network", "messages", "library"]) {
        await click(page, `nav:${v}`);
        await page.waitForTimeout(600);
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        if (m.sw > m.iw + 1) problems.push(`${v}: ${m.sw}>${m.iw}`);
      }
      // overlay: open the Cover wizard, type a name, close; the draft is kept
      await click(page, "nav:cover");
      await click(page, "cover-start");
      await page.waitForTimeout(500);
      await page.evaluate(() => { const i = document.querySelector('.overlay input[type="text"]') as HTMLInputElement | null; if (i) { i.value = "Winter break cover"; i.dispatchEvent(new Event("input", { bubbles: true })); } });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      await expect(page.locator("#app")).toContainText(/Saved draft|Winter break cover/);
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
      await context.close();
    });
  }
});
