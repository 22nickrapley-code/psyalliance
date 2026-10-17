import { test, expect, type Page } from "@playwright/test";
import { signInAs, account, memberClient } from "../../lib/auth";
import { watch, attachEvidence, shot } from "../../lib/evidence";
import { q, one, assertLocal, inbox } from "../../lib/staging";

// End-to-end journeys through the real screens, one member at a time, with
// the colleague's side checked in the database or in a second browser.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function pickNeed(page: Page, scope = page.locator("form#add-client"), text = "anx") {
  const box = scope.getByRole("combobox").first();
  await box.click();
  await box.fill(text);
  await scope.getByRole("option").first().click();
}

test.describe("J-COVER plan cover from start to covered", () => {
  test("J-COVER-01 plan, describe two clients, choose colleagues, send, and see a client covered", async ({ page, context, baseURL, browser }, info) => {
    const ev = watch(page);
    await signInAs(context, "avery", baseURL!);
    await page.goto("/dashboard/cover/new");
    await page.locator('input[name="absence_type"]').first().check();
    const title = `QA journey leave ${Date.now()}`;
    await page.locator('input[name="title"]').fill(title);
    await page.locator('input[name="starts_on"]').fill(day(14));
    await page.locator('input[name="ends_on"]').fill(day(42));
    await page.locator('select[name="state"]').selectOption("NY");
    await shot(page, info, "1-plan");
    await page.getByRole("button", { name: /Define the needs/ }).click();
    await expect(page.getByRole("button", { name: "+ Save and add client" })).toBeVisible();
    const planId = Number(new URL(page.url()).pathname.split("/").pop());
    for (let n = 0; n < 2; n++) {
      await pickNeed(page);
      await page.getByRole("button", { name: "+ Save and add client" }).click();
      await expect(page.locator("form#add-client h3")).toHaveText(`Client ${n + 2}`);
    }
    await shot(page, info, "2-two-clients");
    await page.getByRole("link", { name: /Find colleagues/ }).click();
    await expect(page.getByRole("button", { name: /Review invitations/ })).toBeVisible();
    const ticked = await page.locator('input[type="checkbox"][name^="pick_"]:checked').count();
    await shot(page, info, "3-candidates");
    expect(ticked, "a first choice is ticked for each client").toBeGreaterThanOrEqual(2);
    await page.getByRole("button", { name: /Review invitations/ }).click();
    await page.locator('input[name="reviewed"]').check();
    await shot(page, info, "4-review");
    await page.getByRole("button", { name: "Send cover requests" }).click();
    await page.waitForURL(/step=track|\/dashboard\/cover\/\d+$/);
    await shot(page, info, "5-track");
    const reqs = await q(`select r.id, r.status::text, r.requested_profile_id::text who from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id where c.coverage_plan_id = $1`, [planId]);
    expect(reqs.length, "requests were sent").toBeGreaterThanOrEqual(2);
    expect(reqs.every((r: any) => r.status === "sent")).toBe(true);
    // The first colleague accepts in their own browser.
    const who = reqs[0].who as string;
    const key = ["bram", "cass", "fenn"].find((k) => account(k).id === who)!;
    const cc = await browser.newContext();
    const cp = await cc.newPage();
    await signInAs(cc, key, baseURL!);
    await cp.goto("/dashboard/cover");
    await cp.locator(`#request-${reqs[0].id}`).getByRole("button", { name: /^Accept/ }).click();
    await expect(cp.locator(`#request-${reqs[0].id}`)).toHaveClass(/is-accepted/);
    await cc.close();
    await page.reload();
    await shot(page, info, "6-owner-sees-cover");
    await expect(page.getByText(/covered/i).first()).toBeVisible();
    const state = await one(`select count(*) filter (where status = 'confirmed')::int covered from coverage_plan_cases where coverage_plan_id = $1`, [planId]);
    await attachEvidence(info, ev);
    expect(state.covered).toBeGreaterThanOrEqual(1);
  });
});

