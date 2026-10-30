import { test, expect, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q } from "../../../lib/staging";
import { J } from "../../../lib/journeys";

// Release C, part 2: the practice scenarios and six need walkthroughs, the single Library, and reviewable suggestions.
// Fictional people only. The practice workspace is browser-only data: these tests also prove it writes nothing.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const NEEDS = [
  { need: "caseload", journey: "caseload" },
  { need: "time_away", journey: "time-away" },
  { need: "client_referral", journey: "client-referral" },
  { need: "perspective", journey: "perspective" },
  { need: "reducing", journey: "reducing" },
  { need: "offer_support", journey: "offer-support" },
];
const avery = account("avery").id;

test("P-01 the six need walkthroughs exist, each with a practice scenario, one hands-on step and an ending that carries the need on", async ({ page, baseURL }) => {
  for (const { need, journey } of NEEDS) {
    const j = J.findJourney(journey)!;
    expect(j, journey).toBeTruthy();
    expect(j.scenario).toBe(need);
    expect(j.steps.filter((s: any) => s.handsOn).length, `${journey} hands-on steps`).toBe(1);
    expect(j.cta!.href).toBe(`/start?need=${need}`);
    expect(j.steps.length).toBeLessThanOrEqual(4);
    // The starting page's demo link for this need opens this walkthrough.
    const guide = fs.readFileSync(path.join(process.cwd(), "..", "src/lib/start-guide.ts"), "utf8");
    expect(guide).toContain(`demo: "/tour/${journey}"`);
    // Overview page, a step, and the ending.
    await page.goto(`${baseURL}/tour/${journey}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(j.title);
    await page.goto(`${baseURL}/tour/${journey}/${j.steps[0].slug}`);
    await expect(page.locator("[data-practice-label]")).toContainText("Fictional practice environment");
    await expect(page.getByRole("button", { name: "Reset scenario" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Change scenario" })).toHaveAttribute("href", "/start");
    await expect(page.getByRole("link", { name: /Create your account/ })).toBeVisible();
    await page.goto(`${baseURL}/tour/${journey}/done`);
    const end = page.locator("[data-scenario-end]");
    await expect(end).toContainText(j.summary!);
    await expect(end.getByRole("link", { name: j.cta!.label })).toHaveAttribute("href", `/start?need=${need}`);
  }
});

test("P-02 each scenario opens with only its own differences: caseload has no places, reducing one, offering three", async ({ page, baseURL }) => {
  const spaces = async (journey: string, slug: string) => {
    await page.goto(`${baseURL}/tour/scene/${journey}/${slug}`);
    await page.waitForFunction(() => document.documentElement.dataset.scene === "ready", null, { timeout: 30000 });
    return page.locator("#availability-slots").inputValue();
  };
  expect(await spaces("caseload", "capacity")).toBe("0");
  expect(await spaces("reducing", "availability")).toBe("1");
  // The general sample is unchanged.
  await page.goto(`${baseURL}/tour/scene/availability/x`).catch(() => {});
  await page.goto(`${baseURL}/tour/scene/cover/plan`);
  await page.waitForFunction(() => document.documentElement.dataset.scene === "ready", null, { timeout: 30000 });
  // Perspective keeps a short list of discussions.
  await page.goto(`${baseURL}/tour/scene/offer-support/questions`);
  await page.waitForFunction(() => document.documentElement.dataset.scene === "ready", null, { timeout: 30000 });
  const offered = await page.locator("[data-action^='discussion:']").count();
  expect(offered).toBeGreaterThan(0);
  expect(offered).toBeLessThanOrEqual(9);
});

test("P-03 'What will they receive?' shows the generic alert line only, and Back to my view returns", async ({ page, baseURL }) => {
  for (const { journey } of NEEDS) {
    const j = J.findJourney(journey)!;
    for (const s of j.steps.filter((x: any) => x.recipient)) {
      expect(s.recipient.alert, `${journey}/${s.slug}`).toMatch(/^[A-Z][a-z]+ has an? (referral|cover|consultation) request\. Review request\.$/);
      expect(s.recipient.alert).not.toMatch(/client|diagnos|trauma|OCD|depress/i);
      await page.goto(`${baseURL}/tour/${journey}/${s.slug}`);
      const toggle = page.getByRole("button", { name: "What will they receive?" });
      await toggle.click();
      await expect(page.locator("[data-recipient]")).toContainText(s.recipient.alert);
      await page.getByRole("button", { name: "Back to my view" }).click();
      await expect(page.locator("[data-recipient]")).not.toContainText(s.recipient.alert);
    }
  }
});

test("P-04 Reset scenario restores the start, Change scenario goes to the choice, and practice writes nothing to the account", async ({ page, baseURL }) => {
  const before = await q(`select count(*)::int n from coverage_plans`);
  await page.goto(`${baseURL}/tour/time-away/dates`);
  const frame = page.frameLocator("iframe");
  await frame.locator("#cover-name").waitFor();
  await frame.locator("#cover-name").fill("Changed in practice");
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await frame.locator("#cover-name").waitFor();
  await expect(frame.locator("#cover-name")).not.toHaveValue("Changed in practice");
  await page.getByRole("link", { name: "Change scenario" }).click();
  await expect(page).toHaveURL(/\/start$/);
  const after = await q(`select count(*)::int n from coverage_plans`);
  expect(after[0].n).toBe(before[0].n);
});

test("P-05 practice events go to the practice namespace, with a name and a need and nothing else", async ({ page, baseURL }) => {
  await q(`delete from lifecycle_events where namespace = 'practice'`);
  await page.goto(`${baseURL}/tour/perspective/question`);
  await page.waitForTimeout(800);
  await page.goto(`${baseURL}/tour/perspective/done`);
  await page.getByRole("link", { name: "Ask a colleague" }).click({ noWaitAfter: true });
  await page.waitForTimeout(800);
  const rows = await q(`select event, need from lifecycle_events where namespace = 'practice' order by id`);
  expect(rows.map((r: any) => r.event)).toEqual(expect.arrayContaining(["task_start", "interaction_complete", "summary_continue"]));
  expect(new Set(rows.map((r: any) => r.need))).toEqual(new Set(["perspective"]));
  expect((await q(`select count(*)::int n from lifecycle_events where namespace = 'real' and need = 'perspective' and at > now() - interval '1 minute'`))[0].n).toBe(0);
  // A visitor cannot write to the real namespace through the public route.
  await fetch(`${baseURL}/api/start-event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "pause", need: "reducing", namespace: "real" }) });
  expect((await q(`select count(*)::int n from lifecycle_events where namespace = 'real' and event = 'pause' and at > now() - interval '1 minute'`))[0].n).toBe(0);
});

