import { test, expect, type Page } from "@playwright/test";
import { signInAs, account, memberClient } from "../../lib/auth";
import { q, one, assertLocal } from "../../lib/staging";
import { coverPlan, referral } from "../../lib/scenarios";

// Nick's 18 Oct round, checked on staging: colours, Home, chat, Refer and
// Cover homes, profile tabs, the library, founding places and copy.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "parallel" });

const id = (k: string) => account(k).id;
function loads(page: Page) {
  const box = { n: 0 };
  page.on("load", () => box.n++);
  return box;
}
async function trust(owner: string, colleague: string) {
  await q(`insert into trusted_colleagues (profile_id, colleague_id) values ($1, $2) on conflict do nothing`, [id(owner), id(colleague)]);
}
async function untrust(owner: string, colleague: string) {
  await q(`delete from trusted_colleagues where profile_id = $1 and colleague_id = $2`, [id(owner), id(colleague)]);
}

test("R18-01 a trusted colleague has the same blue disc on Network, Clinicians and New message", async ({ page, context, baseURL }) => {
  await trust("fenn", "gale");
  try {
    await signInAs(context, "fenn", baseURL!);
    await page.goto("/dashboard/network");
    await expect(page.locator("#trusted").locator(".avatar.rel-trusted").first()).toBeVisible();
    await expect(page.locator(".orbit .node.rel-trusted").first()).toBeVisible();
    await page.goto(`/dashboard/clinicians?q=${encodeURIComponent("Gale")}`);
    const card = page.locator("article.person-card").filter({ hasText: "Gale Thistlewood" }).first();
    await expect(card.locator(".avatar.rel-trusted")).toBeVisible();
    await expect(card.locator(".rel-tag.rel-trusted")).toHaveText("Trusted colleague");
    await page.goto("/dashboard/messages?compose=1");
    await expect(page.locator(".picker-row").filter({ hasText: "Gale Thistlewood" }).locator(".picker-face.rel-trusted").first()).toBeVisible();
  } finally {
    await untrust("fenn", "gale");
  }
});

test("R18-02 the top bar has no page title", async ({ page, context, baseURL }) => {
  await signInAs(context, "avery", baseURL!);
  for (const path of ["/dashboard/cover", "/dashboard/clinicians", `/dashboard/people/${id("bram")}`]) {
    await page.goto(path);
    await expect(page.locator(".workspace-top .breadcrumbs")).toHaveCount(0);
    expect((await page.locator(".workspace-top").innerText()).trim()).toBe("");
  }
});

test("R18-03 Home: a trusted colleague's question is in the feed; Not now quiets it until switched back", async ({ page, context, baseURL }) => {
  await trust("gale", "fenn");
  const question = `QA R18-03 ${Date.now()}: night-time panic only, CBT first?`;
  const fenn = await memberClient("fenn");
  const { error } = await fenn.from("consultations").insert({ author_profile_id: id("fenn"), question, status: "open", audience_type: "wider_network", tags: [] });
  expect(error, error?.message).toBeNull();
  const before = await one(`select consultation_availability from profiles where id = $1`, [id("gale")]);
  try {
    await signInAs(context, "gale", baseURL!);
    await page.goto("/dashboard");
    const card = page.locator(".feed-card").filter({ hasText: question });
    await expect(card).toBeVisible();
    await expect(card.locator(".feed-reason")).toHaveText("From a trusted colleague");
    await expect(page.locator(".home-lower.with-feed .avail-card")).toBeVisible();
    await expect(page.getByText(/Your network today/)).toHaveCount(0);
    await q(`update profiles set consultation_availability = 'no' where id = $1`, [id("gale")]);
    await page.goto("/dashboard");
    await expect(page.locator(".home-feed.quiet")).toBeVisible();
    await expect(page.getByText(question)).toHaveCount(0);
    await page.getByRole("button", { name: "Open to consult" }).click();
    await expect(page.getByText(question)).toBeVisible();
    expect((await one(`select consultation_availability from profiles where id = $1`, [id("gale")])).consultation_availability).toBe("yes");
  } finally {
    await q(`update profiles set consultation_availability = $2 where id = $1`, [id("gale"), before.consultation_availability]);
    await untrust("gale", "fenn");
  }
});

