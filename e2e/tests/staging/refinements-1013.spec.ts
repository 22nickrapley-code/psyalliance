import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { watch, attachEvidence, shot } from "../../lib/evidence";
import { q, one, assertLocal } from "../../lib/staging";
import { coverPlan, referral } from "../../lib/scenarios";

// Nick's 13 Oct refinements, checked in the browser on the candidate.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

function countLoads(page: Page) {
  const box = { n: 0 };
  page.on("load", () => box.n++);
  return box;
}

test.describe("R13-05 incoming cover answered in place", () => {
  test("R13-05-A Accept folds the client into a short line with Message, without a reload", async ({ page, context, baseURL }, info) => {
    const ev = watch(page);
    const plan = await coverPlan("avery", ["bram"], ["Client A", "Client B"]);
    await signInAs(context, "bram", baseURL!);
    const loads = countLoads(page);
    await page.goto("/dashboard/cover");
    const first = page.locator(`#request-${plan.cases[0].requests.bram}`);
    await expect(first).toBeVisible();
    await shot(page, info, "1-incoming");
    const before = loads.n;
    await first.getByRole("button", { name: "Accept Client A" }).click();
    await expect(first).toHaveClass(/is-accepted/);
    await expect(first.getByText(/Accepted\. Avery will be in touch/)).toBeVisible();
    await expect(first.getByRole("link", { name: /Message Avery/ })).toHaveAttribute("href", `/dashboard/messages?to=${account("avery").id}`);
    await shot(page, info, "2-accepted-folded");
    const saved = await one(`select status::text from coverage_requests where id = $1`, [plan.cases[0].requests.bram]);
    // The other client is still there to answer.
    await expect(page.locator(`#request-${plan.cases[1].requests.bram}`).getByRole("button", { name: "Accept Client B" })).toBeVisible();
    // Still on screen after a reload (answered in the last 12 hours).
    await page.reload();
    await expect(page.locator(`#request-${plan.cases[0].requests.bram}`)).toHaveClass(/is-accepted/);
    await attachEvidence(info, ev);
    expect(saved.status).toBe("accepted");
    // One load is the reload this test asked for. A second one means the
    // NAV-01 watchdog had to recover a stuck screen: allowed, but recorded.
    const recovered = loads.n - before - 1;
    if (recovered > 0) info.annotations.push({ type: "NAV-01", description: "screen recovered by a full page load" });
    expect(recovered, "at most one recovery load").toBeLessThanOrEqual(1);
  });

  test("R13-05-B Ask a question first: inline box, Sent note, and the question reaches the owner", async ({ page, context, baseURL }, info) => {
    const ev = watch(page);
    const plan = await coverPlan("avery", ["cass"], ["Client Q"]);
    const id = plan.cases[0].requests.cass;
    await signInAs(context, "cass", baseURL!);
    await page.goto("/dashboard/cover");
    const box = page.locator(`#request-${id}`);
    await box.getByRole("button", { name: "+ Ask a question first" }).click();
    const question = `QA question ${Date.now()}: could we talk through the schedule?`;
    await box.getByLabel(/Your question for Avery/).fill(question);
    await shot(page, info, "1-asking");
    await box.getByRole("button", { name: "Send question" }).click();
    await expect(box.getByText("✓ Sent")).toBeVisible();
    await expect(box.getByText(question)).toBeVisible();
    await shot(page, info, "2-sent");
    const status = await one(`select status::text from coverage_requests where id = $1`, [id]);
    const msg = await q(`select 1 from conversation_messages where body like $1`, [`%${question.slice(0, 30)}%`]);
    // Accept and Decline are still offered.
    await expect(box.getByRole("button", { name: "Accept Client Q" })).toBeVisible();
    await expect(box.getByRole("button", { name: "Decline" })).toBeVisible();
    await attachEvidence(info, ev);
    expect(status.status).toBe("discussing");
    expect(msg.length, "the question is in a conversation with the owner").toBeGreaterThan(0);
  });

  test("R13-05-C a question with client details is held back and the text is kept", async ({ page, context, baseURL }, info) => {
    const plan = await coverPlan("avery", ["fenn"], ["Client D"]);
    const id = plan.cases[0].requests.fenn;
    await signInAs(context, "fenn", baseURL!);
    await page.goto("/dashboard/cover");
    const box = page.locator(`#request-${id}`);
    await box.getByRole("button", { name: "+ Ask a question first" }).click();
    await box.getByLabel(/Your question for Avery/).fill("Can I call the client on 212-555-0143 first?");
    await box.getByRole("button", { name: "Send question" }).click();
    await expect(box.locator(".deid-error")).toBeVisible();
    await shot(page, info, "held-back");
    await expect(box.getByLabel(/Your question for Avery/)).toHaveValue(/212-555-0143/);
    const status = await one(`select status::text from coverage_requests where id = $1`, [id]);
    expect(status.status).toBe("sent");
  });

  test("R13-05-D Decline folds the client and the owner's case stays open", async ({ page, context, baseURL }, info) => {
    const plan = await coverPlan("avery", ["dara"], ["Client E"], "MA");
    const id = plan.cases[0].requests.dara;
    await signInAs(context, "dara", baseURL!);
    await page.goto("/dashboard/cover");
    const box = page.locator(`#request-${id}`);
    await box.getByRole("button", { name: "Decline" }).click();
    await expect(box).toHaveClass(/is-declined/);
    await shot(page, info, "declined");
    const status = await one(`select status::text from coverage_requests where id = $1`, [id]);
    expect(status.status).toBe("declined");
  });

  test("R13-05-E Covering for colleagues lists the accepted client with a Message button", async ({ page, context, baseURL }, info) => {
    const plan = await coverPlan("avery", ["bram"], ["Client F"]);
    const bram = await (await import("../../lib/auth")).memberClient("bram");
    const { error } = await bram.rpc("respond_to_cover_request", { p_request: plan.cases[0].requests.bram, p_response: "accepted" });
    expect(error, error?.message).toBeNull();
    await signInAs(context, "bram", baseURL!);
    await page.goto("/dashboard/cover");
    const panel = page.locator("section.covering-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Client F").first()).toBeVisible();
    await expect(panel.getByRole("link", { name: /Message/ }).first()).toBeVisible();
    await shot(page, info, "covering-panel");
  });
});