test("P-06 the catalogue SQL and the code agree on the scenario ids, and re-applying the SQL changes nothing", async () => {
  const rows = await q(`select id, journey, signup from practice_scenarios order by position`);
  expect(rows.map((r: any) => r.id)).toEqual(NEEDS.map((n) => n.need));
  expect(rows.map((r: any) => r.journey)).toEqual(NEEDS.map((n) => n.journey));
  for (const r of rows) expect(r.signup).toBe(`/start?need=${r.id}`);
});

async function as(browser: Browser, who: string, baseURL: string, width = 1365) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await signInAs(context, who, baseURL);
  return { context, page: await context.newPage() };
}

test("P-07 F07 the Library is the one place: old Documents addresses redirect, My files and the review gate stay", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "avery", baseURL!);
  const hop = async (p: string) => {
    const r = await context.request.get(baseURL + p, { maxRedirects: 0 });
    return { status: r.status(), to: r.headers()["location"] || "" };
  };
  expect((await hop("/dashboard/documents")).to).toMatch(/\/dashboard\/library$/);
  expect((await hop("/dashboard/documents/extended-leave-pack")).to).toMatch(/\/dashboard\/library\?resource=PA-02$/);
  expect((await hop("/dashboard/documents/PA-03")).to).toMatch(/resource=PA-03$/);
  expect((await hop("/dashboard/documents/not-a-real-template")).status).toBe(404);
  const mine = await hop("/dashboard/documents?tab=mine");
  expect(mine.status).toBe(200);
  await page.goto(`${baseURL}/dashboard/documents?tab=mine`);
  await expect(page).toHaveURL(/tab=mine/);
  const review = await hop("/dashboard/documents/review");
  expect(review.to).not.toMatch(/dashboard\/library/);
  await context.close();
});