test("R18-04 Messages: send without a reload, edit within 15 minutes, remove, and the 15-minute rule holds", async ({ page, context, baseURL }) => {
  await signInAs(context, "cass", baseURL!);
  await page.goto(`/dashboard/messages?to=${id("dara")}`);
  const first = `QA R18-04 opener ${Date.now()}`;
  await page.locator('textarea[name="body"]').fill(first);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-thread").getByText(first)).toBeVisible();
  const box = loads(page);
  const text = `QA R18-04 ${Date.now()}`;
  await page.locator(".chat-compose textarea").fill(text);
  await page.locator(".chat-compose").getByRole("button", { name: "Send" }).click();
  const mine = page.locator(".chat-msg.mine").filter({ hasText: text });
  await expect(mine).toBeVisible();
  await expect(page.locator(".chat-msg.pending")).toHaveCount(0, { timeout: 10_000 });
  expect(box.n, "no reload on send").toBe(0);
  // Edit.
  await mine.getByRole("button", { name: "Edit" }).click();
  await mine.locator(".chat-edit textarea").fill(`${text} (edited)`);
  await mine.getByRole("button", { name: "Save" }).click();
  await expect(mine).toContainText("(edited)");
  await expect(mine.locator(".chat-meta")).toContainText("Edited");
  const row = await one(`select id, edited_at from conversation_messages where body = $1`, [`${text} (edited)`]);
  expect(row.edited_at).toBeTruthy();
  // After 15 minutes, the database refuses an edit.
  await q(`update conversation_messages set created_at = now() - interval '20 minutes' where id = $1`, [row.id]);
  const cass = await memberClient("cass");
  const late = await cass.from("conversation_messages").update({ body: "late edit" }).eq("id", row.id).select("id");
  expect(late.error?.message || "").toMatch(/15 minutes/);
  // Remove still works.
  await page.reload();
  const again = page.locator(".chat-msg.mine").filter({ hasText: `${text} (edited)` });
  await again.getByRole("button", { name: "Remove" }).click();
  await again.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".chat-msg.removed").first()).toBeVisible();
  // The removal shows at once; the save follows a moment later.
  await expect.poll(async () => (await one(`select body, deleted_at from conversation_messages where id = $1`, [row.id])).deleted_at, { timeout: 10_000 }).toBeTruthy();
  const gone = await one(`select body, deleted_at from conversation_messages where id = $1`, [row.id]);
  expect(gone.body).toBe("");
  await expect(page.locator(".chat-error")).toHaveCount(0);
});

test("R18-05 a reaction nudges only the reactor's own suggestions", async () => {
  const cass = await memberClient("cass");
  const fenn = await memberClient("fenn");
  const { data: conv } = await cass.from("conversations").insert({ created_by: id("cass"), title: `QA R18-05 ${Date.now()}` }).select("id").single();
  await q(`insert into conversation_participants (conversation_id, profile_id) values ($1, $2), ($1, $3)`, [conv!.id, id("cass"), id("fenn")]);
  const { data: m } = await cass.from("conversation_messages").insert({ conversation_id: conv!.id, author_id: id("cass"), body: "QA hello", mentioned_profile_ids: [] }).select("id").single();
  const r = await fenn.rpc("react_to_message", { p_message: m!.id, p_reaction: "like" });
  expect(r.error, r.error?.message).toBeNull();
  const mineAff = await fenn.rpc("my_colleague_affinity");
  const theirs = await cass.rpc("my_colleague_affinity");
  expect(((mineAff.data as any[]) || []).find((a) => a.colleague_id === id("cass"))?.score).toBeGreaterThan(0);
  expect(((theirs.data as any[]) || []).find((a) => a.colleague_id === id("fenn"))).toBeFalsy();
  await q(`delete from message_reactions where message_id = $1`, [m!.id]);
});

test("R18-06 New message: typing a name finds a member outside your circle", async ({ page, context, baseURL }) => {
  await signInAs(context, "dara", baseURL!);
  await page.goto("/dashboard/messages?compose=1");
  await expect(page.getByText(/To write to anyone else in the network, type their name/)).toBeVisible();
  await page.getByPlaceholder("Type any colleague's name").fill("Gale");
  await expect(page.locator(".picker-row").filter({ hasText: "Gale Thistlewood" }).first()).toBeVisible({ timeout: 8000 });
});

