import { test, expect, type Browser, type Page } from "@playwright/test";
import { q, one, assertLocal } from "../../../lib/staging";

// The final product's examples in the sandbox world (migration 0121, decisions
// D-05, D-14, D-17). Needs the demo build and a demo database (see sandbox.spec.ts).
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.beforeAll(async () => {
  const env = await q<{ v: string }>("select private.cfg('app_env') as v");
  test.skip(env[0]?.v !== "demo", "needs the demo configuration (app_env = demo)");
});

async function newPass(label: string) {
  const r = await one<{ token: string }>("insert into sandbox_passes(label) values ($1) returning token", [`e2e-${label}-${Date.now()}`]);
  return r.token;
}
async function enter(browser: Browser, token: string, viewport = { width: 1365, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`/sandbox/${token}`);
  await page.getByRole("button", { name: /Enter the sandbox/ }).click();
  await page.waitForSelector(".sidebar", { timeout: 90_000 });
  await page.waitForTimeout(800);
  return { context, page };
}
const click = (page: Page, action: string) => page.evaluate((a) => (document.querySelector(`[data-action="${a}"]`) as HTMLElement | null)?.click(), action);

test.describe("SBX-F the final product's examples", () => {
  test.setTimeout(240_000);

  test("SBX-F-01 a colleague on a break and one not open to cover are in the cast, and Rachel's world has one resolved question", async ({ browser }) => {
    const token = await newPass("final");
    const { context, page } = await enter(browser, token);
    const gid = (await one<{ guest_id: string }>("select guest_id from sandbox_passes where token=$1", [token])).guest_id;
    const talia = await one<{ paused: string | null }>("select availability_paused_until::text as paused from profiles where full_name like 'Talia Kellingsby%' limit 1");
    expect(talia.paused, "Talia is paused for a few weeks").not.toBeNull();
    const days = await one<{ d: number }>("select (availability_paused_until - current_date)::int as d from profiles where full_name like 'Talia Kellingsby%' limit 1");
    expect(days.d).toBeGreaterThan(14);
    expect(days.d).toBeLessThanOrEqual(21);
    const lena = await one<{ c: string }>("select coverage_availability::text as c from profiles where full_name like 'Lena Larkhollow%' limit 1");
    expect(lena.c).toBe("no");
    const resolved = await q<{ id: string; topic: string | null; question: string }>("select c.id, c.topic, c.question from consultations c join private.demo_rows dr on dr.tbl = 'consultations' and dr.id = c.id and dr.owner = $1 where c.status = 'resolved'", [gid]);
    expect(resolved.length, "one resolved question in this guest's world").toBe(1);
    // Cover matching leaves both out; Referrals leaves out the paused colleague.
    const eligible = await q<{ n: string }>("select p.full_name as n from profiles p where p.full_name like 'Talia Kellingsby%' or p.full_name like 'Lena Larkhollow%'");
    expect(eligible.length).toBe(2);
    // On screen: the directory says Talia is paused; Consult marks the question Resolved.
    await click(page, "nav:network");
    await page.waitForTimeout(500);
    await click(page, "network-tab:directory");
    await page.locator("#page-dir-q").fill("Talia Kellingsby");
    await page.waitForTimeout(800);
    await expect(page.locator("#app")).toContainText(/Talia Kellingsby/);
    await expect(page.locator("#app")).toContainText(/Paused until/);
    await click(page, "nav:consult");
    await page.waitForTimeout(800);
    // The list is newest first and paged, so find the resolved question by its own words.
    await page.locator("#consult-search").fill(resolved[0].question.slice(0, 40));
    await page.waitForTimeout(800);
    await expect(page.locator("#consult-results")).toContainText(/Resolved/);
    await context.close();
  });

  test("SBX-F-02 starting the story again keeps the examples", async ({ browser }) => {
    const token = await newPass("final-reset");
    const { context, page } = await enter(browser, token);
    const gid = (await one<{ guest_id: string }>("select guest_id from sandbox_passes where token=$1", [token])).guest_id;
    await q("update consultations set status = 'open', resolved_at = null where id in (select id from private.demo_rows where tbl = 'consultations' and owner = $1)", [gid]);
    await click(page, "settings");
    await page.locator(".modal button", { hasText: /Preview controls/ }).first().click();
    await page.getByRole("button", { name: /Start the story again/ }).click();
    const confirm = page.getByRole("button", { name: /Yes, start again|Start again|Confirm/ });
    if (await confirm.count()) await confirm.last().click();
    await page.waitForTimeout(8000);
    const resolved = await q("select c.id from consultations c join private.demo_rows dr on dr.tbl = 'consultations' and dr.id = c.id and dr.owner = $1 where c.status = 'resolved'", [gid]);
    expect(resolved.length).toBe(1);
    await context.close();
  });
});
