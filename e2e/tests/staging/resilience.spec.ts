import { test, expect, type Page } from "@playwright/test";
import { signInAs, account, memberClient } from "../../lib/auth";
import { watch, attachEvidence, shot } from "../../lib/evidence";
import { q, one, assertLocal, inbox, gatewayFault, providerScenario, providerSent } from "../../lib/staging";
import { coverPlan } from "../../lib/scenarios";

// Resilience: two people at once, double presses, failures between the
// app and its services, and the email provider misbehaving. Staging only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.afterEach(async () => {
  await gatewayFault({ clear: true });
});

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 20000): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!ok(v) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 500));
    v = await fn();
  }
  return v;
}

test.describe("RES-CONC two people, one moment", () => {
  test("RES-CONC-01 two colleagues press Accept for the same client at the same moment: one is covering, the other is told", async ({ browser, baseURL }, info) => {
    const plan = await coverPlan("avery", ["bram", "cass"], ["Client C"]);
    const pages: Page[] = [];
    for (const k of ["bram", "cass"]) {
      const c = await browser.newContext();
      await signInAs(c, k, baseURL!);
      const p = await c.newPage();
      await p.goto(`/dashboard/cover/requests/${plan.planId}`);
      await expect(p.locator(`#request-${plan.cases[0].requests[k]}`)).toBeVisible();
      pages.push(p);
    }
    await Promise.all(pages.map((p, i) => p.locator(`#request-${plan.cases[0].requests[["bram", "cass"][i]]}`).getByRole("button", { name: /^Accept/ }).click()));
    await Promise.all(pages.map((p) => p.waitForTimeout(1500)));
    const texts = await Promise.all(pages.map((p, i) => p.locator(`#request-${plan.cases[0].requests[["bram", "cass"][i]]}`).innerText()));
    for (const [i, p] of pages.entries()) await shot(p, info, `${["bram", "cass"][i]}`);
    const rows = await q(`select status::text from coverage_requests where coverage_plan_case_id = $1`, [plan.cases[0].id]);
    await info.attach("outcome.json", { body: JSON.stringify({ rows, texts }, null, 2), contentType: "application/json" });
    for (const p of pages) await p.context().close();
    expect(rows.filter((r: any) => r.status === "accepted")).toHaveLength(1);
    expect(texts.some((t) => /Accepted\./.test(t))).toBe(true);
    expect(texts.some((t) => /already taken on|Closed/.test(t)), "the second colleague is told").toBe(true);
  });

  test("RES-CONC-02 a double click on Send posts the message once", async ({ page, context, baseURL }, info) => {
    await signInAs(context, "avery", baseURL!);
    await page.goto(`/dashboard/messages?to=${account("fenn").id}`);
    const text = `QA double click ${Date.now()}`;
    await page.getByPlaceholder(/Write a professional message/).fill(text);
    await page.getByRole("button", { name: "Send" }).dblclick();
    await page.waitForTimeout(4000);
    await shot(page, info, "after");
    const n = (await one(`select count(*)::int n from conversation_messages where body = $1`, [text])).n;
    expect(n).toBe(1);
  });
});

test.describe("RES-FAULT the database or a service fails mid-save", () => {
  test("RES-FAULT-01 a message that can't be saved says so and keeps the text", async ({ page, context, baseURL }, info) => {
    const ev = watch(page);
    await signInAs(context, "avery", baseURL!);
    await page.goto(`/dashboard/messages?to=${account("cass").id}`);
    const text = `QA fault ${Date.now()}: this should not be lost.`;
    await page.getByPlaceholder(/Write a professional message/).fill(text);
    await gatewayFault({ path: "/rest/v1/conversation_messages", method: "POST", status: 503, times: 3 });
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/wasn.t sent|couldn.t|try again/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/Write a professional message/)).toHaveValue(text);
    await shot(page, info, "after-fault");
    const body = await page.locator("body").innerText();
    const saved = (await one(`select count(*)::int n from conversation_messages where body = $1`, [text])).n;
    const field = await page.getByPlaceholder(/Write a professional message/).inputValue().catch(() => "");
    await info.attach("outcome.json", { body: JSON.stringify({ saved, fieldKeptText: field === text, errorShown: /wasn.t sent|try again/i.test(body), errorScreen: /Something went wrong|didn.t load/i.test(body) }, null, 2), contentType: "application/json" });
    await attachEvidence(info, ev);
    expect(saved, "nothing half-saved").toBe(0);
    expect(body, "an error is shown, not a crash screen").not.toMatch(/Something went wrong|The page didn.t load completely/i);
    expect(body, "no database wording").not.toMatch(/Injected failure|violates|PGRST|permission denied/i);
  });

  test("RES-FAULT-02 an Accept that fails to reach the database shows an error and can be tried again", async ({ page, context, baseURL }, info) => {
    const plan = await coverPlan("avery", ["fenn"], ["Client F2"]);
    const id = plan.cases[0].requests.fenn;
    await signInAs(context, "fenn", baseURL!);
    await page.goto(`/dashboard/cover/requests/${plan.planId}`);
    const box = page.locator(`#request-${id}`);
    await gatewayFault({ path: "/rest/v1/rpc/respond_to_cover_request", method: "POST", status: 503, times: 1 });
    await box.getByRole("button", { name: /^Accept/ }).click();
    await expect(box.locator(".deid-error, [role=alert]").first()).toBeVisible();
    await shot(page, info, "1-error");
    expect((await one(`select status::text from coverage_requests where id = $1`, [id])).status).toBe("sent");
    await box.getByRole("button", { name: /^Accept/ }).click();
    await expect(box).toHaveClass(/tone-green/);
    await shot(page, info, "2-retried");
    expect((await one(`select status::text from coverage_requests where id = $1`, [id])).status).toBe("accepted");
  });

  test("RES-FAULT-03 a slow database (3 seconds) still loads Home", async ({ page, context, baseURL }, info) => {
    await signInAs(context, "avery", baseURL!);
    await gatewayFault({ path: "/rest/v1/", pass: true, delayMs: 3000, times: 200 } as any);
    const t0 = Date.now();
    await page.goto("/dashboard");
    await expect(page.locator("main")).toContainText(/Avery|Home|Welcome/);
    const ms = Date.now() - t0;
    await shot(page, info, "slow-home");
    await info.attach("timing.json", { body: JSON.stringify({ ms }), contentType: "application/json" });
    expect(ms, "slower, but it loads").toBeGreaterThan(3000);
  });
});