test("R18-07 Refer: one way in, and the received list is a coloured history", async ({ page, context, baseURL }) => {
  await signInAs(context, "fenn", baseURL!);
  await page.goto("/dashboard");
  await expect(page.locator('a.home-tile[href="/dashboard/refer"]')).toBeVisible();
  await expect(page.locator('a.home-tile[href="/dashboard/cover"]')).toBeVisible();
  await page.goto("/dashboard/refer/new");
  await expect(page).toHaveURL(/\/dashboard\/refer(#start-referral)?$/);
  await expect(page.locator("form#start-referral")).toBeVisible();
  const ref = await referral("gale", ["fenn"]);
  await page.goto("/dashboard/refer");
  const row = page.locator(`a.hist-row[href="/dashboard/refer/${ref}"]`);
  await expect(row).toHaveClass(/tone-amber/);
  await expect(row).toContainText("Needs your reply");
  const fenn = await memberClient("fenn");
  await fenn.from("referral_responses").insert({ referral_request_id: ref, responding_profile_id: id("fenn"), status: "interested", message: "QA interested" });
  await page.reload();
  await expect(row).toContainText("You replied, waiting");
  const gale = await memberClient("gale");
  const c = await gale.rpc("choose_referral_colleague", { p_referral: ref, p_colleague: id("fenn") });
  expect(c.error, c.error?.message).toBeNull();
  await page.reload();
  await expect(row).toHaveClass(/tone-green/);
  await expect(row).toContainText("They chose you");
});

test("R18-08 the referral answers are green, amber and red", async ({ page, context, baseURL }) => {
  const ref = await referral("bram", ["cass"]);
  await signInAs(context, "cass", baseURL!);
  await page.goto(`/dashboard/refer/${ref}`);
  await expect(page.locator(".radio-card.answer-green")).toContainText("Interested");
  await expect(page.locator(".radio-card.answer-amber")).toContainText("I have a question");
  await expect(page.locator(".radio-card.answer-red")).toContainText("Not available");
});

test("R18-09 Cover: the menu opens the Cover home, which shows the waiting request", async ({ page, context, baseURL }) => {
  const plan = await coverPlan("gale", ["dara"], ["Client W"], "MA");
  await signInAs(context, "dara", baseURL!);
  await page.goto("/dashboard");
  await page.locator("aside").getByRole("link", { name: /^Cover/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/cover$/);
  await expect(page.locator("form#plan-cover")).toBeVisible();
  await expect(page.locator(".cover-waiting")).toBeVisible();
  const row = page.locator(`a.hist-row[href="/dashboard/cover/requests/${plan.planId}"]`);
  await expect(row).toHaveClass(/tone-amber/);
  await row.click();
  await expect(page.locator(".cover-band")).toContainText("Temporary cover");
  await expect(page.getByRole("button", { name: "Accept Client W" })).toBeVisible();
});

test("R18-10 Profile's four tabs are coloured by how complete they are", async ({ page, context, baseURL }) => {
  const before = await q(`select * from continuity_plans where profile_id = $1`, [id("gale")]);
  await q(`delete from continuity_plans where profile_id = $1`, [id("gale")]);
  try {
    await signInAs(context, "gale", baseURL!);
    // The Availability page is now the Hub's window (D-05); the four tabs live on the profile page and its sisters.
    await page.goto("/dashboard/profile");
    const tabs = page.locator(".profile-tabs .section-tab");
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(3)).toHaveClass(/hub-red/);
    await expect(tabs.nth(3)).toContainText("Not set");
    for (let n = 0; n < 3; n++) await expect(tabs.nth(n)).toHaveClass(/hub-(green|amber|red)/);
  } finally {
    for (const p of before) await q(`insert into continuity_plans (profile_id, answers, backup_profile_id) values ($1, $2::jsonb, $3) on conflict do nothing`, [p.profile_id, JSON.stringify(p.answers || {}), p.backup_profile_id]);
  }
});

test("R18-11 the Library never shows review status; templates not ready say Coming soon", async ({ page, context, baseURL }) => {
  await signInAs(context, "bram", baseURL!);
  await page.goto("/dashboard/documents");
  const body = await page.locator("main").innerText();
  expect(body).not.toMatch(/[Pp]rovisional|independently reviewed|review pending/);
  const docs = await q(`select library_code, review_status from documents where owner_scope = 'world' and review_status in ('published', 'provisional') order by library_code`);
  const provisional = docs.find((d) => d.review_status === "provisional");
  test.skip(!provisional, "no template waiting for review on staging");
  // This build is like the live site: a template waiting for review is
  // listed as Coming soon and can't be opened.
  await expect(page.locator(".soon-chip").first()).toBeVisible();
  await page.locator("article.resource").filter({ has: page.locator(".soon-chip") }).first().locator("h3 a").click();
  await expect(page.getByRole("link", { name: "Open the PDF" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save PDF to My Library" })).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/[Pp]rovisional|independently reviewed|Not yet/);
});

test("R18-12 the public Library lists titles and asks visitors to join", async ({ page }) => {
  await page.goto("/library");
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/review|Free download|free to download/i);
  await page.locator(".lib-card h3 a").first().click();
  await expect(page.getByRole("heading", { name: /Members get it now\.|Coming soon\./ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create your account" }).first()).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(/review|Free download/i);
});

test("R18-13 founding places are 40 everywhere; the privacy policy and join steps are in place", async ({ page }) => {
  for (const path of ["/", "/auth/sign-up", "/terms"]) {
    await page.goto(path);
    const t = await page.locator("body").innerText();
    expect(t, path).not.toMatch(/first 50/);
  }
  await page.goto("/auth/sign-up");
  await expect(page.getByText(/first 40/).first()).toBeVisible();
  const con = await one(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'founding_places_place_check'`);
  expect(con.d).toMatch(/40/);
  const left = await one(`select pg_get_functiondef('public.founding_places_left'::regproc) d`);
  expect(left.d).toMatch(/40 - count/);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: /How PsyAlliance handles information/ })).toBeVisible();
  const p = await page.locator("main").innerText();
  expect(p).not.toMatch(/completes legal review/);
  for (const h of ["Information we collect", "Service providers", "How long we keep information", "Your choices and rights"]) expect(p).toContain(h);
  await page.goto("/tour");
  await expect(page.locator(".join-steps li")).toHaveCount(4);
});

test("R18-14 sandbox arrivals are at least 6 minutes apart", async () => {
  const d = await one(`select pg_get_functiondef('public.sandbox_tick'::regproc) d`);
  // v13 (0119) spaces the next arrivals with a list of gaps; every real gap is 6 minutes or more
  // (the last entry, 0 seconds, is the step after the final arrival).
  const gaps = [...String(d.d).matchAll(/interval '(\d+) (minutes|seconds)'/g)].map((m) => Number(m[1]) * (m[2] === "minutes" ? 60 : 1));
  expect(gaps.length, "the gaps between arrivals are listed").toBeGreaterThanOrEqual(4);
  for (const g of gaps.filter((x) => x > 0)) expect(g, "each gap between arrivals").toBeGreaterThanOrEqual(6 * 60);
  const seed = await one(`select pg_get_functiondef('private.seed_demo_viewer_story'::regproc) d`);
  expect(seed.d).toMatch(/240 seconds/);
});

test("R18-15 Network keeps the suggested list that colours avatars elsewhere", async ({ page, context, baseURL }) => {
  await signInAs(context, "cass", baseURL!);
  await page.goto("/dashboard/network");
  const run = await q(`select computed_at from suggestion_runs where profile_id = $1`, [id("cass")]);
  expect(run.length).toBe(1);
  const shown = await page.locator("#suggested .net-row .avatar").count();
  const kept = await q(`select colleague_id from suggested_colleagues where profile_id = $1`, [id("cass")]);
  expect(kept.length).toBe(shown);
  // Every suggested face is teal on the first visit, not only once the menu's map catches up.
  expect(await page.locator("#suggested .net-row .avatar.rel-suggested, #suggested .net-row .avatar.rel-trusted").count()).toBe(shown);
});

test("R18-16 a long name or email stays inside the menu", async ({ page, context, baseURL }) => {
  const before = await one(`select full_name from profiles where id = $1`, [id("esme")]);
  await q(`update profiles set full_name = $2 where id = $1`, [id("esme"), "Alexandrina Wolfeschlegelsteinhausen-Montgomery-Fairweather"]);
  try {
    await signInAs(context, "esme", baseURL!);
    await page.setViewportSize({ width: 1280, height: 900 });
    // The menu's name card in both frames: the account pages and the workspace itself.
    for (const path of ["/dashboard/profile", "/dashboard"]) {
      await page.goto(path);
      const rail = await page.locator("aside.sidebar").boundingBox();
      const name = await page.locator(".sidebar .profile-button strong").boundingBox();
      expect(name!.x + name!.width, path).toBeLessThanOrEqual(rail!.x + rail!.width);
      // The account frame also gives the full name on hover; the workspace's approved name card has no title to carry it.
      if (path !== "/dashboard") await expect(page.locator(".sidebar .profile-button"), path).toHaveAttribute("title", /Wolfeschlegelsteinhausen/);
    }
  } finally {
    await q(`update profiles set full_name = $2 where id = $1`, [id("esme"), before.full_name]);
  }
});
