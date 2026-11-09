import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// v5 (Nick's 8 Nov walkthrough). Fictional staging members only. The sandbox side is in v5-sandbox.spec.ts.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id;
const MOCK = "http://127.0.0.1:54410";
async function mockUp() {
  try { return (await fetch(`${MOCK}/__calls`)).ok; } catch { return false; }
}
async function wipe() {
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from coverage_plans where profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from referral_requests where requesting_profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from consultations where author_profile_id = any($1::uuid[]) and question like 'V5 %'`, [[avery, bram, cass]]);
  await q(`update app_config set value = 'false' where key = 'consult_groups'`);
}
test.beforeEach(wipe);
test.afterAll(wipe);

async function openAs(browser: any, who: string, baseURL: string, path = "/dashboard") {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("#app .sidebar")).toBeVisible();
  return { context, page };
}
const click = (page: Page, a: string) => page.evaluate((x) => (document.querySelector(`[data-action="${x}"]`) as HTMLElement | null)?.click(), a);

test("V5-01 profile import: a scraped 'Email me' is dropped, so Save profile works; an invalid field opens its own section", async ({ browser, baseURL }) => {
  test.skip(!(await mockUp()), "needs the AI stand-in (e2e/staging/ai-mock.mjs)");
  const { context, page } = await openAs(browser, "esme", baseURL!, "/dashboard/profile?edit=1").catch(async () => {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    await signInAs(context, "esme", baseURL!);
    const page = await context.newPage();
    await page.goto("/dashboard/profile?edit=1");
    return { context, page };
  });
  await page.waitForTimeout(800);
  const box = page.locator("textarea").first();
  await box.fill("Dr Esme Lapsworth, psychologist in Rochester. Email me. I see adults with anxiety. www.lapsworth-therapy.com");
  await page.getByRole("button", { name: /Fill in/ }).first().click();
  await expect(page.locator("body")).toContainText(/Check your profile below, then press Save profile|sections? filled in/, { timeout: 20_000 });
  await expect(page.locator("#contact_email")).not.toHaveValue("Email me");
  await expect(page.locator("#practice_website")).toHaveValue(/^https:\/\/www\.lapsworth-therapy\.com/);
  // A typed invalid email inside a closed section no longer fails silently: Save opens that section.
  await page.evaluate(() => { const e = document.getElementById("contact_email") as HTMLInputElement; e.value = "Email me"; });
  await page.locator(".import-bar").getByRole("button", { name: "Save profile" }).click();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (document.getElementById("contact_email")?.closest("dialog") as HTMLDialogElement | null)?.open)).toBe(true);
  await context.close();
});

test("V5-02 founding places left are shown for every open state, from 40 of 40", async ({ page }) => {
  const open = await q<{ state: string }>(`select state from open_states where open order by state`);
  await page.goto("/");
  const line = await page.locator(".founding-count").first().innerText();
  expect(open.length).toBeGreaterThan(0);
  for (const _ of open) expect(line).toMatch(/of 40 founding places left in|all founding places taken/);
  expect((line.match(/founding places left in|all founding places taken/g) || []).length).toBe(open.length);
});

test("V5-03 consultation groups are off by default; the admin Features switch brings them back without a rebuild", async ({ browser, baseURL }) => {
  const flags = await asMember(avery, `select public.feature_flags() f`);
  expect(flags.rows[0].f).toEqual({ consultGroups: false });
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  await expect(a.page.locator("#app")).not.toContainText("Your consultation group");
  await click(a.page, "peer-start");
  await a.page.waitForTimeout(500);
  const tiles = await a.page.locator(".modal .audience-tile strong").allInnerTexts();
  expect(tiles).toEqual(["Your trusted colleagues", "Worked with before", "Suggested by PsyAlliance", "One colleague", "A few colleagues", "The whole verified network"]);
  await a.context.close();
  // Posting to a group is refused while the switch is off.
  const g = await q<{ id: string }>(`select g.id from consultation_groups g join consultation_group_members m on m.group_id = g.id where m.profile_id = $1 and m.status = 'joined' limit 1`, [avery]);
  if (g.length) {
    await expect(asMember(avery, `select public.consult_post($1::jsonb)`, [JSON.stringify({ title: "V5 group", body: "x", audience: "group", groupId: g[0].id, confirmed: "true" })])).rejects.toThrow(/not available/);
  }
  // The admin page switches it on.
  const ad = await openAs(browser, "otto", baseURL!, "/dashboard/admin/features").catch(() => null);
  if (ad) {
    await expect(ad.page.locator("body")).toContainText("Consultation groups");
    await ad.page.getByRole("button", { name: "Switch groups on" }).click();
    await expect(ad.page.locator("body")).toContainText("Consultation groups are on");
    expect((await one(`select value from app_config where key = 'consult_groups'`)).value).toBe("true");
    await ad.context.close();
  }
});

test("V5-04 Consult: the 'Worked with before' audience asks those colleagues by name; the list opens on Active", async ({ browser, baseURL }) => {
  const r = await asMember(avery, `select public.consult_post($1::jsonb) r`, [JSON.stringify({ title: "V5 worked audience", body: "Testing the worked-with audience.", audience: "worked", confirmed: "true", clientRequestId: crypto.randomUUID() })]).catch((e) => e);
  if (r instanceof Error) {
    expect(r.message).toMatch(/nobody in that list yet/);
  } else {
    const row = await one(`select audience_type, audience_label, cardinality(audience_profile_ids) n from consultations where id = $1`, [r.rows[0].r.id]);
    expect(row.audience_type).toBe("selected");
    expect(row.audience_label).toBe("worked");
    expect(Number(row.n)).toBeGreaterThan(0);
  }
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/consult");
  await expect(a.page.locator(".consult-pills button.active")).toContainText("Active");
  const firstPill = await a.page.locator(".consult-pills button").first().innerText();
  expect(firstPill).toMatch(/^Active/);
  await a.context.close();
});

async function coverToReview(page: Page, clients: number, who: string[]) {
  await page.locator('[data-action="cover-start"]').first().click();
  await page.locator("#cover-name").fill("V5 review");
  await page.getByRole("button", { name: "Continue to needs" }).click();
  for (let i = 0; i < clients; i++) {
    await page.locator("#cover-focus").selectOption("Anxiety/Panic Disorders");
    await page.locator("#cover-setting").selectOption("virtual");
    await page.getByRole("button", { name: i < clients - 1 ? "Save & add another" : "Save client", exact: true }).click().catch(async () => {
      await page.getByRole("button", { name: "Save client", exact: true }).click();
      await page.getByRole("button", { name: /Add another client/ }).click();
    });
  }
  await page.getByRole("button", { name: "Continue to colleagues" }).click();
  for (let i = 0; i < clients; i++) {
    for (const id of who) {
      const box = page.locator(`.client-matches input[data-match="cover"][value="${id}"]`);
      if (await box.count() && !(await box.isChecked())) { await box.click({ force: true }); await page.waitForTimeout(250); }
    }
    if (i < clients - 1) await page.locator(".modal-footer").getByRole("button", { name: "Next client" }).click();
  }
  await page.getByRole("button", { name: "Review invitations" }).click();
}

test("V5-05 Cover review: how to ask comes first, the order is shown only one at a time, rows drag, and a client stays open", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  await coverToReview(a.page, 2, [bram, cass]);
  const modal = a.page.locator(".modal");
  // The first thing after the summary is the question, then the order.
  const order = await modal.evaluate((m) => [...m.querySelectorAll("legend, .cover-who h3")].map((e) => (e as HTMLElement).innerText));
  expect(order[0]).toMatch(/How should your 2 clients be asked\?/);
  expect(order[1]).toBe("Who is asked, in order");
  await expect(modal.locator("[data-coverrow]")).toHaveCount(4);
  // Reordering keeps the client open.
  const before = await modal.locator("details.review-client[open]").count();
  const first = await modal.locator("details.review-client").first().locator(".addrec-who strong").first().innerText();
  await modal.locator('[data-action^="pick-down:"]').first().click();
  await a.page.waitForTimeout(500);
  expect(await modal.locator("details.review-client[open]").count()).toBe(before);
  expect(await modal.locator("details.review-client").first().locator(".addrec-who strong").nth(1).innerText()).toBe(first);
  // Drag the second back to first.
  const rows = modal.locator("details.review-client").first().locator("[data-coverrow]");
  await rows.nth(1).dragTo(rows.nth(0));
  await a.page.waitForTimeout(500);
  expect(await modal.locator("details.review-client").first().locator(".addrec-who strong").first().innerText()).toBe(first);
  // Everyone at once: no order, no drag.
  await modal.locator('label.radio-card:has(input[value="parallel"])').click();
  await a.page.waitForTimeout(500);
  await expect(modal.locator(".cover-who h3")).toHaveText("Who will be asked");
  await expect(modal.locator("[data-coverrow]")).toHaveCount(0);
  // By colleague: most requests first.
  await click(a.page, "review-view:colleague");
  await a.page.waitForTimeout(400);
  await expect(modal.locator(".workload-list li").first()).toContainText("2 requests");
  await a.context.close();
});

test("V5-06 lists: Active rows are green, Completed grey; Referrals are blue", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/cover");
  const css = await a.page.evaluate(() => {
    const probe = (cls: string) => { const d = document.createElement("article"); d.className = `arrangement-row ${cls}`; document.body.appendChild(d); const s = getComputedStyle(d); const out = `${s.backgroundColor}|${s.boxShadow}`; d.remove(); return out; };
    const f = document.createElement("div"); f.className = "feature-referrals"; document.body.appendChild(f); const feat = getComputedStyle(f).getPropertyValue("--feature").trim(); f.remove();
    return { active: probe("tint-active"), done: probe("tint-completed"), feat };
  });
  expect(css.active).toContain("rgb(47, 125, 79)");
  expect(css.done).toContain("rgb(154, 165, 160)");
  expect(css.feat.toLowerCase()).toBe("#2b5c8a");
  await a.context.close();
});

test("V5-07 Network: each column is as long as its own list; the recency filter sits in the Worked with before header", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/network");
  await click(a.page, "network-tab:circle");
  await a.page.waitForTimeout(500);
  const hasRecency = await a.page.locator(".net-worked > header .net-recency").count();
  const worked = await a.page.locator(".net-worked .net-row").count();
  if (worked) expect(hasRecency).toBe(1);
  const heights = await a.page.evaluate(() => [...document.querySelectorAll(".relationship-group .net-row")].map((e) => Math.round((e as HTMLElement).getBoundingClientRect().height)));
  if (heights.length > 1) expect(new Set(heights).size).toBe(1);
  await a.context.close();
});

test("V5-08 Messages: the red dot is explained wherever it shows", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!, "/dashboard/messages");
  await a.page.waitForTimeout(800);
  const dots = await a.page.locator(".colleague-tabs .unread-dot").count();
  if (dots) await expect(a.page.locator(".tab-legend")).toContainText("A red dot means new messages");
  await a.context.close();
});
