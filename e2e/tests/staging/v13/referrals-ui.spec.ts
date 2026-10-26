import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one } from "../../../lib/staging";

// V13 workspace: the Referral screens on the real database, as signed-in
// members in separate browsers. Fictional staging members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id;

async function wipe() {
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from referral_requests where requesting_profile_id = $1 and client_request_id is not null`, [avery]);
  await q(`delete from conversations where context_key like 'referral-%'`);
  await q(`delete from notification_events where dedup_key like 'referral%' or dedup_key like 'message:%'`);
  await q(`delete from professional_events where event_type in ('referral_sent', 'referral_response', 'referral_outcome', 'professional_relationship_created') and actor_profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
}
test.beforeEach(wipe);
test.afterAll(wipe);

async function openAs(browser: any, who: string, baseURL: string, path = "/dashboard/referrals") {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("#app .sidebar")).toBeVisible();
  return { context, page };
}

// Avery makes a referral for an anxiety need in New York, asking Bram and Cass.
async function makeReferral(page: Page, ids = [bram, cass]) {
  await page.locator('[data-action="referral-start"]').first().click();
  await page.locator("#referral-focus").selectOption("Anxiety/Panic Disorders");
  await page.locator("#referral-state").selectOption("NY");
  await page.locator("#referral-setting").selectOption("virtual");
  await page.getByRole("button", { name: "See matched colleagues" }).click();
  const boxes = page.locator('input[data-match="referral"]:checked');
  // The list redraws on every change, so click and look again rather than assert on one element.
  while ((await boxes.count()) > 0) await boxes.first().click();
  for (const id of ids) {
    await page.locator(`input[data-match="referral"][value="${id}"]`).click();
    await expect(page.locator(`input[data-match="referral"][value="${id}"]`)).toBeChecked();
  }
  await page.getByRole("button", { name: "Review before sending" }).click();
  await page.locator("#referral-message").fill("Weekly sessions, evenings preferred.");
  await page.locator('#referral-send-form input[name="reviewed"]').check();
}

test("RFU-01 make a referral once, and see exactly what was saved after a reload", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await makeReferral(a.page);
  await a.page.getByRole("button", { name: "Send referral" }).click();
  await expect(a.page.locator("#toast")).toContainText("Referral shared");
  await expect(a.page.locator(".modal-title, .modal h2").first()).toBeVisible();
  const ref = await one(`select * from referral_requests where requesting_profile_id = $1 and client_request_id is not null`, [avery]);
  expect(ref).toMatchObject({ status: "sent", state: "NY", modality: "virtual", audience_type: "selected", timeframe: "within_month", notes: "Weekly sessions, evenings preferred." });
  expect(ref.audience_profile_ids.sort()).toEqual([bram, cass].sort());
  await a.page.goto("/dashboard/referrals");
  await expect(a.page.locator(".arrangement-row", { hasText: "Anxiety/Panic Disorders" }).first()).toBeVisible();
  await expect(a.page.locator(".arrangement-row", { hasText: "Awaiting replies" }).first()).toBeVisible();
  await a.context.close();
});

