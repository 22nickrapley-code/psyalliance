import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { signInAs, account, memberClient, disposableMember } from "../../lib/auth";
import { watch, attachEvidence, shot } from "../../lib/evidence";
import { q, one, assertLocal, inbox, message, gatewayFault, providerSent } from "../../lib/staging";

// Release-review findings a member meets in the browser. Each test states the
// correct behaviour; on the deployed baseline (c131fdc) the defects make
// them fail, which is the reproduction.

test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 15000): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!ok(v) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 500));
    v = await fn();
  }
  return v;
}

// A conversation notifies its recipient once a day (dedup), so each run
// starts the recipients from no recent notifications (staging only).
async function clearRecentNotifications(keys: string[]) {
  await q(`update notification_deliveries set created_at = created_at - interval '2 days'
            where recipient_profile_id = any($1::uuid[]) and created_at > now() - interval '2 days'`, [keys.map((k) => account(k).id)]);
}

// Messages are the approved v13 screen: New message, choose the colleague, write, Send message.
async function sendMessage(page: Page, toId: string, text: string) {
  await page.goto("/dashboard/messages");
  await expect(page.locator("#app .sidebar")).toBeVisible();
  await page.getByRole("button", { name: "New message" }).click();
  await page.locator(`[data-action="person-message:${toId}"]`).click();
  await page.locator("#message-input").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message-group.outgoing .delivery-state.sent").last()).toBeVisible({ timeout: 20000 });
}

test.describe("N16-01 digest every two weeks", () => {
  test("N16-01-A choosing Every two weeks saves and survives a reload", async ({ page, context, baseURL }, info) => {
    const ev = watch(page);
    await signInAs(context, "avery", baseURL!);
    await page.goto("/dashboard/settings#notifications");
    await page.locator("details#notifications > summary").click();
    await page.locator('select[name="digest_frequency"]').selectOption("fortnightly");
    await shot(page, info, "1-chosen");
    await page.getByRole("button", { name: "Save notification settings" }).click();
    await page.waitForLoadState("networkidle");
    await shot(page, info, "2-after-save");
    await expect(page.getByText(/violates|constraint/i)).toHaveCount(0);
    const saved = await q(`select digest_frequency from notification_preferences where profile_id = $1`, [account("avery").id]);
    await page.reload();
    await page.locator("details#notifications > summary").click();
    await shot(page, info, "3-after-reload");
    await attachEvidence(info, ev);
    expect(saved[0]?.digest_frequency).toBe("fortnightly");
    await expect(page.locator('select[name="digest_frequency"]')).toHaveValue("fortnightly");
  });
});