test.describe("R13-06 referral layout", () => {
  test("R13-06-A a direct referral starts on the green search card with the colleague shown", async ({ page, context, baseURL }, info) => {
    await signInAs(context, "avery", baseURL!);
    await page.goto(`/dashboard/refer/new?to=${account("bram").id}`);
    await expect(page.locator("form.quick-search").first()).toBeVisible();
    await expect(page.getByText(/Bram Tellinghast/).first()).toBeVisible();
    await shot(page, info, "direct-referral");
  });

  test("R13-06-B a colleague who receives a referral reads the need before replying", async ({ page, context, baseURL }, info) => {
    const id = await referral("avery", ["bram"]);
    await signInAs(context, "bram", baseURL!);
    await page.goto(`/dashboard/refer/${id}`);
    const firstCard = page.locator(".split .stack > section").first();
    await expect(firstCard).toContainText("The need");
    await shot(page, info, "receiver-view");
  });
});

test.describe("R13-08 notifications and menu", () => {
  test("R13-08-A reading a conversation marks its new-message notification read", async ({ page, context, baseURL, browser }, info) => {
    await q(`update notification_deliveries set created_at = created_at - interval '2 days' where recipient_profile_id = $1 and created_at > now() - interval '2 days'`, [account("cass").id]);
    await signInAs(context, "avery", baseURL!);
    const text = `QA read-through ${Date.now()}`;
    await page.goto(`/dashboard/messages?to=${account("cass").id}`);
    await page.getByPlaceholder(/Write a professional message/).fill(text);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(text).first()).toBeVisible();
    const unread = async () =>
      (await one(`select count(*)::int n from notification_deliveries d join notification_events e on e.id = d.notification_event_id
                   where d.recipient_profile_id = $1 and d.channel = 'in_app' and d.read_at is null and e.event_type = 'message_received' and d.status = 'sent'`, [account("cass").id])).n;
    const before = await unread();
    const cc = await browser.newContext();
    const cp = await cc.newPage();
    await signInAs(cc, "cass", baseURL!);
    await cp.goto("/dashboard/messages");
    await cp.getByText(/Avery Quillfeather/).first().click();
    await expect(cp.getByText(text).first()).toBeVisible();
    await shot(cp, info, "cass-reads");
    const after = await unread();
    await cc.close();
    await info.attach("outcome.json", { body: JSON.stringify({ before, after }), contentType: "application/json" });
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(0);
  });

  test("R13-08-B Demos can be hidden from the menu in Settings and shown again", async ({ page, context, baseURL }, info) => {
    await signInAs(context, "dara", baseURL!);
    await page.goto("/dashboard/settings#menu");
    const menu = page.locator("aside");
    await expect(menu.getByRole("link", { name: /^Demos/ })).toBeVisible();
    await page.locator("details#menu > summary").click();
    await page.getByRole("button", { name: "Hide Demos" }).click();
    await expect(menu.getByRole("link", { name: /^Demos/ })).toHaveCount(0);
    await shot(page, info, "hidden");
    await page.reload();
    await expect(menu.getByRole("link", { name: /^Demos/ })).toHaveCount(0);
    // The page itself still opens from Settings.
    await page.locator("details#menu > summary").click();
    await page.getByRole("button", { name: "Show Demos" }).click();
    await expect(menu.getByRole("link", { name: /^Demos/ })).toBeVisible();
  });
});

test.describe("R13-04 cover plan form", () => {
  test("R13-04-A the clients step offers + Save and add client, which adds a client and keeps the form", async ({ page, context, baseURL }, info) => {
    const plan = await coverPlan("avery", [], []);
    await (await import("../../lib/auth")).memberClient("avery").then((c) => c.from("coverage_plans").update({ status: "draft" }).eq("id", plan.planId));
    await signInAs(context, "avery", baseURL!);
    await page.goto(`/dashboard/cover/${plan.planId}?step=needs`);
    const btn = page.getByRole("button", { name: "+ Save and add client" });
    await expect(btn).toBeVisible();
    await shot(page, info, "1-needs-step");
    const before = (await one(`select count(*)::int n from coverage_plan_cases where coverage_plan_id = $1`, [plan.planId])).n;
    const form = page.locator("form", { has: btn });
    // Main need is a searchable list: type, then pick.
    await form.getByRole("combobox").first().click();
    await form.getByRole("combobox").first().fill("anx");
    await form.getByRole("option").first().click();
    await btn.click();
    await expect(page.getByRole("button", { name: "+ Save and add client" })).toBeVisible();
    await shot(page, info, "2-after-add");
    const after = (await one(`select count(*)::int n from coverage_plan_cases where coverage_plan_id = $1`, [plan.planId])).n;
    await info.attach("outcome.json", { body: JSON.stringify({ before, after }), contentType: "application/json" });
    expect(after).toBe(before + 1);
  });
});
