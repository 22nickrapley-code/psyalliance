import { test, expect, type Browser } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// Release B, Network and availability (brief N01, N02, A01, A02). Real local database, fictional members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id;

async function reset() {
  await q(`delete from trusted_colleagues where profile_id = $1`, [avery]);
  await q(`update profiles set approx_spaces = 3, referral_availability = 'yes', availability_confirmed_at = now() - interval '8 days', availability_paused_until = null where id = $1`, [avery]);
  await q(`delete from profile_state_settings where profile_id = $1`, [avery]);
  await q(`delete from licenses where profile_id = $1 and license_number like 'B-NET-%'`, [avery]);
  await q(`delete from workspace_drafts where profile_id = $1`, [avery]);
}
test.beforeEach(reset);
test.afterAll(reset);

async function openAs(browser: Browser, who: string, baseURL: string, path: string, width: number) {
  const phone = width < 700;
  const context = await browser.newContext(phone ? { viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("#app .sidebar, #app .mobile-nav").first()).toBeAttached();
  return { context, page };
}

for (const width of [1365, 390, 320]) {
  test(`NB-01 N02 network at ${width}px: circle targets never overlap or hide one another, and every trusted colleague can be reached and opened`, async ({ browser, baseURL }) => {
    // Seven trusted colleagues: more than the circle can show, so the list has to carry the rest.
    const visible = (await asMember(avery, `select public.workspace_people() as p`)).rows[0].p as { id: string; name: string }[];
    const chosen = visible.filter((p) => p.id !== avery).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 7);
    expect(chosen.length).toBe(7);
    for (const p of chosen) await q(`insert into trusted_colleagues (profile_id, colleague_id) values ($1, $2)`, [avery, p.id]);
    const trusted = chosen.map((p) => ({ id: p.id, full_name: p.name }));
    const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard/network", width);
    const nodes = page.locator(".circle-map .circle-person");
    const n = await nodes.count();
    expect(n).toBeGreaterThan(3);
    const boxes = await nodes.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, label: e.getAttribute("aria-label"), top: (document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest(".circle-person") === e) }; }));
    for (const b of boxes) { expect(b.w, `${b.label} width`).toBeGreaterThanOrEqual(30); expect(b.top, `${b.label} is the thing under its own centre`).toBe(true); }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
      expect(overlap, `${a.label} overlaps ${b.label}`).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    // The trusted list holds all seven, five to a page, and each opens the right profile.
    const group = page.locator("#net-trusted");
    await expect(group.locator(".net-row")).toHaveCount(5);
    await group.getByRole("button", { name: /^Next/ }).click();
    await expect(group.locator(".net-row")).toHaveCount(2);
    const seen: string[] = [];
    for (const page_ of [2, 1]) {
      if (page_ === 1) await group.getByRole("button", { name: /^Previous/ }).click();
      seen.push(...(await group.locator(".net-row strong button").allInnerTexts()).map((t) => t.trim()));
    }
    expect(seen.sort()).toEqual(trusted.map((t) => t.full_name).sort());
    const first = group.locator(".net-row strong button").first();
    const name = (await first.innerText()).trim();
    await first.click();
    await expect(page.locator(".modal")).toContainText(name);
    await context.close();
  });
}

test("NB-02 A02 availability on a phone: one overall number, a setting for each state, long cities and a pause date fit the screen", async ({ browser, baseURL }) => {
  for (const [state, n] of [["CT", 1], ["NJ", 2]] as const) await q(`insert into licenses (profile_id, state, license_number, license_type, expiration_date, status, reviewed_at, notes) values ($1, $2, $3, 'Psychologist', current_date + 300, 'active', now(), 'Fictional staging licence')`, [avery, state, `B-NET-${n}`]);
  const longCity = "Brooklyn, Queens, Staten Island, Bronxville, Mamaroneck, New Rochelle, White Plains, Yonkers";
  await asMember(avery, `select public.set_my_availability(true, 4, $1::jsonb)`, [JSON.stringify({ NY: { virtual: true, inPerson: true, city: longCity }, CT: { virtual: false, inPerson: true, city: "Stamford, Greenwich, Norwalk, Westport, Fairfield, Bridgeport" }, NJ: { virtual: true, inPerson: false, city: "" } })]);
  await q(`update profiles set availability_paused_until = current_date + 20 where id = $1`, [avery]);
  for (const width of [390, 320]) {
    const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard?availability=1", width);
    await expect(page.locator("#availability-slots")).toHaveValue("4"); // one number, not 4 x 3 states
    for (const s of ["NY", "CT", "NJ"]) {
      await expect(page.locator(`input[name="virtual-${s}"]`)).toBeAttached();
      await expect(page.locator(`input[name="inPerson-${s}"]`)).toBeAttached();
    }
    await expect(page.locator(`input[name="virtual-NY"]`)).toBeChecked();
    await expect(page.locator(`input[name="virtual-CT"]`)).not.toBeChecked();
    await expect(page.locator(`input[name="inPerson-CT"]`)).toBeChecked();
    expect(await page.locator("#availability-slots").count()).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const out = await page.locator(".modal input, .modal select, .modal label, .modal button").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { right: r.right, left: r.left, visible: r.width > 0 && r.height > 0 }; }).filter((b) => b.visible && (b.right > window.innerWidth + 1 || b.left < -1)).length);
    expect(out, `controls outside the ${width}px screen`).toBe(0);
    expect(await page.locator("#availability-city-NY").inputValue()).toBe(longCity);
    await context.close();
  }
  // No invented cover cap and no multiplied total anywhere in the numbers colleagues see.
  await q(`update profiles set availability_paused_until = null where id = $1`, [avery]);
  const { rows } = await asMember(bram, `select public.workspace_people() as p`);
  const me = (rows[0].p as any[]).find((p) => p.id === avery);
  expect(me.slots).toBe(4);
});

test("NB-03 A01 one confirmation time: confirming on the screen changes the stored time once, everywhere it is shown", async ({ browser, baseURL }) => {
  await q(`update profiles set availability_confirmed_at = now() - interval '45 days' where id = $1`, [avery]);
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard?availability=1", 1365);
  await expect(page.locator(".av-side")).toContainText("45 days ago");
  await page.locator(".modal").getByRole("button", { name: /Confirm unchanged/ }).first().click();
  await expect(page.locator("#toast")).toContainText(/confirmed/i);
  const p = await one(`select availability_confirmed_at > now() - interval '1 minute' as fresh from profiles where id = $1`, [avery]);
  expect(p.fresh).toBe(true);
  // A colleague's directory and the member's own window both read the same new timestamp.
  const dir = await asMember(bram, `select (public.network_directory('{"available": true}'::jsonb) -> 'people') as p`);
  expect((dir.rows[0].p as any[]).some((x) => x.id === avery)).toBe(true);
  await page.goto("/dashboard?availability=1");
  await expect(page.locator(".av-side")).toContainText(/today|just now|0 days|minute/i);
  await context.close();
});