test.describe("N16-03 notification deliveries", () => {
  test("N16-03-A a message creates the recipient's in-app and email deliveries", async ({ page, context, baseURL }, info) => {
    const ev = watch(page);
    await clearRecentNotifications(["cass"]);
    await signInAs(context, "avery", baseURL!);
    const text = `QA delivery ${Date.now()}: fictional message.`;
    await sendMessage(page, account("cass").id, text);
    const rows = await waitFor(
      () => q(`select d.channel, d.status, d.send_after > now() + interval '30 minutes' as delayed
                 from notification_events e join notification_deliveries d on d.notification_event_id = e.id
                where e.event_type = 'message_received' and d.recipient_profile_id = $1 and e.created_at > now() - interval '2 minutes'`, [account("cass").id]),
      (r) => r.length >= 2
    );
    await info.attach("deliveries.json", { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
    await attachEvidence(info, ev);
    expect(rows.find((r: any) => r.channel === "in_app"), "in-app delivery").toBeTruthy();
    expect(rows.find((r: any) => r.channel === "email" && r.status === "pending" && r.delayed), "email delivery, held for the unread hour").toBeTruthy();
  });

  test("N16-04-A an unread message email goes through the provider to the inbox; a read one is suppressed", async ({ page, context, baseURL, browser }, info) => {
    const ev = watch(page);
    await clearRecentNotifications(["fenn", "bram"]);
    await signInAs(context, "avery", baseURL!);
    const unread = `QA email unread ${Date.now()}`;
    const read = `QA email read ${Date.now()}`;
    await sendMessage(page, account("fenn").id, unread);
    await sendMessage(page, account("bram").id, read);
    // Bram reads his straight away.
    const bc = await browser.newContext();
    const bp = await bc.newPage();
    await signInAs(bc, "bram", baseURL!);
    await bp.goto("/dashboard/messages");
    await bp.locator(".inbox-colleague", { hasText: "Avery" }).locator(".inbox-latest").first().click();
    await expect(bp.getByText(read).first()).toBeVisible();
    await bc.close();
    // The hour passes (staging only): make both emails due now, then run the dispatcher.
    await q(`update notification_deliveries set send_after = now() - interval '1 second'
              where channel = 'email' and status = 'pending' and created_at > now() - interval '5 minutes' and recipient_profile_id = any($1::uuid[])`, [[account("fenn").id, account("bram").id]]);
    await q(`select public.dispatch_email_outbox()`);
    const fenn = account("fenn");
    const sent = await waitFor(() => providerSent(), (s) => s.some((m) => JSON.stringify(m.to).includes(fenn.email)));
    const mails = await waitFor(() => inbox(fenn.email), (m) => m.length > 0);
    const bramMails = await inbox(account("bram").email);
    const statuses = await q(`select p.full_name, d.status, d.error from notification_deliveries d join profiles p on p.id = d.recipient_profile_id where d.channel = 'email' and d.created_at > now() - interval '5 minutes' order by 1`);
    await info.attach("outcome.json", { body: JSON.stringify({ providerAccepted: sent.filter((m) => JSON.stringify(m.to).includes(fenn.email)).length, inboxFenn: mails.map((m) => m.Subject), inboxBram: bramMails.map((m) => m.Subject), statuses }, null, 2), contentType: "application/json" });
    await attachEvidence(info, ev);
    expect(mails.length, "email reached Fenn's inbox").toBeGreaterThan(0);
    expect(statuses.find((s: any) => s.full_name.startsWith("Bram"))?.status, "Bram read it, so no email").toBe("suppressed_read");
  });
});

test.describe("N02 referral Back keeps the chosen recipients", () => {
  test("N02-A untick one, review, go back: the same two stay ticked", async ({ page, context, baseURL }, info) => {
    const ev = watch(page);
    await signInAs(context, "avery", baseURL!);
    await page.goto("/dashboard/refer/new?focus=7&state=NY&step=shortlist");
    const boxes = page.locator('input[type="checkbox"][name="pick"]');
    await expect(boxes.first()).toBeVisible();
    const n = await boxes.count();
    expect(n, "at least three matches").toBeGreaterThanOrEqual(3);
    const third = await boxes.nth(2).getAttribute("value");
    await boxes.nth(2).uncheck({ force: true });
    await shot(page, info, "1-shortlist-two-ticked");
    await page.getByRole("button", { name: /Review before sending/ }).click();
    await expect(page.getByText(/Selected colleagues \(2\)/)).toBeVisible();
    await shot(page, info, "2-review-two");
    await page.getByRole("link", { name: /Back to shortlist/ }).click();
    await expect(boxes.first()).toBeVisible();
    await shot(page, info, "3-back");
    const checked = await page.locator('input[type="checkbox"][name="pick"]:checked').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    await attachEvidence(info, ev);
    expect(checked, "the colleague left out is still left out").not.toContain(third);
    expect(checked).toHaveLength(2);
  });
});

test.describe("N01 Mark useful in the browser", () => {
  test("N01-B the author clicks Mark useful and sees it saved after a reload", async ({ page, context, baseURL }, info) => {
    const ev = watch(page);
    const avery = await memberClient("avery");
    const bram = await memberClient("bram");
    const { data: c } = await avery
      .from("consultations")
      .insert({ author_profile_id: account("avery").id, question: `QA useful UI ${Date.now()}: a fictional question.`, status: "open", audience_type: "selected", audience_profile_ids: [account("bram").id], deidentification_confirmed: true })
      .select("id")
      .single();
    await bram.from("consultation_responses").insert({ consultation_id: c!.id, responder_profile_id: account("bram").id, body: "A fictional reply for the useful test.", response_type: "reply" });
    await signInAs(context, "avery", baseURL!);
    await page.goto(`/dashboard/consult/${c!.id}`);
    await page.getByRole("button", { name: "Mark useful" }).click();
    await page.waitForLoadState("networkidle");
    await page.reload();
    await shot(page, info, "after-reload");
    const saved = await one(`select marked_useful from consultation_responses where consultation_id = $1`, [c!.id]);
    await attachEvidence(info, ev);
    expect(saved.marked_useful).toBe(true);
    await expect(page.getByRole("button", { name: /Useful/ })).toContainText("✓");
  });
});

test.describe("N03 and DEMO entry points", () => {
  test("N03-A a pending member's Home sends them to the in-product demos", async ({ page, context, baseURL }, info) => {
    const ev = watch(page);
    await signInAs(context, "pell", baseURL!);
    await page.goto("/dashboard");
    await shot(page, info, "pending-home");
    // The "while we check your license" panel, not the menu.
    const hrefs = await page.locator("#explore a").evaluateAll((as) => as.map((a) => [a.textContent?.trim(), a.getAttribute("href")]));
    const demo = hrefs.find(([t]) => /demo/i.test(String(t)));
    await info.attach("demo-link.json", { body: JSON.stringify(demo), contentType: "application/json" });
    await attachEvidence(info, ev);
    expect(demo?.[1]).toBe("/dashboard/demos");
  });
});

test.describe("DEMO player and sandbox entry", () => {
  test("DEMO-01-A Escape closes a demo even when focus is inside the player, and focus returns to Watch", async ({ page, context, baseURL }, info) => {
    const ev = watch(page);
    await signInAs(context, "avery", baseURL!);
    await page.goto("/dashboard/demos");
    const watchBtn = page.getByRole("link", { name: /Watch/ }).first();
    await watchBtn.click();
    const dialog = page.locator("dialog.example-dialog[open]");
    await expect(dialog).toHaveCount(1);
    const frame = page.frameLocator("dialog.example-dialog[open] iframe");
    // Wait until the player has opened its first screen (it is running, not just drawn), then click into it.
    await expect(frame.locator("section.story-player")).toBeVisible({ timeout: 30000 });
    await expect(frame.locator(".sp-loading")).toHaveCount(0, { timeout: 30000 });
    await frame.locator("body").click({ position: { x: 40, y: 40 } });
    await shot(page, info, "1-playing-focus-inside");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await shot(page, info, "2-after-escape");
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.tagName);
    await info.attach("focus.json", { body: JSON.stringify({ focused }), contentType: "application/json" });
    await attachEvidence(info, ev);
    await expect(page.locator("dialog.example-dialog[open]")).toHaveCount(0);
    expect(focused).toMatch(/Watch/);
  });

  test("DEMO-02-A a verified member can open the sandbox the Demos page points to", async ({ page, context, baseURL }, info) => {
    const ev = watch(page);
    await signInAs(context, "avery", baseURL!);
    await page.goto("/dashboard/demos");
    const lead = await page.locator("main").innerText();
    await shot(page, info, "1-demos");
    await page.goto("/dashboard");
    await shot(page, info, "2-home");
    const homeHasSandbox = await page.locator("main").getByText(/open your sandbox/i).count();
    await page.goto("/dashboard/demos");
    const demosHasSandbox = await page.locator("main").getByRole("button", { name: /sandbox/i }).or(page.locator("main").getByRole("link", { name: /open your sandbox/i })).count();
    await info.attach("outcome.json", { body: JSON.stringify({ demosSaysFromHome: /from Home/i.test(lead), homeHasSandbox, demosHasSandbox }, null, 2), contentType: "application/json" });
    await attachEvidence(info, ev);
    // Wherever the copy sends the member, the control is there.
    if (/from Home/i.test(lead)) expect(homeHasSandbox, "Home has an Open your sandbox control").toBeGreaterThan(0);
    else expect(demosHasSandbox + homeHasSandbox).toBeGreaterThan(0);
  });
});