test.describe("RES-EMAIL the email provider misbehaves", () => {
  async function queueEmailTo(key: string) {
    // Other tests' queued emails wait, so each scenario hits this one.
    await q(`update notification_deliveries set send_after = now() + interval '1 day' where channel = 'email' and status = 'pending'`);
    // A due email for one member, as the app queues it (fictional).
    const avery = await memberClient("avery");
    const now = new Date().toISOString();
    const dedup = `qa-res-email-${Date.now()}-${key}`;
    const { error } = await avery.rpc("raise_notification", {
      p_event_type: "message_received",
      p_summary: "QA: a fictional message for an email test.",
      p_deep_link: "/dashboard/messages",
      p_dedup_key: dedup,
      p_metadata: {},
      p_actor_type: "member_web",
      p_deliveries: [{ recipient: account(key).id, channel: "email", status: "pending", delivered_at: null, send_after: now }],
    });
    expect(error, error?.message).toBeNull();
    return (await one(`select d.id from notification_deliveries d join notification_events e on e.id = d.notification_event_id where e.dedup_key = $1`, [dedup])).id as number;
  }
  // The queue worker sends within a second or two; wait for every answer.
  const settle = async () => {
    await waitFor(() => q(`select 1 from net.http_request_queue q where not exists (select 1 from net._http_response r where r.id = q.id)`), (rows) => rows.length === 0, 15000);
    await new Promise((r) => setTimeout(r, 300));
    await q(`select public.reconcile_email_outbox()`);
  };

  test("RES-EMAIL-01 a rate-limited send is tried again later and arrives", async ({}, info) => {
    const id = await queueEmailTo("dara");
    await providerScenario({ mode: "ratelimit", times: 1 });
    await q(`select public.dispatch_email_outbox()`);
    await settle();
    const first = await one(`select status, retry_count, send_after > now() as later, error from notification_deliveries where id = $1`, [id]);
    await q(`update notification_deliveries set send_after = now() - interval '1 second' where id = $1 and status = 'pending'`, [id]);
    await q(`select public.dispatch_email_outbox()`);
    await settle();
    const second = await one(`select status, retry_count from notification_deliveries where id = $1`, [id]);
    const mails = await waitFor(() => inbox(account("dara").email), (m) => m.some((x: any) => /message/i.test(x.Subject)), 8000);
    await info.attach("outcome.json", { body: JSON.stringify({ first, second, inbox: mails.length }, null, 2), contentType: "application/json" });
    expect(first.status, "back in the queue, not lost").toBe("pending");
    expect(first.later).toBe(true);
    expect(second.status).toBe("sent");
  });

  test("RES-EMAIL-02 a provider error (500) is tried again; a refusal (bad sender) is not", async ({}, info) => {
    const a = await queueEmailTo("bram");
    await providerScenario({ mode: "error", times: 1 });
    await q(`select public.dispatch_email_outbox()`);
    await settle();
    const afterError = await one(`select status, retry_count from notification_deliveries where id = $1`, [a]);
    const b = await queueEmailTo("cass");
    await q(`update notification_deliveries set send_after = now() + interval '1 hour' where id = $1`, [a]);
    await providerScenario({ mode: "reject", times: 1 });
    await q(`select public.dispatch_email_outbox()`);
    await settle();
    const afterReject = await one(`select status, retry_count, error from notification_deliveries where id = $1`, [b]);
    await info.attach("outcome.json", { body: JSON.stringify({ afterError, afterReject }, null, 2), contentType: "application/json" });
    expect(afterError.status).toBe("pending");
    expect(afterReject.status).toBe("failed");
    expect(afterReject.error).toMatch(/not verified|validation/i);
  });

  test("RES-EMAIL-03 an email that keeps failing stops after three tries and is marked failed", async ({}, info) => {
    const id = await queueEmailTo("fenn");
    await providerScenario({ mode: "error", times: 10 });
    const states: any[] = [];
    for (let i = 0; i < 5; i++) {
      await q(`update notification_deliveries set send_after = now() - interval '1 second' where id = $1 and status = 'pending'`, [id]);
      await q(`select public.dispatch_email_outbox()`);
      await settle();
      states.push(await one(`select status, retry_count from notification_deliveries where id = $1`, [id]));
    }
    await providerScenario({ mode: "ok", times: 0 });
    await fetch("http://127.0.0.1:54400/__reset", { method: "POST" });
    await info.attach("outcome.json", { body: JSON.stringify(states, null, 2), contentType: "application/json" });
    expect(states.at(-1).status).toBe("failed");
    expect(states.at(-1).retry_count).toBeLessThanOrEqual(3);
  });
});
