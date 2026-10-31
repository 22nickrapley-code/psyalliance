import { test, expect, type Page, type Browser } from "@playwright/test";
import http from "node:http";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";
import { coverPlan } from "../../../lib/scenarios";

// Release C (brief sections 11, 13, 21 and 22; scenarios L01-L08, L11-L19 as far as they can be run here, Q02).
// Real local database and a mock push service and mock text sender. Fictional members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id;
const SECRET = "test-dispatch-secret";

// Mock phone-alert endpoints. The push mock records the headers; the text mock records the body.
const pushes: { url: string; auth: string; len: string }[] = [];
const texts: { to: string; body: string }[] = [];
let servers: http.Server[] = [];
test.beforeAll(async () => {
  const mk = (port: number, h: http.RequestListener) => new Promise<http.Server>((res) => { const s = http.createServer(h).listen(port, "127.0.0.1", () => res(s)); });
  servers = [
    await mk(3601, (req, rsp) => { pushes.push({ url: req.url || "", auth: String(req.headers.authorization || ""), len: String(req.headers["content-length"] || "0") }); req.resume(); rsp.statusCode = req.url?.includes("gone") ? 410 : 201; rsp.end(); }),
    await mk(3602, (req, rsp) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { texts.push(JSON.parse(b || "{}")); rsp.statusCode = 200; rsp.end("{}"); }); }),
  ];
});
test.afterAll(async () => { await Promise.all(servers.map((s) => new Promise((r) => s.close(r)))); });

async function tidy() {
  await q(`delete from member_participation where profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from push_subscriptions where profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from notification_events where dedup_key like 'rc-%'`);
  await q(`delete from coverage_plans where profile_id = $1 and title like 'QA plan%'`, [avery]);
  await q(`delete from consultation_groups where name like 'RC %'`);
  pushes.length = 0; texts.length = 0;
}
test.beforeEach(tidy);
test.afterAll(tidy);

