import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q } from "../../../lib/staging";

// Release B, P01 (brief 5 and 12): a save that fails is never called saved, the newest text is kept on this device,
// it is put back and saved when the workspace opens again, and a version saved from another device in the meantime wins.
// Real local database, fictional members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id;
const key = `pa-unsaved:${avery}`;
const wipe = async () => {
  await q(`delete from workspace_drafts where profile_id = $1 and kind <> 'hub-state'`, [avery]);
  await q(`delete from conversations where id in (select conversation_id from conversation_participants where profile_id = $1)`, [avery]);
};
test.beforeEach(wipe);
test.afterAll(wipe);

async function openAs(browser: any, baseURL: string, path: string) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(context, "avery", baseURL);
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept()); // the browser's "leave this page?" question
  await page.goto(path);
  await expect(page.locator("#app .sidebar")).toBeVisible();
  return { context, page };
}
const kept = (page: Page) => page.evaluate((k) => localStorage.getItem(k), key);
const drafts = async (text: string) => Number((await q(`select count(*)::int c from workspace_drafts where profile_id = $1 and data::text like $2`, [avery, `%${text}%`]))[0].c);

test("PB-01 P01 a failed save keeps the newest text on this device, and a reload puts it back and saves it", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, baseURL!, "/dashboard/cover");
  await page.locator('[data-action="cover-start"]').first().click();
  const name = page.locator("#cover-name"), note = page.locator(".save-note");
  await name.fill("PB first title");
  await expect(note).toContainText("Saved");
  await expect.poll(() => drafts("PB first title")).toBe(1);
  expect(await kept(page)).toBeNull(); // nothing is written here while saving works
  await context.setOffline(true);
  await name.fill("PB newest title");
  await expect(note).toContainText("Could not save your changes");
  expect(await kept(page)).toContain("PB newest title");
  expect(await drafts("PB newest title")).toBe(0); // the screen did not claim a save that did not happen
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator("#toast")).toContainText("We put back changes that had not saved");
  await expect.poll(() => drafts("PB newest title")).toBe(1);
  expect(await drafts("PB first title")).toBe(0); // the older text did not come back on top
  await expect.poll(() => kept(page)).toBeNull(); // and the copy on this device is gone once it is saved
  await expect(page.locator(".draft-banner", { hasText: "PB newest title" })).toBeVisible();
  await context.close();
});

test("PB-02 P01 a newer version saved from another device is kept, and the person is told", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, baseURL!, "/dashboard/cover");
  await page.locator('[data-action="cover-start"]').first().click();
  const name = page.locator("#cover-name"), note = page.locator(".save-note");
  await name.fill("PB first title");
  await expect(note).toContainText("Saved");
  await expect.poll(() => drafts("PB first title")).toBe(1);
  await context.setOffline(true);
  await name.fill("PB lost title");
  await expect(note).toContainText("Could not save your changes");
  // Meanwhile another device saved something different.
  await q(`update workspace_drafts set data = replace(data::text, 'PB first title', 'PB other device')::jsonb where profile_id = $1 and data::text like '%PB first title%'`, [avery]);
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator("#toast")).toContainText("Another device saved a newer version");
  await page.waitForTimeout(1500);
  expect(await drafts("PB other device")).toBe(1);
  expect(await drafts("PB lost title")).toBe(0);
  expect(await kept(page)).toBeNull();
  await context.close();
});

test("PB-03 P01 Consult and Referral drafts say when they could not save, and recover with the newest text", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, baseURL!, "/dashboard/consult");
  await page.getByRole("button", { name: "Ask a question" }).first().click();
  const title = page.locator("#peer-title");
  await title.fill("PB consult first");
  await expect(page.locator(".save-note")).toContainText("Saved");
  await context.setOffline(true);
  await title.fill("PB consult newest");
  await expect(page.locator(".save-note")).toContainText("Could not save your changes");
  expect(await drafts("PB consult newest")).toBe(0);
  await title.fill("PB consult newest, edited again");
  await context.setOffline(false);
  await page.locator(".save-note").getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".save-note")).toContainText("Saved");
  await expect.poll(() => drafts("PB consult newest, edited again")).toBe(1);
  expect(await drafts("PB consult first")).toBe(0);
  expect(await kept(page)).toBeNull();
  await page.keyboard.press("Escape");
  // Referral: the same, through the main need field.
  await page.goto("/dashboard/referrals");
  await page.locator('[data-action="referral-start"]').first().click();
  const need = page.locator("#referral-focus");
  await need.selectOption("Depression");
  await expect(page.locator(".save-note")).toContainText("Saved");
  await context.setOffline(true);
  await need.selectOption("Anxiety/Panic Disorders");
  await expect(page.locator(".save-note")).toContainText("Could not save your changes");
  expect(await drafts("Anxiety/Panic Disorders")).toBe(0);
  await context.setOffline(false);
  await page.locator(".save-note").getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".save-note")).toContainText("Saved");
  await expect.poll(() => drafts("Anxiety/Panic Disorders")).toBe(1);
  expect(await drafts("Depression")).toBe(0);
  await context.close();
});

test("PB-04 P01 an unsent message that could not be saved comes back in its own conversation after a reload", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, baseURL!, "/dashboard/messages");
  await page.getByRole("button", { name: "New message" }).click();
  await page.locator(`[data-action="person-message:${bram}"]`).click();
  await page.locator("#message-input").fill("Hello Bram.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".delivery-state.sent").last()).toBeVisible();
  await context.setOffline(true);
  await page.locator("#message-input").fill("PB unsent thought for Bram");
  await expect.poll(() => kept(page)).toContain("PB unsent thought for Bram");
  await context.setOffline(false);
  await page.reload();
  await page.locator(".inbox-colleague", { hasText: "Bram" }).locator(".inbox-latest").click();
  await expect(page.locator("#message-input")).toHaveValue("PB unsent thought for Bram");
  await expect.poll(() => drafts("PB unsent thought for Bram")).toBe(1);
  await expect.poll(() => kept(page)).toBeNull();
  await context.close();
});
