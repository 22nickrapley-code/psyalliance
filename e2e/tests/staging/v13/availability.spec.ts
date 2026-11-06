import { test, expect } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// V13 workspace: availability (one overall number, settings per licensed
// state, the 90-day rule). Fictional staging members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const avery = () => account("avery").id;
const reset = async () => {
  await q(`update profiles set approx_spaces = 3, referral_availability = 'yes', availability_confirmed_at = now() - interval '8 days', availability_paused_until = null where id = $1`, [avery()]);
  await q(`delete from profile_state_settings where profile_id = $1`, [avery()]);
  await q(`delete from workspace_drafts where profile_id = $1`, [avery()]);
};

test("AV-01 the availability window shows the member's own availability from the database", async ({ page, context, baseURL }) => {
  await reset();
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard?availability=1");
  await expect(page.locator("#availability-slots")).toHaveValue("3");
  await expect(page.locator('input[name="virtual-NY"]')).toBeAttached();
  await expect(page.locator(".av-side")).toContainText("8 days ago");
});

test("AV-02 saving changes spaces and settings in the database and confirms today", async ({ page, context, baseURL }) => {
  await reset();
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard?availability=1");
  await page.locator("#availability-slots").fill("5");
  await page.locator('input[name="virtual-NY"]').check();
  await page.locator('input[name="inPerson-NY"]').check();
  await page.locator("#availability-city-NY").fill("Brooklyn");
  await page.getByRole("button", { name: /Save & confirm availability/ }).click();
  await expect(page.locator("#toast")).toContainText("confirmed");
  const p = await one(`select approx_spaces, referral_availability, availability_confirmed_at > now() - interval '1 minute' as fresh from profiles where id = $1`, [avery()]);
  expect(p).toMatchObject({ approx_spaces: 5, referral_availability: "yes", fresh: true });
  const s = await one(`select virtual, in_person, city from profile_state_settings where profile_id = $1 and state = 'NY'`, [avery()]);
  expect(s).toMatchObject({ virtual: true, in_person: true, city: "Brooklyn" });
  // It is the same after a reload: nothing lived only in the browser.
  await page.goto("/dashboard?availability=1");
  await expect(page.locator("#availability-slots")).toHaveValue("5");
});

test("AV-03 the server refuses spaces with no setting, and in-person with no city", async () => {
  await reset();
  const bad1 = asMember(avery(), `select public.set_my_availability(true, 2, '{"NY": {"virtual": false, "inPerson": false, "city": ""}}'::jsonb)`);
  await expect(bad1).rejects.toThrow(/Choose at least one state and setting/);
  const bad2 = asMember(avery(), `select public.set_my_availability(true, 2, '{"NY": {"virtual": false, "inPerson": true, "city": ""}}'::jsonb)`);
  await expect(bad2).rejects.toThrow(/in-person city/);
  const bad3 = asMember(avery(), `select public.set_my_availability(true, 101, '{"NY": {"virtual": true, "inPerson": false, "city": ""}}'::jsonb)`);
  await expect(bad3).rejects.toThrow(/0 to 100/);
  const p = await one(`select approx_spaces from profiles where id = $1`, [avery()]);
  expect(p.approx_spaces).toBe(3);
});

test("AV-04 a state without a reviewed licence cannot be given settings", async () => {
  await reset();
  const bad = asMember(avery(), `select public.set_my_availability(true, 2, '{"CA": {"virtual": true, "inPerson": false, "city": ""}}'::jsonb)`);
  await expect(bad).rejects.toThrow(/no reviewed license in CA/);
});

test("AV-05 Confirm unchanged moves only the confirmation time", async ({ page, context, baseURL }) => {
  await reset();
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard?availability=1");
  await page.getByRole("button", { name: "Confirm unchanged" }).first().click();
  await expect(page.locator("#toast")).toContainText("reconfirmed today");
  const p = await one(`select approx_spaces, referral_availability, availability_confirmed_at > now() - interval '1 minute' as fresh from profiles where id = $1`, [avery()]);
  expect(p).toMatchObject({ approx_spaces: 3, referral_availability: "yes", fresh: true });
  await page.goto("/dashboard?availability=1");
  await expect(page.locator(".av-side")).toContainText("Confirmed today");
});