test.describe("J-REFER refer a client from need to chosen colleague", () => {
  test("J-REFER-01 describe the need, choose two colleagues, send; a colleague is interested; choose them", async ({ page, context, baseURL, browser }, info) => {
    const ev = watch(page);
    await signInAs(context, "avery", baseURL!);
    await page.goto("/dashboard/refer/new?focus=7&state=NY&step=shortlist");
    const boxes = page.locator('input[type="checkbox"][name="pick"]');
    await expect(boxes.first()).toBeVisible();
    const n = await boxes.count();
    for (let i = 2; i < n; i++) await boxes.nth(i).uncheck({ force: true });
    await page.getByRole("button", { name: /Review before sending/ }).click();
    await expect(page.getByText(/Selected colleagues \(2\)/)).toBeVisible();
    await page.locator('textarea[name="notes"]').fill("Prefers evening telehealth.").catch(() => null);
    const confirm = page.locator('input[type="checkbox"][name*="deident"], input[type="checkbox"][name="confirm"], input[type="checkbox"][name="no_identifiers"]').first();
    if (await confirm.count()) await confirm.check();
    else await page.getByText(/contains no client-identifying information/).click();
    await shot(page, info, "1-review");
    await page.getByRole("button", { name: "Send referral" }).click();
    await page.waitForURL(/\/dashboard\/refer\/\d+/);
    const refId = Number(new URL(page.url()).pathname.split("/").pop());
    await shot(page, info, "2-sent");
    const audience = (await one(`select audience_profile_ids::text[] ids from referral_requests where id = $1`, [refId])).ids as string[];
    expect(audience).toHaveLength(2);
    // A colleague replies Interested from their own browser.
    const key = ["bram", "cass", "fenn"].find((k) => audience.includes(account(k).id))!;
    const cc = await browser.newContext();
    const cp = await cc.newPage();
    await signInAs(cc, key, baseURL!);
    await cp.goto(`/dashboard/refer/${refId}`);
    await shot(cp, info, "3-colleague-view");
    await cp.locator('input[name="response"][value="interested"]').check();
    await cp.getByRole("button", { name: "Send reply" }).click();
    await cp.waitForLoadState("networkidle");
    await shot(cp, info, "3b-replied");
    await cc.close();
    const resp = await one(`select status from referral_responses where referral_request_id = $1 and responding_profile_id = $2`, [refId, account(key).id]);
    expect(resp.status).toBe("interested");
    // The owner chooses them.
    await page.reload();
    await shot(page, info, "4-owner-sees-interest");
    await page.getByRole("button", { name: "Choose and start handoff" }).first().click();
    await page.waitForLoadState("networkidle");
    await shot(page, info, "5-chosen");
    const after = await one(`select r.status, (select count(*)::int from referral_responses x where x.referral_request_id = r.id and x.status = 'accepted') chosen from referral_requests r where r.id = $1`, [refId]);
    await attachEvidence(info, ev);
    expect(after.chosen).toBe(1);
    expect(after.status).toBe("connected");
  });
});

test.describe("J-CONSULT ask colleagues a practice question", () => {
  test("J-CONSULT-01 ask the verified network; review; post; a colleague replies; the author marks it useful", async ({ page, context, baseURL, browser }, info) => {
    const ev = watch(page);
    await signInAs(context, "avery", baseURL!);
    await page.goto("/dashboard/consult/new");
    const question = `QA consult ${Date.now()}: how do you structure a first telehealth session for panic disorder?`;
    await page.locator('input[name="question"]').fill(question);
    await page.getByRole("radio", { name: /The verified network/ }).click();
    await page.locator('input[name="deidentified"]').check();
    await shot(page, info, "1-ask");
    await page.getByRole("button", { name: /Review before posting/ }).click();
    await shot(page, info, "2-review");
    await page.getByRole("button", { name: "Post it" }).click();
    await page.waitForURL(/\/dashboard\/consult\/\d+(\?|$)/);
    const id = Number(new URL(page.url()).pathname.split("/").pop());
    const c = await one(`select status, audience_type from consultations where id = $1`, [id]);
    expect(c.audience_type).toBe("wider_network");
    // A colleague replies from their own browser.
    const cc = await browser.newContext();
    const cp = await cc.newPage();
    await signInAs(cc, "fenn", baseURL!);
    await cp.goto(`/dashboard/consult/${id}`);
    await cp.locator("form", { has: cp.getByRole("button", { name: "Post reply" }) }).locator("textarea").fill("QA reply: start with psychoeducation and a shared plan for between-session practice.");
    await cp.getByRole("button", { name: "Post reply" }).click();
    await expect(cp.getByText(/QA reply: start with psychoeducation/).first()).toBeVisible();
    await shot(cp, info, "3-reply");
    await cc.close();
    await page.reload();
    await page.getByRole("button", { name: "Mark useful" }).first().click();
    await expect(page.getByRole("button", { name: /✓ Useful/ }).first()).toBeVisible();
    await shot(page, info, "4-useful");
    const saved = await one(`select count(*) filter (where marked_useful)::int n from consultation_responses where consultation_id = $1`, [id]);
    await attachEvidence(info, ev);
    expect(saved.n).toBe(1);
  });
});
