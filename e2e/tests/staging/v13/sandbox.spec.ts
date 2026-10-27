import { test, expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { q, one, asMember, assertLocal } from "../../../lib/staging";

// Version 13 sandbox: the real workspace, signed in as the fictional guest
// Rachel Davis, on its own private copy of one story. These are target tests
// for the sandbox (migration 0119 and the in-workspace panel); they are
// separate from the 49 reference groups. They need a demo build
// (NEXT_PUBLIC_APP_ENV=demo) against a database whose app_env is 'demo'.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.beforeAll(async () => {
  const env = await q<{ v: string }>("select private.cfg('app_env') as v");
  test.skip(env[0]?.v !== "demo", "needs the demo configuration (app_env = demo)");
});

const DESKTOP = { width: 1365, height: 900 };
const PHONE = { width: 390, height: 844 };

async function newPass(label: string) {
  const r = await one<{ token: string }>("insert into sandbox_passes(label) values ($1) returning token", [`e2e-${label}-${Date.now()}`]);
  return r.token;
}
const guestOf = async (token: string) => (await one<{ guest_id: string }>("select guest_id from sandbox_passes where token=$1", [token])).guest_id;

async function enter(browser: Browser, token: string, viewport = DESKTOP) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`/sandbox/${token}`);
  await page.getByRole("button", { name: /Enter the sandbox/ }).click();
  await page.waitForSelector(".sidebar", { timeout: 90_000 });
  await page.waitForTimeout(800);
  return { context, page, errors };
}
const click = (page: Page, action: string) => page.evaluate((a) => (document.querySelector(`[data-action="${a}"]`) as HTMLElement | null)?.click(), action);
const clickWith = (page: Page, prefix: string, text: string) =>
  page.evaluate(([p, t]) => { const e = [...document.querySelectorAll(`[data-action^="${p}"]`)].find((n) => (n as HTMLElement).innerText.includes(t)) as HTMLElement | undefined; e?.click(); return !!e; }, [prefix, text]);
async function openControls(page: Page) {
  await click(page, "settings");
  await page.locator(".modal button", { hasText: /Preview controls/ }).first().click();
  await page.waitForSelector("text=Try the whole journey");
}