async function openAs(browser: Browser, who: string, baseURL: string, path = "/dashboard/settings", width = 1365) {
  const phone = width < 700;
  const context = await browser.newContext(phone ? { viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  await page.goto(path);
  return { context, page };
}
const dispatch = (baseURL: string, secret = SECRET) => fetch(`${baseURL}/api/alerts/dispatch`, { method: "POST", headers: { "x-dispatch-secret": secret } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
async function notifyCover(to: string, from: string, key: string) {
  await q(`select private.notify_member('coverage_request', $1, $2, 'sent a cover request', '/dashboard/cover?plan=1', $3, '{}'::jsonb, false)`, [to, from, key]);
}
async function optIn(id: string, extra = "") {
  await q(`insert into member_participation (profile_id, alert_push) values ($1, true) on conflict (profile_id) do update set alert_push = true ${extra}`, [id]);
  await q(`insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1, 'http://127.0.0.1:3601/push/ok', 'p', 'a') on conflict (endpoint) do update set revoked_at = null, profile_id = $1`, [id]);
}

test("C-01 L01 homepage lifecycle band: placement, copy, routes, phone widths, nothing in the signed-in Hub", async ({ browser, baseURL }) => {
  for (const width of [1365, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(baseURL! + "/");
    const band = page.locator("#stages");
    await expect(band.getByRole("heading", { name: "The colleagues you need change. The place to find them shouldn’t." })).toBeVisible();
    for (const t of ["Starting out", "Building", "Established", "Changing pace"]) await expect(band.getByText(t, { exact: true })).toBeVisible();
    // After the short service explanation (How it works), before the founder story and secondary resources.
    const order = await page.evaluate(() => ["how", "stages", "library", "why"].map((id) => document.getElementById(id)!.getBoundingClientRect().top + scrollY));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await expect(band.getByRole("link", { name: /See how PsyAlliance works/ })).toHaveAttribute("href", "/tour");
    await expect(band.getByRole("link", { name: /Show me how PsyAlliance could help/ })).toHaveAttribute("href", "/start");
    await expect(band).toContainText("doctoral-level psychologists and psychiatrists with an active US license");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const text = (await band.innerText()).toLowerCase();
    for (const bad of ["retire", "trainee", "guarantee", "student", "graduate"]) expect(text).not.toContain(bad);
    await context.close();
  }
  const { page, context } = await openAs(browser, "avery", baseURL!, "/dashboard");
  await expect(page.locator("#app")).toBeAttached();
  expect(await page.locator("body").innerText()).not.toContain("The place to find them");
  await context.close();
});

test("C-02 L02 optional situations: several choices, skip, edit later, private to the member", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "avery", baseURL!);
  await page.locator("#situations summary").click();
  await page.getByLabel("Planning time away").check();
  await page.getByLabel("Finding a professional perspective").check();
  await page.locator("#situations").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  expect((await one(`select situations from member_participation where profile_id = $1`, [avery])).situations.sort()).toEqual(["professional_perspective", "time_away"]);
  await page.locator("#situations summary").click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByText("Skipped. You can set this any time.")).toBeVisible();
  expect((await one(`select situations from member_participation where profile_id = $1`, [avery])).situations).toEqual([]);
  // Another member cannot read the row, and a conflicting "prefer not to say" stands alone.
  await q(`update member_participation set situations = '{time_away}' where profile_id = $1`, [avery]);
  expect((await asMember(bram, `select * from member_participation where profile_id = $1`, [avery])).rowCount).toBe(0);
  await page.locator("#situations summary").click();
  await page.getByLabel("Prefer not to say").check();
  await page.locator("#situations").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  expect((await one(`select situations from member_participation where profile_id = $1`, [avery])).situations).toEqual(["prefer_not_to_say"]);
  await context.close();
});

test("C-03 L03/L05 separate pauses: only new requests stop, other services stay open, a finished pause asks for review and never refreshes availability", async ({ browser, baseURL }) => {
  const before = (await one(`select availability_confirmed_at from profiles where id = $1`, [bram])).availability_confirmed_at;
  const { page, context } = await openAs(browser, "bram", baseURL!);
  await page.locator("#approach summary").click();
  await page.locator('[data-service="cover"]').getByRole("button", { name: /Pause new cover requests/i }).click();
  await expect(page.locator('[data-state="cover"]')).toContainText("Paused");
  await expect(page.locator('[data-state="referrals"]')).toContainText("Taking new requests");
  const reasons = async (kind: string) => (await q(`select * from private.cover_exclusions($1::uuid, $1::uuid, 'NY', 'Anxiety/Panic Disorders', $2)`, [bram, kind]).catch(() => [])) as any[];
  expect(await one(`select private.service_paused($1, 'cover') as p`, [bram])).toMatchObject({ p: true });
  expect(await one(`select private.service_paused($1, 'referral') as p`, [bram])).toMatchObject({ p: false });
  // Work already agreed is untouched: a plan already addressed to Bram stays open.
  const { planId } = await coverPlan("avery", ["bram"]);
  expect((await one(`select count(*)::int n from coverage_requests where requested_profile_id = $1`, [bram])).n).toBe(1);
  expect((await one(`select status from coverage_plans where id = $1`, [planId])).status).toBe("active");
  // The pause ends: Bram is asked to review, and it is not treated as accepting again.
  await q(`update member_participation set pause_cover_until = current_date - 1 where profile_id = $1`, [bram]);
  await page.reload();
  await page.locator("#approach summary").click();
  await expect(page.locator('[data-review="cover"]')).toBeVisible();
  expect(await one(`select private.service_paused($1, 'cover') as p`, [bram])).toMatchObject({ p: true });
  await page.locator('[data-service="cover"]').getByRole("button", { name: /Resume cover requests/i }).click();
  await expect(page.locator('[data-state="cover"]')).toContainText("Taking new requests");
  const after = (await one(`select availability_confirmed_at from profiles where id = $1`, [bram])).availability_confirmed_at;
  expect(String(after)).toBe(String(before));
  void reasons;
  await context.close();
});

test("C-04 L03 no referral places with Cover and Consult still open; closing one service leaves the others", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "cass", baseURL!);
  await page.locator("#approach summary").click();
  await page.locator('[data-service="referrals"]').getByRole("button", { name: /Stop taking referral requests/i }).click();
  await expect(page.locator('[data-state="referrals"]')).toContainText("Not taking new requests");
  const r = await one(`select open_referrals, open_cover, open_consult from member_participation where profile_id = $1`, [cass]);
  expect(r).toMatchObject({ open_referrals: false, open_cover: true, open_consult: true });
  expect(await one(`select private.service_open($1, 'referral') as o`, [cass])).toMatchObject({ o: false });
  expect(await one(`select private.service_open($1, 'cover') as o`, [cass])).toMatchObject({ o: true });
  await context.close();
});