test("RFU-02 a colleague opens the link, is interested with capacity confirmed; the referrer places; interest is not placement", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await makeReferral(a.page);
  await a.page.getByRole("button", { name: "Send referral" }).click();
  await expect(a.page.locator("#toast")).toContainText("Referral shared");
  const refId = Number((await one(`select id from referral_requests where requesting_profile_id = $1 and client_request_id is not null`, [avery])).id);

  // Bram opens the link from the earlier product (as from an old email).
  const b = await openAs(browser, "bram", baseURL!, `/dashboard/refer/${refId}`);
  await expect(b.page).toHaveURL(/\/dashboard\/referrals$/);
  await expect(b.page.locator(".referral-sender")).toContainText("Avery Quillfeather");
  await expect(b.page.locator(".modal")).not.toContainText("Cass");
  await b.page.getByRole("button", { name: "I’m interested" }).click();
  await b.page.locator('#referral-capacity-form input[name="capacity"]').check();
  await b.page.getByRole("button", { name: "Confirm & express interest" }).click();
  await expect(b.page.locator("#toast")).toContainText("Interest recorded");
  const resp = await one(`select status, capacity_confirmed_at from referral_responses where referral_request_id = $1 and responding_profile_id = $2`, [refId, bram]);
  expect(resp.status).toBe("interested");
  expect(resp.capacity_confirmed_at).not.toBeNull();
  expect((await one(`select status from referral_requests where id = $1`, [refId])).status).toBe("sent");

  // Avery reloads: one colleague interested, nothing placed yet.
  await a.page.goto("/dashboard/referrals");
  await expect(a.page.locator(".arrangement-row", { hasText: "1 interested" }).first()).toBeVisible();
  await a.page.locator(`[data-action="referral:${refId}"]`).first().click();
  await expect(a.page.locator(".referral-journey")).toContainText("Client placement is not yet confirmed");
  await a.page.getByRole("button", { name: "Choose colleague" }).click();
  await a.page.getByRole("button", { name: "Confirm placement" }).click();
  await expect(a.page.locator("#toast")).toContainText("Referral placed");
  expect((await one(`select status from referral_requests where id = $1`, [refId])).status).toBe("connected");
  expect((await one(`select status from referral_responses where referral_request_id = $1 and responding_profile_id = $2`, [refId, bram])).status).toBe("accepted");
  await expect(a.page.locator(".closed-banner")).toContainText("Placed with Bram Tellinghast");

  // Cass, who was also asked, sees only that it has been placed elsewhere.
  const c = await openAs(browser, "cass", baseURL!, `/dashboard/refer/${refId}`);
  await expect(c.page.locator(".closed-banner")).toContainText("Placed with another colleague");
  await expect(c.page.locator(".modal")).not.toContainText("Bram");
  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test("RFU-03 ask first, then the referrer withdraws; replies and the conversation are kept", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await makeReferral(a.page);
  await a.page.getByRole("button", { name: "Send referral" }).click();
  await expect(a.page.locator("#toast")).toContainText("Referral shared");
  const refId = Number((await one(`select id from referral_requests where requesting_profile_id = $1 and client_request_id is not null`, [avery])).id);

  const c = await openAs(browser, "cass", baseURL!, `/dashboard/refer/${refId}`);
  await c.page.getByRole("button", { name: "Discuss first" }).click();
  await c.page.locator("#question-text").fill("Do you need weekday evenings?");
  await c.page.getByRole("button", { name: "Send question" }).click();
  await expect(c.page.locator("#toast")).toContainText("Your question is in");
  expect((await one(`select status from referral_responses where referral_request_id = $1 and responding_profile_id = $2`, [refId, cass])).status).toBe("question");
  const msgs = await q(`select m.body from conversation_messages m join conversations c on c.id = m.conversation_id where c.context_key = $1 order by m.created_at, m.id`, [`referral-${refId}-${cass}`]);
  expect(msgs.map((m) => m.body)).toEqual(["Weekly sessions, evenings preferred.", "Do you need weekday evenings?"]);

  await a.page.goto("/dashboard/referrals");
  await a.page.locator(`[data-action="referral:${refId}"]`).first().click();
  await a.page.getByRole("button", { name: /Withdraw referral/ }).click();
  await a.page.getByRole("button", { name: "Withdraw referral" }).last().click();
  await expect(a.page.locator("#toast")).toContainText("Referral withdrawn");
  const row = await one(`select status, withdrawn_at from referral_requests where id = $1`, [refId]);
  expect(row.status).toBe("closed");
  expect(row.withdrawn_at).not.toBeNull();
  expect((await q(`select 1 from referral_responses where referral_request_id = $1`, [refId])).length).toBe(1);
  expect((await q(`select 1 from conversation_messages m join conversations c on c.id = m.conversation_id where c.context_key = $1`, [`referral-${refId}-${cass}`])).length).toBe(2);
  await c.page.goto("/dashboard/referrals");
  await expect(c.page.locator(".arrangement-row", { hasText: "Withdrawn" }).first()).toBeVisible();
  await a.context.close();
  await c.context.close();
});