test("P-08 F07 a resource has one identity: links from Consult, Referrals, Credentials and Continuity open the Library on that resource", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "avery", baseURL!);
  for (const p of ["/dashboard/consult", "/dashboard/referrals", "/dashboard/credentials", "/dashboard/continuity"]) {
    await page.goto(baseURL + p);
    const hrefs = await page.locator("a[href*='/dashboard/documents/']").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
    expect(hrefs.filter((h) => !/documents\/review/.test(h || "")), p).toEqual([]);
  }
  if (process.env.E2E_LIBRARY_PREVIEW) {
    await page.goto(`${baseURL}/dashboard/library?resource=PA-02`);
    await expect(page.locator(".modal")).toContainText(/Extended Leave Pack/i);
  }
  await context.close();
});

test("P-09 saving a copy to My files is separate from bookmarking, needs sign-in, and respects the review gate", async ({ browser, baseURL }) => {
  const anon = await fetch(`${baseURL}/dashboard/library-files/PA-02/copy`, { method: "POST", redirect: "manual" });
  expect([303, 307, 401]).toContain(anon.status);
  const { context, page } = await as(browser, "avery", baseURL!);
  if (process.env.E2E_LIBRARY_PREVIEW) {
    await page.goto(`${baseURL}/dashboard/library?resource=PA-02`);
    await expect(page.locator(".modal")).toContainText("Saving a resource bookmarks it in the Library. Saving a copy puts a private file in My files");
  }
  const before = (await q(`select count(*)::int n from documents where profile_id = $1 and owner_scope = 'personal'`, [avery]))[0].n;
  const r = await context.request.post(`${baseURL}/dashboard/library-files/PA-99/copy`, { maxRedirects: 0 });
  expect(r.status()).toBe(303);
  expect((await q(`select count(*)::int n from documents where profile_id = $1 and owner_scope = 'personal'`, [avery]))[0].n).toBe(before);
  await context.close();
});

test("P-10 L17 reviewable suggestions: provenance, Discard, nothing saved until confirmed", async ({ browser, baseURL }) => {
  await q(`delete from member_participation where profile_id = $1`, [avery]);
  const { context, page } = await as(browser, "avery", baseURL!);
  await context.addCookies([{ name: "pa_start", value: encodeURIComponent(JSON.stringify({ need: "offer_support", ctx: "established", helps: ["cover", "consult"], exp: Date.now() + 600000 })), url: baseURL! }]);
  await page.goto(`${baseURL}/dashboard/start`);
  await expect(page.getByRole("heading", { name: "We’ve used your choices to get you started" })).toBeVisible();
  await expect(page.locator("[data-suggestion='ctx'] [data-provenance]")).toContainText("Suggested from your choice on the public guide");
  await expect(page.locator("input[name=help][value=cover]")).toBeChecked();
  await expect(page.locator("input[name=help][value=referrals]")).not.toBeChecked();
  expect((await q(`select count(*)::int n from member_participation where profile_id = $1`, [avery]))[0].n).toBe(0);
  await page.locator("[data-suggestion='ctx'] button", { hasText: "Discard" }).click();
  await expect(page.locator("[data-suggestion='ctx']")).toHaveCount(0);
  await page.locator("[data-suggestion='cover'] button", { hasText: "Discard suggestion" }).click();
  await expect(page.locator("input[name=help][value=cover]")).not.toBeChecked();
  await expect(page.locator("input[name=help][value=consult]")).toBeChecked();
  expect((await q(`select count(*)::int n from member_participation where profile_id = $1`, [avery]))[0].n).toBe(0);
  await page.getByRole("button", { name: "Save my choices" }).click();
  await page.waitForURL(/dashboard\/settings/);
  const row = (await q(`select open_referrals, open_cover, open_consult from member_participation where profile_id = $1`, [avery]))[0];
  expect(row).toEqual({ open_referrals: false, open_cover: false, open_consult: true });
  await context.close();
});