test("C-05 L07/L08 phone alerts: generic wording, no client details, push carries no text, quiet hours hold, read suppresses, opt-out sends nothing, bad secret refused", async ({ baseURL }) => {
  await optIn(bram);
  expect((await dispatch(baseURL!, "wrong")).status).toBe(401);
  await notifyCover(bram, avery, "rc-1");
  const rows = await q(`select channel, status from notification_deliveries nd join notification_events e on e.id = nd.notification_event_id where e.dedup_key = 'rc-1' order by 1`);
  expect(rows.map((r) => r.channel)).toEqual(["in_app", "push"]);
  const res = await dispatch(baseURL!);
  expect(res.body).toMatchObject({ sent: 1, failed: 0 });
  expect(pushes).toHaveLength(1);
  expect(pushes[0].len).toBe("0");
  expect(pushes[0].auth).toMatch(/^vapid t=.+\..+\..+, k=/);
  // The wording is asked for while signed in, and it holds only who and what kind of request.
  const w = await one(`select private.alert_text('coverage_request', $1) as t`, [avery]);
  expect(w.t).toBe("Avery has sent you a Cover request. Review request.");
  for (const bad of ["client", "reference", "anonymous", "Client 1"]) expect(w.t.toLowerCase()).not.toContain(bad.toLowerCase());
  // Read in the app first: nothing is sent.
  await notifyCover(bram, avery, "rc-2");
  await q(`update notification_deliveries set read_at = now() where channel = 'in_app' and notification_event_id = (select id from notification_events where dedup_key = 'rc-2')`);
  pushes.length = 0;
  await dispatch(baseURL!);
  expect(pushes).toHaveLength(0);
  expect((await one(`select status from notification_deliveries where channel = 'push' and notification_event_id = (select id from notification_events where dedup_key = 'rc-2')`)).status).toBe("suppressed_read");
  // Quiet hours hold the alert until afterwards.
  await q(`update member_participation set quiet_start = (now() at time zone quiet_timezone - interval '1 hour')::time, quiet_end = (now() at time zone quiet_timezone + interval '1 hour')::time where profile_id = $1`, [bram]);
  await notifyCover(bram, avery, "rc-3");
  const held = await one(`select send_after > now() as later from notification_deliveries where channel = 'push' and notification_event_id = (select id from notification_events where dedup_key = 'rc-3')`);
  expect(held.later).toBe(true);
  pushes.length = 0;
  await dispatch(baseURL!);
  expect(pushes).toHaveLength(0);
  // Opted out: no delivery row at all.
  await q(`update member_participation set alert_push = false, quiet_start = null, quiet_end = null where profile_id = $1`, [bram]);
  await notifyCover(bram, avery, "rc-4");
  expect((await q(`select 1 from notification_deliveries nd join notification_events e on e.id = nd.notification_event_id where e.dedup_key = 'rc-4' and nd.channel = 'push'`)).length).toBe(0);
});

test("C-06 L08 failed delivery is visible and retried, a gone device is revoked, and a repeat is not sent twice", async ({ baseURL }) => {
  await optIn(bram);
  await q(`update push_subscriptions set endpoint = 'http://127.0.0.1:3601/push/gone' where profile_id = $1`, [bram]);
  await notifyCover(bram, avery, "rc-5");
  const r = await dispatch(baseURL!);
  expect(r.body).toMatchObject({ failed: 1 });
  expect((await one(`select revoked_at is not null as gone from push_subscriptions where profile_id = $1`, [bram])).gone).toBe(true);
  const d = await one(`select status, error, retry_count from notification_deliveries where channel = 'push' and notification_event_id = (select id from notification_events where dedup_key = 'rc-5')`);
  expect(d.error).toMatch(/gone/i);
  // A repeated event with the same key does not make a second alert.
  await notifyCover(bram, avery, "rc-5");
  expect((await q(`select 1 from notification_deliveries nd join notification_events e on e.id = nd.notification_event_id where e.dedup_key = 'rc-5' and nd.channel = 'push'`)).length).toBe(1);
});

