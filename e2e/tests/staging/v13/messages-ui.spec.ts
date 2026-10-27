import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// V13 workspace: the Messages screens on the real database, as signed-in
// members in separate browsers. Fictional staging members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

const avery = account("avery").id, bram = account("bram").id, cass = account("cass").id;
const uuid = () => crypto.randomUUID();

async function wipe() {
  await q(`delete from workspace_drafts where profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
  await q(`delete from conversations where id in (select conversation_id from conversation_participants where profile_id = any($1::uuid[]))`, [[avery, bram, cass]]);
  await q(`delete from referral_requests where requesting_profile_id = any($1::uuid[]) and client_request_id is not null`, [[avery, bram, cass]]);
  await q(`delete from notification_events where dedup_key like 'message:%' or dedup_key like 'referral%'`);
  await q(`delete from blocked_members where profile_id = any($1::uuid[])`, [[avery, bram, cass]]);
}
test.beforeEach(wipe);
test.afterAll(wipe);

async function openAs(browser: any, who: string, baseURL: string, path = "/dashboard/messages") {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, permissions: ["microphone"] });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("#app .sidebar")).toBeVisible();
  return { context, page };
}
const catchUp = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
const startDirect = async (page: Page, id: string) => {
  await page.getByRole("button", { name: "New message" }).click();
  await page.locator(`[data-action="person-message:${id}"]`).click();
  await expect(page.locator(".overlay")).toHaveCount(0); // the window closes once the conversation is open
  await expect(page.locator("#message-input")).toBeVisible();
};
const send = async (page: Page, text: string) => {
  await page.locator("#message-input").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
};

test("MSU-01 send from one browser, read and answer in another; each message is stored once", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "Hello Bram, a quick question about next week.");
  await expect(a.page.locator(".message-group.outgoing .delivery-state.sent").last()).toBeVisible();
  const rows = await q(`select m.body, m.client_message_id from conversation_messages m join conversations c on c.id = m.conversation_id where c.context_key like 'direct-%'`);
  expect(rows).toHaveLength(1);
  expect(rows[0].body).toBe("Hello Bram, a quick question about next week.");

  const b = await openAs(browser, "bram", baseURL!);
  await expect(b.page.locator(".nav-count")).toHaveText("1");
  await expect(b.page.locator(".inbox-colleague", { hasText: "Avery" }).locator(".unread-pill")).toHaveText("1");
  await b.page.locator(".inbox-latest").first().click();
  await expect(b.page.locator(".message-group", { hasText: "a quick question about next week" })).toBeVisible();
  await expect(b.page.locator(".nav-count")).toHaveCount(0);
  await send(b.page, "Happy to help, Avery.");
  await expect(b.page.locator(".message-group.outgoing .delivery-state.sent").last()).toBeVisible();

  // Avery's open tab catches up without a reload.
  await catchUp(a.page);
  await expect(a.page.locator(".message-group", { hasText: "Happy to help, Avery." })).toBeVisible();
  await a.context.close();
  await b.context.close();
});

test("MSU-02 a dropped connection shows Failed; Retry sends the same message once", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  let dropped = 0;
  await a.page.route("**/dashboard/messages*", async (route) => {
    const post = route.request().method() === "POST" ? route.request().postData() || "" : "";
    if (post.includes("message.send") && dropped === 0) {
      dropped++;
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await send(a.page, "This one has to survive a bad connection.");
  await expect(a.page.locator(".delivery-state.failed")).toContainText("Failed");
  expect((await q(`select 1 from conversation_messages where body like 'This one has to survive%'`)).length).toBe(0);
  await a.page.getByRole("button", { name: "Retry" }).click();
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  expect((await q(`select 1 from conversation_messages where body like 'This one has to survive%'`)).length).toBe(1);
  // A reload shows the same single message.
  await a.page.reload();
  await expect(a.page.locator(".message-group", { hasText: "This one has to survive" })).toHaveCount(1);
  await a.context.close();
});

test("MSU-03 edit, heart and remove: the other person sees each change", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  // (The menu on the very first message of a conversation sits under the header strip, as in the approved design.)
  await send(a.page, "Opening line.");
  await expect(a.page.locator(".delivery-state.sent")).toHaveCount(1);
  await send(a.page, "First draft of my note.");
  await expect(a.page.locator(".delivery-state.sent")).toHaveCount(2);
  const b = await openAs(browser, "bram", baseURL!);
  await b.page.locator(".inbox-latest").first().click();
  await expect(b.page.locator(".message-group", { hasText: "First draft of my note." })).toBeVisible();

  await a.page.locator(".message-group.outgoing .message-menu-button").last().click();
  await a.page.getByRole("button", { name: "Edit", exact: true }).click();
  await a.page.locator("#edit-message-text").fill("Final version of my note.");
  await a.page.getByRole("button", { name: "Save changes" }).click();
  await expect(a.page.locator(".message-group", { hasText: "Final version of my note." })).toContainText("Edited");
  expect((await one(`select body, edited_at from conversation_messages where body like '%of my note.'`)).edited_at).not.toBeNull();
  await catchUp(b.page);
  await expect(b.page.locator(".message-group", { hasText: "Final version of my note." })).toContainText("Edited");

  // Marking it useful is Bram's, and puts Avery in his Suggested for you.
  await b.page.locator(".message-group:not(.outgoing) .message-menu-button").last().click();
  await b.page.locator('[data-action^="message-react:"]').click();
  await expect(b.page.locator(".message-group", { hasText: "Final version" }).locator(".message-meta")).toContainText("♥");
  await expect.poll(async () => (await q(`select reaction from message_reactions where profile_id = $1`, [bram])).map((r) => r.reaction)).toEqual(["heart"]);
  await catchUp(a.page);
  await expect(a.page.locator(".message-group", { hasText: "Final version" }).locator(".message-meta")).not.toContainText("♥");

  await a.page.locator(".message-group.outgoing .message-menu-button").last().click();
  await a.page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(a.page.locator("#toast")).toContainText("Message removed");
  expect((await one(`select deleted_at from conversation_messages where deleted_at is not null`)).deleted_at).not.toBeNull();
  await catchUp(b.page);
  await expect(b.page.locator(".message-group", { hasText: "Final version" })).toHaveCount(0);
  await a.context.close();
  await b.context.close();
});

test("MSU-04 a question from a referral opens its own conversation, apart from the direct one", async ({ browser, baseURL }) => {
  const ref = (await asMember(avery, `select public.referral_create($1::jsonb) as r`, [JSON.stringify({
    requestId: uuid(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual", insurance: "", language: "",
    prescribing: false, audience: "selected", selected: [bram], timeframe: "Within two weeks", message: "Evenings if possible.",
  })])).rows[0].r;
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "Separate chat about something else.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();

  const b = await openAs(browser, "bram", baseURL!, `/dashboard/referrals?referral=${ref.referralId}`);
  await b.page.getByRole("button", { name: "Discuss first" }).click();
  await b.page.locator("#question-text").fill("Do you need weekday evenings?");
  await b.page.getByRole("button", { name: "Send question" }).click();
  await expect(b.page.locator("#toast")).toContainText("Your question is in");
  await expect(b.page).toHaveURL(/\/dashboard\/messages/);
  await expect(b.page.locator(".context-strip")).toContainText("Referral");
  await expect(b.page.locator(".message-group").first()).toContainText("Evenings if possible.");
  await expect(b.page.locator(".message-group.outgoing")).toContainText("Do you need weekday evenings?");

  // Avery has two conversations with Bram and can tell them apart.
  await a.page.reload();
  await a.page.locator(".inbox-context-toggle").click();
  await expect(a.page.locator(".colleague-contexts .inbox-item")).toHaveCount(2);
  const options = await a.page.locator("#conversation-context option").allTextContents();
  expect(options.some((o) => o.startsWith("Referral"))).toBe(true);
  expect(options.some((o) => o.startsWith("Direct conversation"))).toBe(true);
  await a.page.locator(".colleague-contexts .inbox-item", { hasText: "Referral" }).click();
  await expect(a.page.locator(".message-group", { hasText: "Do you need weekday evenings?" })).toBeVisible();
  await expect(a.page.locator(".message-group", { hasText: "Separate chat" })).toHaveCount(0);
  // "View referral" goes to the referral.
  await a.page.getByRole("button", { name: /View referral/ }).click();
  await expect(a.page.locator(".modal")).toContainText("Anxiety/Panic Disorders");
  await a.context.close();
  await b.context.close();
});

test("MSU-05 a file travels with its message and only the two people can open it", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  const bytes = Buffer.from("%PDF-1.4 fictional plan for tests only");
  await a.page.setInputFiles("#attachment-input", { name: "plan.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect(a.page.locator(".draft-attachment")).toContainText("plan.pdf");
  await send(a.page, "Here is the plan.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  const att = await one(`select a.message_id, a.file_name, a.file_size, a.storage_path from message_attachments a`);
  expect(att.file_name).toBe("plan.pdf");
  expect(Number(att.file_size)).toBe(bytes.length);

  const b = await openAs(browser, "bram", baseURL!);
  await b.page.locator(".inbox-latest").first().click();
  const link = b.page.locator(".attachment-link", { hasText: "plan.pdf" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toBe(`/dashboard/message-files/${att.message_id}`);
  const got = await b.page.request.get(href!);
  expect(got.status()).toBe(200);
  expect(got.headers()["content-disposition"]).toContain("attachment");
  expect(await got.body()).toEqual(bytes);

  // Someone else, and someone signed out, get nothing.
  const c = await openAs(browser, "cass", baseURL!);
  expect((await c.page.request.get(href!)).status()).toBe(404);
  const anon = await browser.newContext();
  expect([401, 403, 307, 302, 200].includes((await anon.request.get(`${baseURL}${href}`, { maxRedirects: 0 })).status())).toBe(true);
  const anonBody = await (await anon.request.get(`${baseURL}${href}`)).body();
  expect(anonBody.equals(bytes)).toBe(false);
  await a.context.close();
  await b.context.close();
  await c.context.close();
  await anon.close();
});

test("MSU-06 a file that was added and then dropped is taken out again", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  const name = `drop-${Date.now()}.txt`;
  const stored = async () => (await q(`select 1 from storage.objects where bucket_id = 'message-files' and name like $1`, [`%${name}`])).length;
  await a.page.setInputFiles("#attachment-input", { name, mimeType: "text/plain", buffer: Buffer.from("never sent") });
  await expect(a.page.locator(".draft-attachment")).toContainText(name);
  await expect.poll(stored).toBe(1);
  await a.page.locator('[data-action="attachment-remove"]').click();
  await expect.poll(stored).toBe(0);
  expect((await q(`select 1 from message_attachments`)).length).toBe(0);
  // Over 20 MB is refused before it goes anywhere.
  await a.page.setInputFiles("#attachment-input", { name: "big.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(21 * 1024 * 1024) });
  await expect(a.page.locator("#toast")).toContainText("smaller than 20 MB");
  await a.context.close();
});

test("MSU-07 a voice note is recorded, previewed, sent and played by the other person", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await a.page.locator('[data-action="record-start"]').click();
  await expect(a.page.locator("#record-timer")).toBeVisible();
  await a.page.waitForTimeout(1600);
  await a.page.locator('[data-action="record-stop"]').click();
  await expect(a.page.locator(".record-preview audio")).toBeVisible();
  await a.page.locator('[data-action="audio-send"]').click();
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  const att = await one(`select message_id, kind, mime_type, duration_seconds, file_size from message_attachments`);
  expect(att.kind).toBe("audio");
  expect(att.mime_type).toMatch(/^audio\//);
  expect(Number(att.file_size)).toBeGreaterThan(500);

  const b = await openAs(browser, "bram", baseURL!);
  await b.page.locator(".inbox-latest").first().click();
  const audio = b.page.locator(".audio-message audio");
  await expect(audio).toHaveAttribute("src", `/dashboard/message-files/${att.message_id}`);
  await expect(b.page.locator(".audio-message small")).toContainText("Voice note");
  // Playback asks for ranges (Safari does), and gets them.
  const ranged = await b.page.request.get(`/dashboard/message-files/${att.message_id}`, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-range"]).toMatch(/^bytes 0-99\//);
  expect(ranged.headers()["content-type"]).toMatch(/^audio\//);
  await a.context.close();
  await b.context.close();
});

test("MSU-08 the latest 200 load with the conversation; earlier ones on request", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "Seed so the conversation exists.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  const conv = (await one(`select id from conversations where context_key like 'direct-%'`)).id;
  await q(`insert into conversation_messages (conversation_id, author_id, body, created_at) select $1, $2, 'older ' || g, now() - (400 - g) * interval '1 minute' from generate_series(1, 260) g`, [conv, bram]);
  await a.page.reload();
  await a.page.locator(".inbox-latest").first().click();
  await expect(a.page.locator(".message-group")).toHaveCount(200);
  await a.page.getByRole("button", { name: "Show earlier messages" }).click();
  await expect(a.page.locator(".message-group")).toHaveCount(261);
  await expect(a.page.getByRole("button", { name: "Show earlier messages" })).toHaveCount(0);
  await a.context.close();
});

test("MSU-09 links from earlier versions still open the right place", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "Hello.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  const conv = (await one(`select id from conversations where context_key like 'direct-%'`)).id;
  await a.page.goto(`/dashboard/messages/${conv}`);
  await expect(a.page.locator(".chat-header")).toContainText("Bram");
  await expect(a.page.locator(".message-group", { hasText: "Hello." })).toBeVisible();
  await a.page.goto(`/dashboard/messages?to=${bram}`);
  await expect(a.page.locator(".chat-header")).toContainText("Bram");
  await a.page.goto("/dashboard/messages?tab=notifications");
  await expect(a.page).toHaveURL(/\/dashboard\/notifications$/);
  await a.context.close();
});
