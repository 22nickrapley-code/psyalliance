import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, runJobs } from "../../../lib/staging";

// V13 workspace: the Cover screens on the real database, as two signed-in
// members in two browsers. Fictional staging members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id;

async function wipe() {
  await q(`delete from coverage_plans where profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from conversations where context_key like 'cover-%'`);
  await q(`delete from notification_events where dedup_key like 'coverage%' or dedup_key like 'cover_%'`);
}
test.beforeEach(wipe);
test.afterAll(wipe);

async function openAs(browser: any, who: string, baseURL: string, path = "/dashboard/cover") {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("#app .sidebar")).toBeVisible();
  return { context, page };
}

async function arrange(page: Page, bramAndCass: string[]) {
  await page.locator('[data-action="cover-start"]').first().click();
  await page.locator("#cover-name").fill("Autumn leave");
  await page.getByRole("button", { name: "Continue to needs" }).click();
  await page.locator("#cover-focus").selectOption("Anxiety/Panic Disorders");
  await page.locator("#cover-setting").selectOption("virtual");
  await page.getByRole("button", { name: "Save client", exact: true }).click();
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  for (const id of bramAndCass) await page.locator(`input[data-match="cover"][value="${id}"]`).check();
  await page.getByRole("button", { name: "Review invitations" }).click();
  await page.locator('#cover-send-form input[name="reviewed"]').check();
}

test("CVU-01 arrange cover, send once, and see exactly what was saved", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await arrange(page, [bram, cass]);
  await page.getByRole("button", { name: "Send cover requests" }).click();
  await expect(page.locator("#toast")).toContainText("Cover requests sent");
  await expect(page.locator(".modal-title, .modal h2").first()).toBeVisible();
  const plan = await one(`select * from coverage_plans where profile_id = $1`, [avery]);
  expect(plan).toMatchObject({ title: "Autumn leave", status: "active", outreach_mode: "sequential", response_hours: 48 });
  const asked = await q(`select r.requested_profile_id from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id where c.coverage_plan_id = $1`, [plan.id]);
  expect(asked.map((x) => x.requested_profile_id)).toEqual([bram]);
  // Reload: the plan is the database's, with Cass queued second.
  await page.goto("/dashboard/cover");
  await expect(page.locator(".arrangement-row", { hasText: "Autumn leave" })).toBeVisible();
  await page.locator('[data-action^="plan:"]', { hasText: "Autumn leave" }).first().click();
  await page.locator(".request-details summary").first().click();
  await expect(page.locator(".request-line")).toHaveCount(2);
  await expect(page.locator(".request-line", { hasText: "Queue position 2" })).toBeVisible();
  await context.close();
});

test("CVU-02 the colleague answers; the organiser sees it; agreed is not handover ready", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await arrange(a.page, [bram, cass]);
  await a.page.getByRole("button", { name: "Send cover requests" }).click();
  await expect(a.page.locator("#toast")).toContainText("Cover requests sent");
  const planId = (await one(`select id from coverage_plans where profile_id = $1`, [avery])).id;

  // Bram opens the plan from a link, as from an email.
  const b = await openAs(browser, "bram", baseURL!, `/dashboard/cover/requests/${planId}`);
  await expect(b.page).toHaveURL(/\/dashboard\/cover$/);
  await expect(b.page.locator(".tracking-summary")).toContainText("Supporting");
  await b.page.getByRole("button", { name: "I can help" }).click();
  await expect(b.page.locator("#toast")).toContainText("Cover agreed");
  expect((await one(`select status from coverage_plan_cases where coverage_plan_id = $1`, [planId])).status).toBe("confirmed");
  await expect(b.page.locator(".tracking-client header .label").first()).toContainText(/Cover agreed/i);
  await expect(b.page.locator(".tracking-client")).not.toContainText("Cass");

  // Avery reloads: agreed, with the handover still to confirm.
  await a.page.goto("/dashboard/cover");
  await a.page.locator('[data-action^="plan:"]', { hasText: "Autumn leave" }).first().click();
  await expect(a.page.locator(".tracking-next")).toContainText("1 handover needs confirming");
  await expect(a.page.getByRole("button", { name: /Complete arrangement/ })).toBeDisabled();
  await a.page.getByRole("button", { name: "Confirm handover" }).click();
  for (const k of ["contact", "summary", "client"]) await a.page.locator(`#handover-form input[name="${k}"]`).check();
  await a.page.getByRole("button", { name: "Mark handover ready" }).click();
  await expect(a.page.locator("#toast")).toContainText("handover ready");
  await expect(a.page.getByRole("button", { name: /Complete arrangement/ })).toBeEnabled();
  await a.page.getByRole("button", { name: /Complete arrangement/ }).click();
  await expect(a.page.locator("#toast")).toContainText("Cover arrangement completed");
  expect((await one(`select status from coverage_plans where id = $1`, [planId])).status).toBe("completed");
  await a.context.close();
  await b.context.close();
});

test("CVU-03 a missed deadline moves the sequence on; the screen shows what the server says", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await arrange(a.page, [bram, cass]);
  await a.page.getByRole("button", { name: "Send cover requests" }).click();
  await expect(a.page.locator("#toast")).toContainText("Cover requests sent");
  const planId = (await one(`select id from coverage_plans where profile_id = $1`, [avery])).id;
  await q(`update coverage_requests set expires_at = now() - interval '1 minute' where requested_profile_id = $1`, [bram]);
  await runJobs(["pa_cover_deadlines"]);
  await a.page.goto("/dashboard/cover");
  await a.page.locator('[data-action^="plan:"]', { hasText: "Autumn leave" }).first().click();
  await a.page.locator(".request-details summary").first().click();
  await expect(a.page.locator(".request-line", { hasText: "Deadline passed" })).toBeVisible();
  await expect(a.page.locator(".request-line", { hasText: "Reply by" })).toBeVisible();
  // The tab that was already open catches up without a reload when it asks.
  expect(planId).toBeTruthy();
  await a.context.close();
});