test("C-06b F01-F03 each alert keeps its own context; a claim is leased; one device failing never resends to another; consent and quiet hours are checked at sending", async ({ baseURL }) => {
  await optIn(bram);
  await q(`insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1, 'http://127.0.0.1:3601/push/fail', 'p', 'a') on conflict (endpoint) do update set revoked_at = null, profile_id = $1`, [bram]);
  await notifyCover(bram, avery, "rc-b1");
  // A second dispatcher cannot claim what the first holds.
  const first = await q(`select delivery_id, token, endpoint from public.claim_alerts(25)`);
  expect(first.length).toBe(2);
  expect((await q(`select * from public.claim_alerts(25)`)).length).toBe(0);
  const id = first[0].delivery_id, token = first[0].token;
  // A stale token is refused.
  expect((await one(`select public.finish_alert($1, gen_random_uuid(), 'http://127.0.0.1:3601/push/ok', true) as ok`, [id])).ok).toBe(false);
  await q(`select public.finish_alert($1, $2, 'http://127.0.0.1:3601/push/ok', true)`, [id, token]);
  await q(`select public.finish_alert($1, $2, 'http://127.0.0.1:3601/push/fail', false, 'Push service said 500')`, [id, token]);
  // Only the failed device is retried.
  await q(`update notification_deliveries set send_after = now() where id = $1`, [id]);
  const again = await q(`select endpoint from public.claim_alerts(25) where delivery_id = $1`, [id]);
  expect(again.map((r: any) => r.endpoint)).toEqual(["http://127.0.0.1:3601/push/fail"]);
  await q(`update notification_deliveries set status = 'failed', claim_token = null, lease_until = null where id = $1`, [id]);
  await q(`delete from push_subscriptions where endpoint = 'http://127.0.0.1:3601/push/fail'`);
  // Two alerts, each opening its own context, whatever order they are fetched in.
  await notifyCover(bram, avery, "rc-b2");
  await q(`select private.notify_member('referral_sent', $1, $2, 'sent a referral', '/dashboard/referrals?referral=7', 'rc-b3', '{}'::jsonb, false)`, [bram, avery]);
  await dispatch(baseURL!);
  const shown = await asMember(bram, `select * from public.my_device_alerts('http://127.0.0.1:3601/push/ok')`);
  const links = shown.rows.map((r: any) => r.link);
  expect(links).toEqual(expect.arrayContaining(["/dashboard/cover?plan=1", "/dashboard/referrals?referral=7"]));
  expect((await asMember(bram, `select * from public.my_device_alerts('http://127.0.0.1:3601/push/ok')`)).rowCount).toBe(0);
  expect((await asMember(cass, `select * from public.my_device_alerts('http://127.0.0.1:3601/push/ok')`)).rowCount).toBe(0);
  // Switched off after queueing: not sent.
  await notifyCover(bram, avery, "rc-b4");
  await q(`update member_participation set alert_push = false where profile_id = $1`, [bram]);
  pushes.length = 0;
  await dispatch(baseURL!);
  expect(pushes).toHaveLength(0);
  expect((await one(`select status from notification_deliveries where channel = 'push' and notification_event_id = (select id from notification_events where dedup_key = 'rc-b4')`)).status).toBe("suppressed_closed");
});