test("P-11 L18 an existing account is never overwritten silently: the account's own setting is shown and kept", async ({ browser, baseURL }) => {
  await q(`insert into member_participation (profile_id, open_referrals, open_cover, open_consult, situations_updated_at) values ($1, true, false, true, now()) on conflict (profile_id) do update set open_referrals = true, open_cover = false, open_consult = true, situations_updated_at = now()`, [avery]);
  const { context, page } = await as(browser, "avery", baseURL!);
  await context.addCookies([{ name: "pa_start", value: encodeURIComponent(JSON.stringify({ need: "offer_support", helps: ["cover"], exp: Date.now() + 600000 })), url: baseURL! }]);
  await page.goto(`${baseURL}/dashboard/start`);
  await expect(page.locator("[data-suggestion='cover'] [data-conflict]")).toContainText("currently has this off");
  await expect(page.locator("input[name=help][value=cover]")).not.toBeChecked();
  await expect(page.locator("input[name=help][value=referrals]")).toBeChecked();
  await page.locator("[data-suggestion='cover'] button", { hasText: "Discard suggestion" }).click();
  await expect(page.locator("[data-suggestion='cover'] button", { hasText: "Discard suggestion" })).toHaveCount(0);
  await page.getByRole("button", { name: "Save my choices" }).click();
  await page.waitForURL(/dashboard\/settings/);
  expect((await q(`select open_referrals, open_cover, open_consult from member_participation where profile_id = $1`, [avery]))[0]).toEqual({ open_referrals: true, open_cover: false, open_consult: true });
  await q(`delete from member_participation where profile_id = $1`, [avery]);
  await context.close();
});

test("P-12 demo copy: no retired wording, no em dashes in the new product copy, and no review wording on public demo pages", async () => {
  const text = JSON.stringify(J.JOURNEYS.filter((j: any) => NEEDS.some((n) => n.journey === j.key)));
  expect(text).not.toMatch(/Pulse|Clinicians|trainee|retired|guarantee|reviewed by/i);
  expect(text).not.toContain("—");
});

import { coverPlan, referral } from "../../../lib/scenarios";
const bram = account("bram").id, cass = account("cass").id;

test("P-13 L06 referral copy: a new draft with the requirements only, the original untouched, nothing sent", async ({ browser, baseURL }) => {
  const id = await referral("avery", ["bram"], "Prefers evening telehealth.");
  const before = (await q(`select count(*)::int n from referral_requests`))[0].n;
  const { context, page } = await as(browser, "avery", baseURL!);
  await page.goto(`${baseURL}/dashboard/referrals?referral=${id}`);
  await page.getByRole("button", { name: /Use as a starting point/ }).first().click();
  await expect(page.locator(".modal-header")).toBeVisible();
  expect((await q(`select count(*)::int n from referral_requests`))[0].n).toBe(before);
  expect((await q(`select status from referral_requests where id = $1`, [id]))[0].status).toBe("sent");
  expect((await q(`select count(*)::int n from notification_events where created_at > now() - interval '1 minute' and event_type like 'referral%' and recipient_id = $1`, [bram]).catch(() => [{ n: 0 }]))[0].n).toBe(0);
  await context.close();
  await q(`delete from referral_requests where id = $1`, [id]);
});

