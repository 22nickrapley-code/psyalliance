import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { account, disposableMember } from "../../lib/auth";
import { watch, attachEvidence, shot } from "../../lib/evidence";
import { one, assertLocal, inbox, message, gatewayFault } from "../../lib/staging";

// Sign-up and password reset, through the real forms. These type passwords,
// so traces and video are off for this file: no password can end up in a
// trace. Screenshots show password fields masked.
test.use({ trace: "off", video: "off" });
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

test.describe("AUTH sign-up and password reset", () => {
  test("AUTH-02-A signing up again with a registered email tells the owner by email", async ({ page }, info) => {
    const ev = watch(page);
    const avery = account("avery");
    const before = (await inbox(avery.email)).length;
    await page.goto("/auth/sign-up");
    await page.locator('select[name="qualification"]').selectOption("PsyD");
    await page.locator('input[name="fullName"]').fill("Avery Quillfeather");
    await page.locator('input[name="email"]').fill(avery.email);
    const pw = `Np-${crypto.randomBytes(9).toString("base64url")}`;
    await page.locator('input[name="password"]').fill(pw);
    await page.locator('input[name="password_confirm"]').fill(pw);
    await page.locator('input[name="state"][value="NY"]').first().check({ force: true });
    await page.getByRole("button", { name: "Create your account" }).click();
    await page.waitForLoadState("networkidle");
    await shot(page, info, "after-submit");
    const pageText = await page.locator("main, body").first().innerText();
    const after = await waitFor(() => inbox(avery.email), (m) => m.length > before, 12000);
    await info.attach("outcome.json", { body: JSON.stringify({ url: page.url(), newEmails: after.length - before, subjects: after.map((m) => m.Subject) }, null, 2), contentType: "application/json" });
    await attachEvidence(info, ev);
    expect(after.length - before, "the account owner gets an email").toBeGreaterThan(0);
    expect(pageText, "the page doesn't confirm or deny that the address is registered").not.toMatch(/already (an account|registered)/i);
  });

  test("AUTH-02-B a new sign-up gets a confirmation email whose link works", async ({ page }, info) => {
    const ev = watch(page);
    const email = `newcomer-${crypto.randomBytes(4).toString("hex")}@mail.staging.example`;
    await page.goto("/auth/sign-up");
    await page.locator('select[name="qualification"]').selectOption("PhD");
    await page.locator('input[name="fullName"]').fill("Nova Staging-Newcomer");
    await page.locator('input[name="email"]').fill(email);
    const pw = `Np-${crypto.randomBytes(9).toString("base64url")}`;
    await page.locator('input[name="password"]').fill(pw);
    await page.locator('input[name="password_confirm"]').fill(pw);
    await page.locator('input[name="state"][value="NY"]').first().check({ force: true });
    await page.getByRole("button", { name: "Create your account" }).click();
    await page.waitForURL(/\/auth\/sign-in/);
    await shot(page, info, "1-check-inbox");
    const mails = await waitFor(() => inbox(email), (m) => m.length > 0);
    expect(mails.length).toBeGreaterThan(0);
    const body = await message(mails[0].ID);
    const link = (body.HTML.match(/href="([^"]*verify[^"]*)"/) || body.Text.match(/(http\S*verify\S*)/) || [])[1]?.replace(/&amp;/g, "&");
    expect(link, "confirmation link present").toBeTruthy();
    await page.goto(link!);
    await page.waitForLoadState("networkidle");
    await shot(page, info, "2-after-confirm");
    const confirmed = await one(`select email_confirmed_at is not null as ok from auth.users where email = $1`, [email]);
    await attachEvidence(info, ev);
    expect(confirmed.ok).toBe(true);
    expect(page.url()).toMatch(/\/dashboard\/profile|\/auth\/sign-in/);
  });

  test("AUTH-01-A a reset request the mail service refuses is reported, not shown as sent", async ({ page }, info) => {
    const ev = watch(page);
    await gatewayFault({ path: "/auth/v1/recover", method: "POST", status: 500, times: 1 });
    await page.goto("/auth/forgot-password");
    await page.locator('input[name="email"]').fill(account("dara").email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.waitForLoadState("networkidle");
    await shot(page, info, "after-submit");
    const text = await page.locator("body").innerText();
    await gatewayFault({ clear: true });
    await attachEvidence(info, ev);
    expect(text, "doesn't claim a link is on its way").not.toMatch(/on its way|check your inbox/i);
    expect(text).toMatch(/couldn.t send|try again|not sent|problem/i);
  });

  test("AUTH-01-B a rate-limited reset request is reported with when to retry", async ({ page }, info) => {
    const ev = watch(page);
    await gatewayFault({ path: "/auth/v1/recover", method: "POST", status: 429, times: 1 });
    await page.goto("/auth/forgot-password");
    await page.locator('input[name="email"]').fill(account("dara").email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.waitForLoadState("networkidle");
    await shot(page, info, "after-submit");
    const text = await page.locator("body").innerText();
    await gatewayFault({ clear: true });
    await attachEvidence(info, ev);
    expect(text).not.toMatch(/on its way/i);
    expect(text).toMatch(/minute|wait|try again/i);
  });

  test("AUTH-01-C an unknown address gets the same answer as a registered one", async ({ page }, info) => {
    const answers: string[] = [];
    for (const email of [account("dara").email, `nobody-${Date.now()}@mail.staging.example`]) {
      await page.goto("/auth/forgot-password");
      await page.locator('input[name="email"]').fill(email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await page.waitForLoadState("networkidle");
      answers.push((await page.locator("main, body").first().innerText()).replace(/\S+@\S+/g, "<email>"));
    }
    await info.attach("answers.json", { body: JSON.stringify(answers, null, 2), contentType: "application/json" });
    expect(answers[0]).toBe(answers[1]);
  });

  test("AUTH-03-A a member resets their password from the email and signs in with the new one", async ({ page }, info) => {
    const ev = watch(page);
    const m = await disposableMember("reset");
    await page.goto("/auth/forgot-password");
    await page.locator('input[name="email"]').fill(m.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.waitForLoadState("networkidle");
    await shot(page, info, "1-requested");
    const mails = await waitFor(() => inbox(m.email), (x) => x.length > 0);
    expect(mails.length, "reset email arrived").toBeGreaterThan(0);
    const body = await message(mails[0].ID);
    const link = (body.HTML.match(/href="([^"]*verify[^"]*)"/) || [])[1]?.replace(/&amp;/g, "&");
    await page.goto(link!);
    await page.waitForURL(/reset-password/);
    const pw = `Rs-${crypto.randomBytes(9).toString("base64url")}`;
    await page.locator('input[name="password"]').fill(pw);
    await page.locator('input[name="confirmPassword"]').fill(pw);
    await page.getByRole("button", { name: "Update password" }).click();
    await page.waitForURL(/sign-in/);
    await shot(page, info, "2-updated");
    await page.locator('input[name="email"]').fill(m.email);
    await page.locator('input[name="password"]').fill(pw);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/dashboard/);
    await shot(page, info, "3-signed-in");
    // The used link can't be used again.
    await page.context().clearCookies();
    await page.goto(link!);
    await page.waitForLoadState("networkidle");
    await shot(page, info, "4-link-reused");
    await attachEvidence(info, ev);
    expect(page.url()).not.toMatch(/reset-password$/);
  });
});