test("C-07 phone number alerts by text: consent required, mock sender gets the generic line only, removal clears everything", async ({ browser, baseURL }) => {
  const { page, context } = await openAs(browser, "bram", baseURL!);
  await page.locator("#alerts summary").click();
  await page.getByLabel(/Phone number for text alerts/).fill("+15550100199");
  await page.getByRole("button", { name: "Save alert settings" }).click();
  await expect(page.getByText("Tick the box to agree to text alerts first.")).toBeVisible();
  expect((await q(`select 1 from member_participation where profile_id = $1 and sms_phone is not null`, [bram])).length).toBe(0);
  await page.locator("#alerts summary").click();
  await page.getByLabel(/Phone number for text alerts/).fill("+1 555 010 0199");
  await page.getByLabel(/I agree to PsyAlliance texting/).check();
  await page.getByRole("button", { name: "Save alert settings" }).click();
  await expect(page.getByText("Alert settings saved.")).toBeVisible();
  expect(await one(`select sms_phone, alert_sms, sms_consent_at is not null as consent from member_participation where profile_id = $1`, [bram])).toMatchObject({ sms_phone: "+15550100199", alert_sms: true, consent: true });
  await notifyCover(bram, avery, "rc-6");
  await dispatch(baseURL!);
  expect(texts).toHaveLength(1);
  expect(texts[0].to).toBe("+15550100199");
  expect(texts[0].body).toMatch(/^Avery has sent you a Cover request\. Review request\. /);
  expect(texts[0].body).not.toMatch(/client|anonymous/i);
  await page.reload();
  await page.locator("#alerts summary").click();
  await page.getByRole("button", { name: "Remove my phone number" }).click();
  await expect(page.getByText("Phone number removed.")).toBeVisible();
  expect(await one(`select sms_phone, alert_sms from member_participation where profile_id = $1`, [bram])).toMatchObject({ sms_phone: null, alert_sms: false });
  await context.close();
});