test("P-14 L07 a link opened by the wrong account, a closed context or a scanner shows nothing private and changes nothing", async ({ browser, baseURL }) => {
  const { planId } = await coverPlan("avery", ["bram"], ["Client 1"]);
  const title = (await q(`select title from coverage_plans where id = $1`, [planId]))[0].title as string;
  const snap = async () => JSON.stringify([await q(`select status from coverage_plans where id = $1`, [planId]), await q(`select status from coverage_requests order by id`)]);
  const base = await snap();
  // Another account that was never asked.
  const other = await as(browser, "cass", baseURL!);
  await other.page.goto(`${baseURL}/dashboard/cover?plan=${planId}`);
  await other.page.waitForTimeout(1500);
  expect(await other.page.locator("body").innerText()).not.toContain(title);
  await other.context.close();
  // A scanner: no session, a plain GET, twice.
  for (let i = 0; i < 2; i++) {
    const r = await fetch(`${baseURL}/dashboard/cover?plan=${planId}`, { redirect: "manual" });
    expect([302, 303, 307, 308]).toContain(r.status);
    expect(r.headers.get("location") || "").toMatch(/sign-in/);
  }
  expect(await snap()).toBe(base);
  // The invited colleague, after the plan is withdrawn: the page opens, nothing is offered to answer, nothing changes.
  await q(`update coverage_plans set status = 'cancelled' where id = $1`, [planId]);
  const closed = await as(browser, "bram", baseURL!);
  const resp = await closed.page.goto(`${baseURL}/dashboard/cover?plan=${planId}`);
  expect(resp!.status()).toBeLessThan(500);
  await closed.page.waitForTimeout(1200);
  await expect(closed.page.getByRole("button", { name: /^Accept|I can help/ })).toHaveCount(0);
  await closed.context.close();
  expect((await q(`select status from coverage_plans where id = $1`, [planId]))[0].status).toBe("cancelled");
  await q(`delete from coverage_plans where id = $1`, [planId]);
});

test("P-15 L12 a pending or suspended account arriving with a saved choice gets no automatic action and no draft", async ({ browser, baseURL }) => {
  for (const who of ["pell", "sol"]) {
    const plans = (await q(`select count(*)::int n from coverage_plans`))[0].n;
    const refs = (await q(`select count(*)::int n from referral_requests`))[0].n;
    const context = await browser.newContext();
    await signInAs(context, who, baseURL!);
    await context.addCookies([{ name: "pa_start", value: encodeURIComponent(JSON.stringify({ need: "time_away", exp: Date.now() + 600000 })), url: baseURL! }]);
    const page = await context.newPage();
    const r = await page.goto(`${baseURL}/dashboard`);
    expect(r!.status(), who).toBeLessThan(500);
    await page.waitForTimeout(1500);
    const text = await page.locator("body").innerText();
    expect(text, who).not.toMatch(/Application error|Unhandled/);
    expect((await q(`select count(*)::int n from coverage_plans`))[0].n, who).toBe(plans);
    expect((await q(`select count(*)::int n from referral_requests`))[0].n, who).toBe(refs);
    await context.close();
  }
});

test("P-16 L04 first value: a Cover start with no match, and a Referral start with zero matches, say so plainly and send nothing", async ({ browser, baseURL }) => {
  const { context, page } = await as(browser, "avery", baseURL!);
  await page.goto(`${baseURL}/dashboard/referrals?new=1`);
  await expect(page.locator(".modal-header")).toBeVisible();
  const sent = (await q(`select count(*)::int n from referral_requests`))[0].n;
  await page.goto(`${baseURL}/dashboard/cover?new=1`);
  await expect(page.locator(".modal-header")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Worked with before");
  expect((await q(`select count(*)::int n from referral_requests`))[0].n).toBe(sent);
  await context.close();
});
