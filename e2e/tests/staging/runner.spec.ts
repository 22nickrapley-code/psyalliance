import { test, expect } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { watch, attachEvidence, shot } from "../../lib/evidence";
import { q, assertLocal } from "../../lib/staging";

// Proof that the independent runner works end to end: a signed-in journey,
// a switch to a second account, a refresh, and checked saved state, with
// screenshots and sanitised logs attached. Staging fixtures only.
test.describe("RUN: runner proof", () => {
  test("RUN-001 Avery signs in and Home loads as a verified member", async ({ page, context, baseURL }, info) => {
    assertLocal(baseURL!);
    const ev = watch(page);
    await signInAs(context, "avery", baseURL!);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Avery");
    await shot(page, info, "home-avery");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Avery");
    await attachEvidence(info, ev);
    expect(ev.pageErrors, "uncaught page errors").toEqual([]);
  });

  test("RUN-002 a message from Avery reaches Bram, survives refresh and a new session", async ({ page, context, baseURL, browser }, info) => {
    assertLocal(baseURL!);
    const ev = watch(page);
    const bram = account("bram");
    const stamp = `Runner proof ${Date.now()}`;

    await signInAs(context, "avery", baseURL!);
    await page.goto(`/dashboard/messages?to=${bram.id}`);
    await page.getByPlaceholder(/Write a professional message/).fill(`${stamp}: a fictional hello from staging.`);
    await shot(page, info, "1-avery-compose");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(stamp).first()).toBeVisible();
    await shot(page, info, "2-avery-sent");

    // Saved, not just shown: one message row, both people in the conversation.
    const rows = await q(
      `select m.conversation_id, (select array_agg(profile_id::text order by profile_id) from conversation_participants p where p.conversation_id = m.conversation_id) people
         from conversation_messages m where m.body like $1`,
      [`${stamp}%`]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].people).toContain(bram.id);
    expect(rows[0].people).toContain(account("avery").id);

    // Sign out through the app.
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Sign out" }).first().click({ force: true });
    await page.waitForURL(/\/auth\/sign-in/);
    await shot(page, info, "3-signed-out");

    // Bram, in a separate browser context (a new session).
    const bramContext = await browser.newContext();
    const bp = await bramContext.newPage();
    const ev2 = watch(bp);
    await signInAs(bramContext, "bram", baseURL!);
    await bp.goto("/dashboard/messages");
    await expect(bp.getByText(/Avery Quillfeather/).first()).toBeVisible();
    await shot(bp, info, "4-bram-inbox");
    await bp.getByText(/Avery Quillfeather/).first().click();
    await expect(bp.getByText(stamp).first()).toBeVisible();
    await shot(bp, info, "5-bram-thread");
    await bp.reload();
    await expect(bp.getByText(stamp).first()).toBeVisible();
    await shot(bp, info, "6-bram-after-refresh");

    // Bram's read position is saved.
    const [read] = await q(
      `select cp.last_read_at >= m.created_at as read from conversation_participants cp join conversation_messages m on m.conversation_id = cp.conversation_id
        where cp.profile_id = $1 and m.body like $2`,
      [bram.id, `${stamp}%`]
    );
    expect(read?.read).toBe(true);

    await attachEvidence(info, ev);
    await attachEvidence(info, ev2);
    await bramContext.close();
  });
});