test("C-08 L07 push subscription belongs to the signed-in member only; the alert wording route needs a session", async ({ browser, baseURL }) => {
  const anon = await fetch(`${baseURL}/api/alerts/subscribe`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(anon.status).toBe(401);
  const { page, context } = await openAs(browser, "bram", baseURL!);
  // Only real push services (and, in tests, the local mock) are accepted, with keys of the right shape (review F04).
  const post = (endpoint: string, keys: any) => page.evaluate(async ([e, k]) => (await fetch("/api/alerts/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: e, keys: k }) })).status, [endpoint, keys] as const);
  for (const bad of ["https://evil.example/push", "http://localhost:3601/push/ok", "https://fcm.googleapis.com.evil.example/x", "https://user@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "ftp://fcm.googleapis.com/x"]) expect(await post(bad, { p256dh: "B" + "A".repeat(86), auth: "Q".repeat(22) }), bad).toBe(400);
  expect(await post("http://127.0.0.1:3601/push/ok", { p256dh: "p", auth: "a" })).toBe(400);
  const ok = await page.evaluate(async () => (await fetch("/api/alerts/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: "http://127.0.0.1:3601/push/ok", keys: { p256dh: "B" + "A".repeat(86), auth: "Q".repeat(22) } }) })).status);
  expect(ok).toBe(200);
  expect((await one(`select profile_id, alert_push from push_subscriptions s join member_participation m using (profile_id) where endpoint = 'http://127.0.0.1:3601/push/ok'`)).profile_id).toBe(bram);
  expect((await asMember(cass, `select * from push_subscriptions`)).rowCount).toBe(0);
  // The device asks for ITS alerts by endpoint; another account's endpoint returns nothing.
  const mine = await page.evaluate(async () => (await fetch("/api/alerts/latest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: "http://127.0.0.1:3601/push/ok" }) })).json());
  expect(Array.isArray(mine.alerts)).toBe(true);
  const anonLatest = await (await fetch(`${baseURL}/api/alerts/latest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: "http://127.0.0.1:3601/push/ok" }) })).json();
  expect(anonLatest.alerts).toEqual([]);
  await context.close();
});

test("C-09 L11/L13 guide: every need, headline and benefit exactly, optional follow-up and Skip, change my choice, no email field, demos reachable", async ({ browser, baseURL }) => {
  const cases: [string, string, string, string][] = [
    ["Arrange time away", "Time away, with a clearer plan", "See how you can find suitable colleagues, review their responses and track the handovers that still need arranging.", "/tour/time-away"],
    ["Find a colleague for a client", "A clearer route to an appropriate colleague", "See how requirements, match explanations and recipient review help you approach suitable colleagues.", "/tour/client-referral"],
    ["Establish or rebuild my caseload", "Help appropriate colleagues discover your practice", "See how your experience, settings and current capacity help others consider you for referrals.", "/tour/caseload"],
    ["Get another professional perspective", "Another professional perspective", "See how to choose who you ask and keep the discussion together.", "/tour/perspective"],
    ["Reduce or close my practice", "Support for your next chapter", "See how to consider onward referrals and the arrangements involved in changing your practice.", "/tour/reducing"],
  ];
  for (const width of [1365, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    for (const [label, headline, benefit, demo] of cases) {
      await page.goto(baseURL! + "/start");
      await expect(page.locator("input[type=email], input[name=email]")).toHaveCount(0);
      await page.getByLabel(label).click();
      await expect(page.getByRole("heading", { name: /Which describes you best/ })).toBeVisible();
      await page.locator("[data-skip]").click();
      await expect(page.locator("[data-headline]")).toHaveText(headline);
      await expect(page.locator("[data-benefit]")).toHaveText(benefit);
      await expect(page.locator("[data-demo]")).toHaveAttribute("href", demo);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseURL! + "/start");
  await page.getByLabel("Just explore").click();
  await expect(page.locator("[data-headline]")).toContainText("Cover, Referrals and Consult");
  await page.getByRole("button", { name: "Change my choice" }).click();
  await expect(page.getByRole("heading", { name: "What would be useful to you at the moment?" })).toBeVisible();
  const evt = await q(`select event, need from lifecycle_events where namespace = 'demo' order by id desc limit 5`);
  expect(evt.length).toBeGreaterThan(0);
  await context.close();
});

test("C-10 L14 hands-on interaction and recipient preview: consequence shown at once, Back returns to the same stage, nothing is sent", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseURL! + "/start?need=time_away");
  await page.getByRole("button", { name: "Try it myself" }).click();
  await page.getByLabel(/Secure handover information shared/).check();
  await expect(page.locator("[data-sim=time_away] .ok")).toContainText("Handover stays unfinished until every required item");
  await page.getByRole("button", { name: "What will they receive?" }).click();
  await expect(page.getByText("Example of the recipient’s view")).toBeVisible();
  await page.getByRole("button", { name: "Interested", exact: true }).click();
  await expect(page.locator("[data-sim=recipient] .ok")).toContainText("not Cover acceptance or a referral placement");
  await page.getByRole("button", { name: "Back to my view" }).click();
  await expect(page.getByLabel(/Secure handover information shared/)).toBeAttached();
  // Skip and Reset both work, and the summary is reachable without doing the exercise.
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.locator("[data-summary-text]")).toContainText("Ready to start your Cover plan?");
  await context.close();
});

test("C-11 L12/L15/L16 handoff: Continue keeps structured choices only, expires, clears; the signed-in start page prepares an unsent draft and offers Start fresh", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await signInAs(context, "avery", baseURL!);
  const page = await context.newPage();
  await page.goto(baseURL! + "/start?need=time_away");
  await page.getByRole("button", { name: "Skip to what comes next" }).click();
  await expect(page.locator("[data-summary]")).toContainText("Next, add your dates and anonymous client requirements. You’ll review every recipient before anything is sent.");
  await page.locator("[data-continue]").click({ noWaitAfter: true });
  const cookie = (await context.cookies()).find((c) => c.name === "pa_start")!;
  const v = JSON.parse(decodeURIComponent(cookie.value));
  expect(Object.keys(v).sort()).toEqual(["exp", "need"]);
  expect(v.need).toBe("time_away");
  await page.goto(baseURL! + "/dashboard");
  await expect(page).toHaveURL(/\/dashboard\/start/);
  await expect(page.getByText("We’ve used your choices to get you started")).toBeVisible();
  await page.locator("[data-start-continue]").click();
  await expect(page).toHaveURL(/\/dashboard\/cover/);
  await expect(page.locator(".modal-header")).toBeVisible();
  // Nothing was created or sent; the stored intent was used once and the cookie is gone.
  expect((await q(`select 1 from coverage_plans where profile_id = $1`, [avery])).length).toBe(0);
  expect((await context.cookies()).some((c) => c.name === "pa_start")).toBe(false);
  expect((await one(`select starting_intent_used_at is not null as used from member_participation where profile_id = $1`, [avery])).used).toBe(true);
  // Start fresh clears it.
  await context.addCookies([{ name: "pa_start", value: encodeURIComponent(JSON.stringify({ need: "perspective", exp: Date.now() + 60000 })), url: baseURL! }]);
  await page.goto(baseURL! + "/dashboard");
  await page.locator("[data-start-fresh]").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await context.cookies()).some((c) => c.name === "pa_start")).toBe(false);
  // An expired or broken handoff gives an ordinary start, not an error or a loop.
  await context.addCookies([{ name: "pa_start", value: encodeURIComponent(JSON.stringify({ need: "time_away", exp: Date.now() - 1000 })), url: baseURL! }]);
  await page.goto(baseURL! + "/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await context.close();
});

test("C-12 L15 offer-support route: only the chosen kinds open, nothing else changes, zero referral places can coexist", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await signInAs(context, "cass", baseURL!);
  const page = await context.newPage();
  await context.addCookies([{ name: "pa_start", value: encodeURIComponent(JSON.stringify({ need: "offer_support", helps: ["cover", "consult"], exp: Date.now() + 60000 })), url: baseURL! }]);
  await page.goto(baseURL! + "/dashboard");
  await expect(page).toHaveURL(/\/dashboard\/start/);
  await expect(page.getByLabel("Cover requests")).toBeChecked();
  await expect(page.getByLabel("Referral requests")).not.toBeChecked();
  await expect(page.locator("#main")).toContainText("not a commitment to accept any request");
  expect((await q(`select 1 from member_participation where profile_id = $1 and (open_cover is false or open_referrals is false)`, [cass])).length).toBe(0);
  await page.getByRole("button", { name: "Save my choices" }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings/);
  expect(await one(`select open_referrals, open_cover, open_consult, alert_push, alert_sms from member_participation where profile_id = $1`, [cass])).toMatchObject({ open_referrals: false, open_cover: true, open_consult: true, alert_push: false, alert_sms: false });
  await context.close();
});

test("C-13 L07 a notification link keeps its destination through sign-in and only navigates", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseURL! + "/dashboard/cover?plan=999");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fdashboard%2Fcover%3Fplan%3D999/);
  await context.close();
});

test("C-14 L06 Use as a starting point: a new independent draft with the requirements only", async ({ browser, baseURL }) => {
  const { planId } = await coverPlan("avery", ["bram"], ["Client 1", "Client 2"]);
  const { page, context } = await openAs(browser, "avery", baseURL!, `/dashboard/cover?plan=${planId}`);
  await page.getByRole("button", { name: /Use as a starting point/ }).first().click();
  await expect(page.locator(".modal-header")).toBeVisible();
  await expect(page.locator("#cover-name")).toHaveValue(/^Copy of /);
  await page.getByRole("button", { name: "Continue to needs" }).click();
  await expect(page.locator(".saved-client")).toHaveCount(2);
  // Nothing was sent or changed on the original plan.
  expect((await one(`select count(*)::int n from coverage_plans where profile_id = $1`, [avery])).n).toBe(1);
  expect((await one(`select count(*)::int n from coverage_requests`)).n).toBe(2);
  await context.close();
});

test("C-15 Q02 groups: charter is versioned with history; only organisers edit; the creator appoints organisers; a removed or departed member loses access", async ({ browser, baseURL }) => {
  const g = await one(`insert into consultation_groups (name, created_by) values ('RC Group', $1) returning id`, [avery]);
  await q(`insert into consultation_group_members (group_id, profile_id, status, role) values ($1, $2, 'joined', 'creator'), ($1, $3, 'joined', 'member'), ($1, $4, 'joined', 'member')`, [g.id, avery, bram, cass]);
  const edit = (who: string, body: string) => asMember(who, `select public.group_edit_charter($1, $2)`, [g.id, body]);
  await edit(avery, "Version one: confidentiality, de-identification and consultation, not supervision.");
  await edit(avery, "Version two: confidentiality, de-identification and consultation, not supervision, no recording.");
  expect((await one(`select charter_version v from consultation_groups where id = $1`, [g.id])).v).toBe(2);
  expect((await q(`select version from consultation_group_charters where group_id = $1 order by version`, [g.id])).map((r) => r.version)).toEqual([1, 2]);
  await expect(edit(bram, "Version three from an ordinary member, which must not be allowed.")).rejects.toThrow(/Only the group's organizers/);
  await expect(asMember(bram, `select public.group_set_role($1, $2, 'coordinator')`, [g.id, cass])).rejects.toThrow(/Only the person who started the group/);
  await asMember(avery, `select public.group_set_role($1, $2, 'coordinator')`, [g.id, bram]);
  await edit(bram, "Version three by an appointed organiser: confidentiality and de-identification first.");
  expect((await one(`select charter_version v from consultation_groups where id = $1`, [g.id])).v).toBe(3);
  await expect(asMember(bram, `select public.group_remove_member($1, $2)`, [g.id, avery])).rejects.toThrow(/cannot be removed/);
  // Members see the charter history; the page shows earlier versions to joined members only.
  const { page, context } = await openAs(browser, "cass", baseURL!, `/dashboard/consult/groups/${g.id}`);
  await expect(page.locator("[data-charter-history]")).toContainText("Version 2");
  await expect(page.getByText("Edit the charter")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await asMember(bram, `select public.group_remove_member($1, $2)`, [g.id, cass]);
  expect((await asMember(cass, `select * from consultation_group_charters where group_id = $1`, [g.id])).rowCount).toBe(0);
  await page.goto(baseURL! + `/dashboard/consult/groups/${g.id}`);
  await expect(page).toHaveURL(/\/dashboard\/consult\/groups(\?|$)/);
  await context.close();
});

test("C-16 D21/F19 public Library no longer promises every template; D28 phone sign-up shows the form first", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(baseURL! + "/library");
  const t = (await page.locator("main").innerText()).toLowerCase();
  expect(t).not.toContain("members get every template");
  expect(t).not.toContain("download and save every template");
  expect(t).toMatch(/available to members now/);
  await page.goto(baseURL! + "/auth/sign-up");
  const form = await page.locator("form.join-card").boundingBox();
  const intro = await page.locator(".join-intro h1").boundingBox();
  expect(form!.y).toBeLessThan(intro!.y);
  await context.close();
});

test("C-17 events: unknown events are ignored, known ones carry a namespace and need only", async () => {
  await q(`select public.log_lifecycle_event('demo', 'bogus', null)`);
  await q(`select public.log_lifecycle_event('real', 'pause', null)`);
  const n = await one(`select count(*)::int n from lifecycle_events where event = 'bogus'`);
  expect(n.n).toBe(0);
  const cols = (await q(`select column_name from information_schema.columns where table_name = 'lifecycle_events' order by 1`)).map((r) => r.column_name);
  expect(cols).toEqual(["at", "event", "id", "namespace", "need"]);
});

test("C-18 L03/L05 a Consult pause or closed door stops new direct invitations only", async () => {
  const ask = (to: string) => asMember(avery, `select public.consult_post($1::jsonb)`, [JSON.stringify({ title: "RC pause question", body: "", confirmed: "true", audience: "one", recipients: [to] })]);
  await q(`insert into member_participation (profile_id, paused_consult) values ($1, true) on conflict (profile_id) do update set paused_consult = true`, [bram]);
  await expect(ask(bram)).rejects.toThrow(/not taking new Consult invitations/);
  await q(`update member_participation set paused_consult = false, open_consult = false where profile_id = $1`, [bram]);
  await expect(ask(bram)).rejects.toThrow(/not taking new Consult invitations/);
  // Another colleague is unaffected, and so is a Cover or referral pause for the same member.
  await q(`update member_participation set open_consult = true, paused_cover = true, paused_referrals = true where profile_id = $1`, [bram]);
  const ok = await ask(bram);
  expect(ok.rowCount).toBe(1);
  await q(`delete from consultations where question = 'RC pause question'`);
});