test("AV-06 an unsaved availability edit survives Confirm unchanged, a reload and the account", async ({ page, context, baseURL }) => {
  await reset();
  await q(`delete from workspace_drafts where profile_id = $1`, [avery()]);
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard?availability=1");
  await page.locator("#availability-slots").fill("7");
  await page.waitForTimeout(900);
  const d = await one(`select data from workspace_drafts where profile_id = $1 and kind = 'availability'`, [avery()]);
  expect(d.data.slots).toBe(7);
  await page.goto("/dashboard?availability=1");
  await expect(page.locator("#availability-slots")).toHaveValue("7");
  // Confirming without saving is refused while an edit is waiting.
  await page.getByRole("button", { name: "Confirm unchanged" }).last().click();
  await expect(page.locator("#toast")).toContainText("unsaved availability changes");
  const p = await one(`select approx_spaces from profiles where id = $1`, [avery()]);
  expect(p.approx_spaces).toBe(3);
});

async function openActions(page: import("@playwright/test").Page) {
  const t = page.locator(".hub-attn-toggle");
  await t.waitFor();
  await expect(async () => {
    if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
    await expect(t).toHaveAttribute("aria-expanded", "true", { timeout: 2000 });
  }).toPass({ timeout: 20000 });
  return page.locator(".hub-attention");
}

// 1 Nov (Nick): 60/120 days. A reminder from day 60; out of suggestions from day 121.
test("AV-07 the 120-day rule: confirmed through day 120, stale from day 121", async ({ page, context, baseURL }) => {
  await reset();
  await signInAs(context, "avery", baseURL!);
  const day = (d: number) => q(`update profiles set availability_confirmed_at = now() - ($2 || ' days')::interval - interval '1 hour' where id = $1`, [avery(), String(d - 1)]);
  // The age shown and the search rule agree on every boundary day.
  for (const [days, fresh] of [[119, true], [120, true], [121, false]] as const) {
    await q(`update profiles set availability_confirmed_at = now() - ($2 || ' days')::interval - interval '1 hour' where id = $1`, [avery(), String(days)]);
    const viewer = account("bram").id;
    const { rows } = await asMember(viewer, `select (public.network_directory('{"available": true}'::jsonb) -> 'people') as people`);
    const ids = (rows[0].people as any[]).map((p) => p.id);
    expect(ids.includes(avery()), `day ${days} in confirmed-available-now`).toBe(fresh);
    await page.goto("/dashboard");
    // The Hub's Actions (1 Nov): a gentle reminder from day 60, and "needs reconfirming" once the 120 days have passed.
    const line = await openActions(page);
    // v3: from day 90 it is the quarterly check.
    await expect(line).toContainText(fresh ? /Reconfirm your availability|quarterly availability check/ : /needs reconfirming/);
    if (fresh) await expect(line).not.toContainText("needs reconfirming");
  }
});

test("AV-08 spaces are one overall number, not multiplied by licensed states", async () => {
  await reset();
  await q(`insert into licenses (profile_id, state, license_number, license_type, expiration_date, status, reviewed_at, notes) values ($1, 'CT', 'STG-AV-CT-1', 'Psychologist', current_date + 300, 'active', now(), 'Fictional staging licence') on conflict do nothing`, [avery()]);
  try {
    const viewer = account("bram").id;
    const { rows } = await asMember(viewer, `select public.workspace_people() as p`);
    const me = (rows[0].p as any[]).find((p) => p.id === avery());
    expect(me.slots).toBe(3);
    expect(Object.keys(me.licenses).sort()).toEqual(["CT", "NY"]);
  } finally {
    await q(`delete from licenses where profile_id = $1 and license_number = 'STG-AV-CT-1'`, [avery()]);
  }
});

test("AV-09 a member whose verification is still in progress gets the Hub with a waiting note, and the old Home redirects there", async ({ page, context, baseURL }) => {
  await signInAs(context, "pell", baseURL!);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  // 1 Nov (Nick, E): the waiting note is an action in the Hub's Actions.
  // v3 (Nick, 4 Nov): a submitted license leaves Actions; the waiting member sees Profile setup.
  await expect(await openActions(page)).toContainText("Profile setup");
  await expect(page.locator(".hub-card")).toHaveCount(3);
  await page.goto("/dashboard/overview");
  await expect(page).toHaveURL(/\/dashboard$/);
});
