import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q } from "../../../lib/staging";

// Release B, Consult (brief Q01): audiences, choosing people across searches, the review, and getting the draft back.
// Real local database, fictional members only. Reach (who is actually told) is proved by NC-03, NCU-04 and NCU-05.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id;
const wipe = async () => {
  await q(`delete from workspace_drafts where profile_id = $1 and kind <> 'hub-state'`, [avery]);
  await q(`delete from consultations where author_profile_id = $1 and title like 'B %'`, [avery]);
};
test.beforeEach(wipe);
test.afterAll(wipe);

async function openConsult(browser: any, baseURL: string, width = 1365) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await signInAs(context, "avery", baseURL);
  const page = await context.newPage();
  await page.goto("/dashboard/consult");
  await expect(page.locator("#app .sidebar, #app .mobile-nav").first()).toBeAttached();
  return { context, page };
}
const ask = async (page: Page, title: string, body = "A question with no client details.") => {
  await page.getByRole("button", { name: "Ask a question" }).first().click();
  await page.locator("#peer-title").fill(title);
  await page.locator("#peer-body").fill(body);
};

test("QB-01 Q01 each audience can be chosen, says who will see the question, and the people chosen survive searching", async ({ browser, baseURL }) => {
  const { page, context } = await openConsult(browser, baseURL!);
  await ask(page, "B Audience choices");
  const tiles = await page.locator('.audience-tile input[name="audience"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  for (const need of ["trusted", "one", "few", "network"]) expect(tiles, `audience ${need} is offered`).toContain(need);
  for (const id of ["trusted", "network"]) {
    await page.locator(`.audience-tile input[value="${id}"]`).check({ force: true });
    await expect(page.locator(".recipient-summary")).toBeVisible();
    await expect(page.locator('input[name="recipients"]')).toHaveCount(0); // no list of people for these two
  }
  // A few colleagues: choose two, search for a third, and the first two are still chosen.
  await page.locator('.audience-tile input[value="few"]').check({ force: true });
  const boxes = page.locator('input[name="recipients"]');
  expect(await boxes.count()).toBeGreaterThan(3);
  const names = await boxes.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || ""));
  const [one, two, three] = [names[0], names[1], names[names.length - 1]];
  await page.locator(`input[name="recipients"][aria-label="${one}"]`).check({ force: true });
  await page.locator(`input[name="recipients"][aria-label="${two}"]`).check({ force: true });
  await expect(page.locator(".recipient-summary")).toContainText("2 colleagues will see this");
  await page.locator("#audience-search").fill(three.split(" ").pop()!);
  await page.locator(`input[name="recipients"][aria-label="${three}"]`).check({ force: true });
  await page.locator("#audience-search").fill("");
  for (const n of [one, two, three]) await expect(page.locator(`input[name="recipients"][aria-label="${n}"]`)).toBeChecked();
  await expect(page.locator(".recipient-summary")).toContainText("3 colleagues will see this");
  // The review names all three and nothing has been posted.
  await page.locator('#peer-form input[name="reviewed"]').check();
  await page.getByRole("button", { name: "Review before posting" }).click();
  const review = page.locator(".modal");
  for (const n of [one, two, three]) await expect(review).toContainText(n);
  await expect(review).toContainText("3 recipients");
  expect((await q(`select 1 from consultations where author_profile_id = $1 and title = 'B Audience choices'`, [avery])).length).toBe(0);
  await context.close();
});

test("QB-02 Q01 a Consult draft comes back with its audience and chosen people, and says what it is", async ({ browser, baseURL }) => {
  const { page, context } = await openConsult(browser, baseURL!);
  await ask(page, "B Draft with people");
  await page.locator('.audience-tile input[value="few"]').check({ force: true });
  const names = await page.locator('input[name="recipients"]').evaluateAll((els) => els.slice(0, 2).map((e) => e.getAttribute("aria-label") || ""));
  for (const n of names) await page.locator(`input[name="recipients"][aria-label="${n}"]`).check({ force: true });
  await page.waitForTimeout(1000); // the draft is saved as you type
  await page.keyboard.press("Escape");
  const banner = page.locator(".draft-banner", { hasText: "B Draft with people" });
  await expect(banner).toBeVisible();
  await page.reload();
  await expect(page.locator(".draft-banner", { hasText: "B Draft with people" })).toBeVisible();
  await page.locator(".draft-banner", { hasText: "B Draft with people" }).getByRole("button", { name: "Continue draft" }).click();
  await expect(page.locator("#peer-title")).toHaveValue("B Draft with people");
  await expect(page.locator('.audience-tile input[value="few"]')).toBeChecked();
  for (const n of names) await expect(page.locator(`input[name="recipients"][aria-label="${n}"]`)).toBeChecked();
  await expect(page.locator(".recipient-summary")).toContainText("2 colleagues will see this");
  await context.close();
});

test("QB-03 Q01 a client detail in a Consult question is refused before anything is posted", async ({ browser, baseURL }) => {
  const { page, context } = await openConsult(browser, baseURL!);
  await ask(page, "B Privacy", "My client Jane Doe, DOB 03/04/1980, phone 555-123-4567, is struggling.");
  await page.locator('.audience-tile input[value="trusted"]').check({ force: true });
  await page.locator('#peer-form input[name="reviewed"]').check();
  await page.getByRole("button", { name: "Review before posting" }).click();
  await expect(page.locator("#toast, .field-error, .inline-note[role=alert]").first()).toBeVisible();
  expect((await q(`select 1 from consultations where author_profile_id = $1 and title = 'B Privacy'`, [avery])).length).toBe(0);
  await context.close();
});