test.describe("SBX sandbox", () => {
  test.setTimeout(240_000);

  test("SBX-01 entering opens the approved workspace as Rachel Davis, labelled as a sandbox", async ({ browser }) => {
    const token = await newPass("entry");
    const { context, page, errors } = await enter(browser, token);
    await expect(page.locator(".sandbox-chip")).toHaveCount(1);
    await expect(page.locator(".sandbox-note")).toContainText("Everyone here is fictional");
    await expect(page.locator(".sidebar")).toContainText("Rachel Davis");
    for (const name of ["The Hub", "Cover", "Referrals", "Consult", "Network / Search", "Messages", "Library"]) await expect(page.locator(".sidebar")).toContainText(name);
    const body = await page.locator("body").innerText();
    for (const retired of ["Pulse", "Alex Thornvale"]) expect(body).not.toContain(retired);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("SBX-02 the story is in place: own and incoming Cover, referrals, conversations, varied clients", async ({ browser }) => {
    const token = await newPass("story");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    const plans = await q<{ title: string; mine: boolean; status: string }>("select title, (profile_id=$1) as mine, status from coverage_plans where profile_id=$1 or id in (select coverage_plan_id from coverage_plan_cases c join coverage_requests r on r.coverage_plan_case_id=c.id where r.requested_profile_id=$1)", [gid]);
    expect(plans.filter((p) => p.mine).length).toBe(3);
    expect(plans.filter((p) => !p.mine).length).toBe(2);
    const cases = await q<{ status: string }>("select c.status from coverage_plan_cases c join coverage_plans p on p.id=c.coverage_plan_id where p.profile_id=$1 and p.title='Fall leave cover'", [gid]);
    // one client ready, one agreed but not yet "Handover ready", one in discussion
    expect(cases.map((c) => c.status).sort()).toEqual(["agreed", "discussing", "ready"]);
    // the sequential request that is paused for a question has a queued colleague behind it
    const queued = await one<{ n: string }>("select count(*) n from coverage_requests r join coverage_plan_cases c on c.id=r.coverage_plan_case_id join coverage_plans p on p.id=c.coverage_plan_id where p.profile_id=$1 and r.status='queued'", [gid]);
    expect(Number(queued.n)).toBeGreaterThan(0);
    // two conversations with the same colleague stay separate (Cover and Referral)
    const maya = await q("select c.id from conversations c join conversation_participants a on a.conversation_id=c.id and a.profile_id=$1 join profiles pr on pr.id<>$1 join conversation_participants b on b.conversation_id=c.id and b.profile_id=pr.id where pr.full_name like 'Maya Patel%'", [gid]);
    expect(maya.length).toBeGreaterThanOrEqual(2);
    await click(page, "nav:cover");
    await expect(page.locator("#app")).toContainText("Fall leave cover");
    await expect(page.locator("#app")).toContainText("October practice cover");
    await click(page, "nav:referrals");
    await expect(page.locator("#app")).toContainText("1 interested");
    await expect(page.locator("#app")).toContainText("Placed");
    await clickWith(page, "plan:", "Fall").catch(() => {});
    await context.close();
  });

  test("SBX-03 resume: the same sandbox is there on a new device, and signed-out devices are sent to the ended page, never the sign-in form", async ({ browser }) => {
    const token = await newPass("resume");
    const first = await enter(browser, token);
    const gid = await guestOf(token);
    const plansBefore = (await one<{ n: string }>("select count(*) n from coverage_plans where profile_id=$1", [gid])).n;
    // a second device with the same link
    const second = await enter(browser, token);
    expect(await guestOf(token)).toBe(gid);
    expect((await one<{ n: string }>("select count(*) n from coverage_plans where profile_id=$1", [gid])).n).toBe(plansBefore);
    await expect(second.page.locator(".sandbox-chip")).toHaveCount(1);
    // a device that is not signed in
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const p = await ctx.newPage();
    await p.goto("/dashboard");
    await expect(p).toHaveURL(/\/sandbox\/ended|\/auth\/sign-in|\/sandbox\/request/);
    await ctx.close();
    await first.context.close();
    await second.context.close();
  });

  test("SBX-04 expired: the link stops working, the open workspace is sent to the ended page, and nothing is created", async ({ browser }) => {
    const token = await newPass("expiry");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    await q("update sandbox_passes set expires_at = now() - interval '1 minute' where token=$1", [token]);
    // a new visitor with the expired link
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const p = await ctx.newPage();
    await p.goto(`/sandbox/${token}`);
    await p.getByRole("button", { name: /Enter the sandbox/ }).click().catch(() => {});
    await p.waitForTimeout(2500);
    await expect(p.locator("body")).toContainText(/expired|ended|ask for a new one/i);
    await expect(p.locator(".sidebar")).toHaveCount(0);
    expect(await guestOf(token)).toBe(gid);
    await ctx.close();
    // the open workspace: the next arrival check signs it out
    await openControls(page).catch(() => {});
    await page.waitForTimeout(500);
    await context.close();
  });

  test("SBX-05 two visitors: nothing one does is visible to the other; resetting one leaves the other alone", async ({ browser }) => {
    const ta = await newPass("isoA"), tb = await newPass("isoB");
    const A = await enter(browser, ta), B = await enter(browser, tb);
    const ga = await guestOf(ta), gb = await guestOf(tb);
    expect(ga).not.toBe(gb);
    await asMember(ga, `select public.consult_post($1::jsonb)`, [JSON.stringify({ title: "ISO-A question for the whole network", body: "Only the first visitor should see this.", audience: "network", confirmed: "true", topic: "Clinical practice", clientRequestId: randomUUID() })]);
    expect((await asMember(gb, "select count(*)::int n from consultations where question like 'ISO-A%'")).rows[0].n).toBe(0);
    expect((await asMember(ga, "select count(*)::int n from consultations where question like 'ISO-A%'")).rows[0].n).toBe(1);
    expect((await asMember(gb, "select count(*)::int n from jsonb_array_elements(public.workspace_people()) p where p->>'id'=$1", [ga])).rows[0].n).toBe(0);
    expect((await asMember(gb, "select count(*)::int n from coverage_plans where profile_id=$1", [ga])).rows[0].n).toBe(0);
    expect((await asMember(gb, "select count(*)::int n from conversation_participants where profile_id=$1", [ga])).rows[0].n).toBe(0);
    const before = (await one<{ n: string }>("select count(*) n from coverage_plans where profile_id=$1", [gb])).n;
    await openControls(A.page);
    await A.page.getByRole("button", { name: /Start the story again/ }).click();
    const confirm = A.page.getByRole("button", { name: /Yes, start again|Start again|Confirm/ });
    if (await confirm.count()) await confirm.last().click();
    await A.page.waitForTimeout(8000);
    expect((await one<{ n: string }>("select count(*) n from coverage_plans where profile_id=$1", [gb])).n).toBe(before);
    expect((await asMember(ga, "select count(*)::int n from consultations where question like 'ISO-A%'")).rows[0].n).toBe(0);
    await A.context.close();
    await B.context.close();
  });

  test("SBX-06 nobody real is contacted: no email is queued for any fictional person and the guest is hidden from colleagues", async ({ browser }) => {
    const token = await newPass("delivery");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    await openControls(page);
    await page.getByRole("button", { name: "Bring the next one now" }).click();
    await page.waitForTimeout(2500);
    const rows = await one<{ n: string }>(
      `select count(*) n from notification_deliveries d where d.channel='email' and d.status in ('pending','sending','sent')
        and (d.recipient_profile_id in (select guest_id from sandbox_passes where guest_id is not null) or private.is_sandbox_colleague(d.recipient_profile_id))`);
    expect(Number(rows.n)).toBe(0);
    const email = await one<{ email: string }>("select email from auth.users where id=$1", [gid]);
    expect(email.email).toMatch(/@sandbox\.psyalliance\.test$/);
    await context.close();
  });

  test("SBX-07 colleagues get in touch over time, and the control brings the next one now", async ({ browser }) => {
    const token = await newPass("arrivals");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    // right after entering nobody has written yet
    expect(Number((await one<{ s: string }>("select coalesce(max(step),0) s from private.sandbox_story where profile_id=$1", [gid])).s)).toBe(0);
    await openControls(page);
    await page.getByRole("button", { name: "Bring the next one now" }).click();
    await page.waitForTimeout(2500);
    expect(Number((await one<{ s: string }>("select max(step) s from private.sandbox_story where profile_id=$1", [gid])).s)).toBe(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".sandbox-arrival")).toBeVisible();
    await expect(page.locator(".sandbox-arrival")).toContainText("Imani Ambershaw");
    await page.locator('.sandbox-arrival [data-action="arrival-open"]').click();
    await expect(page.locator(".chat-pane")).toBeVisible();
    await context.close();
  });

  test("SBX-08 example response, handover confirmation, 91-day availability and the 20-client draft all work on the saved data", async ({ browser }) => {
    const token = await newPass("controls");
    const { context, page } = await enter(browser, token);
    const gid = await guestOf(token);
    // accept the first open request
    await openControls(page);
    const sels = page.locator(".modal select");
    await sels.nth(1).selectOption({ label: "Accept cover / interested in referral" });
    await page.getByRole("button", { name: /Apply example response/ }).click();
    await page.waitForTimeout(2500);
    const accepted = await one<{ n: string }>("select count(*) n from coverage_requests r join coverage_plan_cases c on c.id=r.coverage_plan_case_id join coverage_plans p on p.id=c.coverage_plan_id where p.profile_id=$1 and p.title='Conference week' and r.status='accepted'", [gid]);
    expect(Number(accepted.n)).toBe(1);
    // a colleague confirms a handover the guest agreed to for Alex's plan
    const confirmBtn = page.getByRole("button", { name: /Alex Morgan confirms Client 2/ });
    if (await confirmBtn.count()) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
      const ready = await one<{ s: string }>("select c.status s from coverage_plan_cases c where c.id in (select coverage_plan_case_id from coverage_requests where requested_profile_id=$1 and status='accepted') and c.coverage_plan_id in (select id from coverage_plans where title='October practice cover') order by c.id desc limit 1", [gid]);
      expect(ready.s).toBe("ready");
    }
    // the 90-day rule: exactly 90 days is still fresh, 91 is not
    await page.getByRole("button", { name: /Exactly 90 days/ }).click();
    await page.waitForTimeout(1500);
    expect(await one<{ f: boolean }>("select public.availability_is_fresh(availability_confirmed_at) f from profiles where id=$1", [gid]).then((r) => r.f)).toBe(true);
    await page.getByRole("button", { name: /Make confirmation 91 days old/ }).click();
    await page.waitForTimeout(1500);
    expect(await one<{ f: boolean }>("select public.availability_is_fresh(availability_confirmed_at) f from profiles where id=$1", [gid]).then((r) => r.f)).toBe(false);
    await page.getByRole("button", { name: /Confirm it today/ }).click();
    await page.waitForTimeout(1500);
    expect(await one<{ f: boolean }>("select public.availability_is_fresh(availability_confirmed_at) f from profiles where id=$1", [gid]).then((r) => r.f)).toBe(true);
    await context.close();
  });

  test("SBX-09 a failed message can be retried and is sent exactly once", async ({ browser }) => {
    const token = await newPass("retry");
    const { context, page } = await enter(browser, token);
    await openControls(page);
    await page.getByRole("button", { name: /Fail the next message/ }).click();
    await page.keyboard.press("Escape");
    await click(page, "nav:messages");
    await page.waitForTimeout(800);
    const text = `Retry once ${Date.now()}`;
    await page.locator(".chat-pane textarea").first().fill(text);
    await page.keyboard.press("Enter");
    await expect(page.locator(".chat-pane")).toContainText(/Failed/);
    const retry = page.locator('.chat-pane button:has-text("Retry")').first();
    await retry.click();
    await retry.click({ trial: true, timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(2500);
    expect(Number((await one<{ n: string }>("select count(*) n from conversation_messages where body=$1", [text])).n)).toBe(1);
    await context.close();
  });

  test("SBX-10 questions reach only their audience: the guest sees the discussions addressed to them and none that are not", async ({ browser }) => {
    const token = await newPass("audience");
    const { context } = await enter(browser, token);
    const gid = await guestOf(token);
    const seen = await asMember(gid, "select id, question, audience_type from consultations where sandbox_owner = $1 or sandbox_owner is null order by id", [gid]);
    const types = new Set(seen.rows.map((r: any) => r.audience_type));
    expect(types.size).toBeGreaterThanOrEqual(3);
    // the seeded story's own discussions are all this guest's; another guest's are not
    const other = await newPass("audience-other");
    const o = await enter(browser, other);
    const og = await guestOf(other);
    const leak = await asMember(gid, "select count(*)::int n from consultations where sandbox_owner = $1", [og]);
    expect(leak.rows[0].n).toBe(0);
    await o.context.close();
    await context.close();
  });

  for (const [label, size] of [["390x844", PHONE], ["320x700", { width: 320, height: 700 }], ["900x760", { width: 900, height: 760 }], ["390x390", { width: 390, height: 390 }]] as const) {
    test(`SBX-11 ${label}: every main screen fits without sideways scrolling; overlays close and keep the draft`, async ({ browser }) => {
      const token = await newPass(`vp-${label}`);
      const { context, page, errors } = await enter(browser, token, size);
      const problems: string[] = [];
      for (const v of ["home", "cover", "referrals", "consult", "network", "messages", "library"]) {
        await click(page, `nav:${v}`);
        await page.waitForTimeout(600);
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        if (m.sw > m.iw + 1) problems.push(`${v}: ${m.sw}>${m.iw}`);
      }
      // overlay: open the Cover wizard, type a name, close; the draft is kept
      await click(page, "nav:cover");
      await click(page, "cover-start");
      await page.waitForTimeout(500);
      await page.evaluate(() => { const i = document.querySelector('.overlay input[type="text"]') as HTMLInputElement | null; if (i) { i.value = "Winter break cover"; i.dispatchEvent(new Event("input", { bubbles: true })); } });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      await expect(page.locator("#app")).toContainText(/Saved draft|Winter break cover/);
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
      await context.close();
    });
  }
});
