import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember, runJobs } from "../../../lib/staging";

// v4 final build (Nick, 6 Nov): the AI switch, smart requests, Ask PsyAlliance, colleague confirmation after a
// discussion, Close, change details, membership. Fictional staging members only. The AI calls go to the local
// stand-in (e2e/staging/ai-mock.mjs) when the app runs with ANTHROPIC_API_URL pointing at it; tests that need it
// skip themselves otherwise.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id;
const MOCK = "http://127.0.0.1:54410";

async function mockUp() {
  try { return (await fetch(`${MOCK}/__calls`)).ok; } catch { return false; }
}
async function mockCalls(): Promise<{ tool: string; text: string }[]> {
  return (await fetch(`${MOCK}/__calls`)).json();
}
async function setAi(on: boolean) {
  await q(`update app_config set value = $1 where key = 'ai_enabled'`, [on ? "true" : "false"]);
}

async function wipe() {
  await setAi(false);
  await q(`delete from ai_usage`);
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from coverage_plans where profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from referral_requests where requesting_profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from conversations where context_key like 'cover-%' or context_key like 'referral-%'`);
  await q(`delete from membership_activations`);
  await q(`delete from founding_places`);
}
test.beforeEach(wipe);
test.afterAll(wipe);

async function openAs(browser: any, who: string, baseURL: string, path = "/dashboard") {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("#app .sidebar")).toBeVisible();
  return { context, page };
}

test("V4-01 AI is off by default: no Ask box, no smart request box, and the server refuses a call", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await expect(page.locator(".hub-ask")).toHaveCount(0);
  await page.locator('[data-action="referral-start"]').first().click();
  await expect(page.locator("#referral-need-form")).toBeVisible();
  await expect(page.locator(".ai-box")).toHaveCount(0);
  const r = await asMember(avery, `select public.ai_status() s`);
  expect(r.rows[0].s.enabled).toBe(false);
  await context.close();
});

test("V4-02 the admin switch turns AI on for this site without a rebuild, and off again", async ({ browser, baseURL }) => {
  const admin = await openAs(browser, "otto", baseURL!, "/dashboard/admin/ai");
  await expect(admin.page.getByRole("heading", { name: "AI", exact: true })).toBeVisible();
  await expect(admin.page.locator(".status").first()).toContainText("Off");
  await admin.page.getByRole("button", { name: "Switch AI on" }).click();
  await expect(admin.page.locator(".banner")).toContainText("AI is on");
  expect((await one(`select value from app_config where key = 'ai_enabled'`)).value).toBe("true");
  const m = await openAs(browser, "avery", baseURL!);
  await expect(m.page.locator(".hub-ask")).toBeVisible();
  await admin.page.getByRole("button", { name: "Switch AI off" }).click();
  await expect(admin.page.locator(".banner")).toContainText("AI is off");
  await m.page.reload();
  await expect(m.page.locator("#app .sidebar")).toBeVisible();
  await expect(m.page.locator(".hub-ask")).toHaveCount(0);
  await admin.context.close();
  await m.context.close();
});

test("V4-03 smart referral: a description fills the form for the member to check; nothing is sent", async ({ browser, baseURL }) => {
  test.skip(!(await mockUp()), "AI stand-in not running");
  await setAi(true);
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator('[data-action="referral-start"]').first().click();
  await page.locator("#ai-text-referral").fill("Teenager with social anxiety in NY, telehealth, Aetna, needs to start within two weeks. Also wants equine therapy.");
  await page.getByRole("button", { name: "Fill in the form" }).click();
  await expect(page.locator(".ai-box .ai-note")).toContainText("Filled in: Main need, State, Age band, Setting");
  await expect(page.locator(".ai-box .ai-note")).toContainText("Not matched");
  await expect(page.locator("#referral-focus")).toHaveValue("Anxiety/Panic Disorders");
  await expect(page.locator("#referral-age")).toHaveValue("Adolescents");
  await expect(page.locator("#referral-setting")).toHaveValue("virtual");
  expect((await q(`select id from referral_requests where requesting_profile_id = $1`, [avery])).length).toBe(0);
  expect((await one(`select smart from ai_usage where profile_id = $1`, [avery])).smart).toBe(1);
  await context.close();
});

test("V4-04 identifying details are refused before they reach the model", async ({ browser, baseURL }) => {
  test.skip(!(await mockUp()), "AI stand-in not running");
  await setAi(true);
  const before = (await mockCalls()).length;
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator('[data-action="referral-start"]').first().click();
  await page.locator("#ai-text-referral").fill("Adult with depression in NY, call her on 617-555-0199");
  await page.getByRole("button", { name: "Fill in the form" }).click();
  await expect(page.locator(".ai-box .ai-err")).toContainText("phone number");
  expect((await mockCalls()).length).toBe(before);
  await context.close();
});

test("V4-05 cover clients from a spreadsheet: name and date columns are left out in the browser, then clients are added", async ({ browser, baseURL }) => {
  test.skip(!(await mockUp()), "AI stand-in not running");
  await setAi(true);
  const file = path.join(os.tmpdir(), `v4-caseload-${Date.now()}.csv`);
  fs.writeFileSync(file, "Client name,DOB,Need,State,Setting\nJane Example,01/02/1990,Depression,NY,virtual\nJohn Sample,03/04/1985,anxiety,MA,in person\n");
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator('[data-action="cover-start"]').first().click();
  await page.locator("#cover-name").fill("Spring leave");
  await page.getByRole("button", { name: "Continue to needs" }).click();
  await page.locator('input[data-ai-file="cover-clients"]').setInputFiles(file);
  await expect(page.locator(".ai-file")).toContainText("columns left out: Client name, DOB");
  await expect(page.locator(".ai-file pre")).not.toContainText("Jane");
  await page.getByRole("button", { name: "Fill in from this file" }).click();
  await expect(page.locator(".ai-box .ai-err")).toContainText("Tick the box");
  await page.locator("#ai-file-ok-cover-clients").check();
  await page.getByRole("button", { name: "Fill in from this file" }).click();
  await expect(page.locator(".ai-box .ai-note")).toContainText("Added 2 clients");
  await expect(page.locator(".client-discs .cdisc")).toHaveCount(2);
  const last = (await mockCalls()).at(-1)!;
  expect(last.tool).toBe("fill_cover_clients");
  expect(last.text).not.toMatch(/Jane|John|1990|1985/);
  await context.close();
  fs.unlinkSync(file);
});

test("V4-06 Ask PsyAlliance answers with sources, drops made-up ones, and lists colleagues by the usual rules", async ({ browser, baseURL }) => {
  test.skip(!(await mockUp()), "AI stand-in not running");
  await setAi(true);
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator("#hub-ask-input").fill("Who could cover an adult with depression in NY?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".hub-ask-answer")).toContainText("usual rules");
  await expect(page.locator(".hub-ask-sources a")).toHaveText(["Cover"]);
  await expect(page.locator(".hub-ask-matches li").first()).toBeVisible();
  await page.locator("#hub-ask-input").fill("What is my continuity plan for?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".hub-ask-sources a")).toHaveText(["Continuity plan"]);
  await page.locator("#hub-ask-input").fill("Tell me something");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".hub-ask-answer")).toContainText("I don't know that");
  await context.close();
});

test("V4-07 the 20-a-day allowance is enforced on the server", async () => {
  await setAi(true);
  await q(`insert into ai_usage (profile_id, day, uses) values ($1, (now() at time zone 'America/New_York')::date, 20)`, [avery]);
  await expect(asMember(avery, `select public.ai_take('ask')`)).rejects.toThrow(/today's 20 AI requests/);
});

async function sendCover(page: Page, who: string[]) {
  await page.locator('[data-action="cover-start"]').first().click();
  await page.locator("#cover-name").fill("Autumn leave");
  await page.getByRole("button", { name: "Continue to needs" }).click();
  await page.locator("#cover-focus").selectOption("Anxiety/Panic Disorders");
  await page.locator("#cover-setting").selectOption("virtual");
  await page.getByRole("button", { name: "Save client", exact: true }).click();
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  for (const id of who) await page.locator(`input[data-match="cover"][value="${id}"]`).check();
  await page.getByRole("button", { name: "Review invitations" }).click();
  await page.locator('#cover-send-form input[name="reviewed"]').check();
  await page.getByRole("button", { name: "Send cover requests" }).click();
  await expect(page.locator("#toast")).toContainText("Cover requests sent");
}

test("V4-08 after a discussion, Cover agreed waits for the colleague to confirm; their Confirm makes it count", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  await sendCover(a.page, [bram]);
  const req = await one(`select r.id from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id join coverage_plans p on p.id = c.coverage_plan_id where p.profile_id = $1`, [avery]);
  await asMember(bram, `select public.cover_answer($1, 'discussing', 'Mornings only?', null)`, [req.id]);
  await a.page.goto("/dashboard/cover");
  await a.page.locator('[data-action^="plan:"]', { hasText: "Autumn leave" }).first().click();
  await a.page.locator(".cover-client-card").getByRole("button", { name: "Cover agreed" }).first().click();
  await expect(a.page.locator(".modal")).toContainText("asked to confirm with one tap");
  await a.page.getByRole("button", { name: "Cover agreed: ask them to confirm" }).click();
  await expect(a.page.locator("#toast")).toContainText("Sent to Bram Tellinghast to confirm");
  await expect(a.page.locator(".cover-client-card")).toContainText("Waiting for confirmation");
  expect((await one(`select assigned_clinician_id from coverage_plan_cases c join coverage_plans p on p.id = c.coverage_plan_id where p.profile_id = $1`, [avery])).assigned_clinician_id).toBeNull();

  const b = await openAs(browser, "bram", baseURL!);
  await b.page.locator(".hub-attn-toggle").click();
  await expect(b.page.locator(".hub-row", { hasText: "confirm you agreed to cover" })).toBeVisible();
  await b.page.locator(".hub-row", { hasText: "confirm you agreed to cover" }).getByRole("button", { name: "Confirm", exact: true }).click();
  await b.page.locator(".incoming-response.is-confirm").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(b.page.locator("#toast")).toContainText("Confirmed");
  expect((await one(`select assigned_clinician_id from coverage_plan_cases c join coverage_plans p on p.id = c.coverage_plan_id where p.profile_id = $1`, [avery])).assigned_clinician_id).toBe(bram);
  await a.context.close();
  await b.context.close();
});

test("V4-09 the colleague offered, so Cover agreed counts at once; 48 hours without a confirmation comes back to the member", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  await sendCover(a.page, [bram]);
  const req = await one(`select r.id from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id join coverage_plans p on p.id = c.coverage_plan_id where p.profile_id = $1`, [avery]);
  await asMember(bram, `select public.cover_answer($1, 'discussing', 'Mornings?', null)`, [req.id]);
  await asMember(avery, `select public.cover_confirm($1)`, [req.id]);
  await q(`update coverage_requests set owner_agreed_at = now() - interval '49 hours' where id = $1`, [req.id]);
  await runJobs(["pa_agreement_deadlines"]);
  await a.page.goto("/dashboard");
  await a.page.locator(".hub-attn-toggle").click();
  await expect(a.page.locator(".hub-row", { hasText: "hasn’t confirmed" })).toBeVisible();
  await a.page.goto("/dashboard/cover");
  await a.page.locator('[data-action^="plan:"]', { hasText: "Autumn leave" }).first().click();
  await expect(a.page.locator(".cover-client-card")).toContainText("Not confirmed after 48 hours");
  await expect(a.page.locator(".cover-client-card").getByRole("button", { name: "Ask again" }).first()).toBeVisible();
  // Bram now offers: choosing him is immediate.
  await asMember(bram, `select public.cover_answer($1, 'interested', null, null)`, [req.id]);
  const res = await asMember(avery, `select public.cover_confirm($1) r`, [req.id]);
  expect(res.rows[0].r.pending ?? false).toBe(false);
  expect((await one(`select assigned_clinician_id from coverage_plan_cases c join coverage_plans p on p.id = c.coverage_plan_id where p.profile_id = $1`, [avery])).assigned_clinician_id).toBe(bram);
  await a.context.close();
});

test("V4-10 change details on a sent referral; Close moves a placed referral to Completed", async ({ browser, baseURL }) => {
  const made = await asMember(avery, `select public.referral_create($1::jsonb) r`, [JSON.stringify({
    focus: "Depression", state: "NY", setting: "virtual", audience: "selected", selected: [bram], timeframe: "Within a month", mode: "parallel", deadline: 48 })]);
  const ref = Number(made.rows[0].r.referralId);
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/referrals");
  await page.locator(`[data-action="referral:${ref}"]`).first().click();
  await page.getByRole("button", { name: "Change details" }).click();
  await page.locator("#rc-timeframe").selectOption("As soon as possible");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("#toast")).toContainText("Everyone still part of this referral was told");
  await expect(page.locator(".changed-note")).toContainText("Details changed");
  expect((await one(`select timeframe from referral_requests where id = $1`, [ref])).timeframe).toBe("urgent");
  await asMember(bram, `select public.referral_answer($1, 'interested', true, null, null)`, [ref]);
  await asMember(avery, `select public.referral_place($1, $2)`, [ref, bram]);
  await page.goto("/dashboard/referrals");
  await page.locator('[data-action="referral-filter:discussion"]').click();
  await expect(page.locator(`[data-action="referral:${ref}"]`).first()).toBeVisible();
  await page.locator(`[data-action="referral:${ref}"]`).first().click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("Moved to Completed");
  await page.locator('[data-action="referral-filter:placed"]').click();
  await expect(page.locator(`[data-action="referral:${ref}"]`).first()).toBeVisible();
  await context.close();
});

test("V4-11 membership: a verified member activates from Actions and becomes a founding member; nothing is charged", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator(".hub-attn-toggle").click();
  const row = page.locator(".hub-row", { hasText: "Activate your membership" });
  await expect(row).toContainText("free for life");
  await row.getByRole("button", { name: "Do now" }).click();
  await expect(page.locator(".membership-offer")).toContainText("Founding member");
  await page.getByRole("button", { name: "Activate membership" }).click();
  await expect(page.locator("#toast")).toContainText("founding member #1");
  const a = await one(`select plan, price_cents from membership_activations where profile_id = $1`, [avery]);
  expect(a).toMatchObject({ plan: "founding", price_cents: 0 });
  await context.close();
});

test("V4-12 a whole-network referral waits while the state builds its founding circle", async () => {
  // Staging runs the rest of the suite with NY's circle complete; this test puts NY back to building, then restores it.
  const before = (await one(`select founding_circle from open_states where state = 'NY'`)).founding_circle;
  await q(`update open_states set founding_circle = true where state = 'NY'`);
  try {
  await expect(asMember(avery, `select public.referral_create($1::jsonb)`, [JSON.stringify({
    focus: "Depression", state: "NY", setting: "virtual", audience: "network", timeframe: "Within a month", mode: "parallel", deadline: 48 })])).rejects.toThrow(/founding circle/);
  } finally {
    await q(`update open_states set founding_circle = $1 where state = 'NY'`, [before]);
  }
});
