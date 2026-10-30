import { test, expect, type Page } from "@playwright/test";
import { signInAs, account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// Release B, Messages (brief M01 to M03 and P01): drafts of text, files and voice notes per conversation, kept across
// switching and reload; an upload that fails or is cancelled; access that is refused; one logical message however it is sent.
// Real local database and storage, fictional members only.
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
}
// Files cannot be deleted from the database directly, so each test counts the bucket against where it started.
let base = 0;
const objects = async () => Number((await q(`select count(*)::int as c from storage.objects where bucket_id = 'message-files'`))[0].c);
test.beforeEach(async () => { await wipe(); base = await objects(); });
test.afterAll(wipe);

async function openAs(browser: any, who: string, baseURL: string, path = "/dashboard/messages") {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, permissions: ["microphone"] });
  await signInAs(context, who, baseURL);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("#app .sidebar")).toBeVisible();
  return { context, page };
}
const startDirect = async (page: Page, id: string) => {
  await page.getByRole("button", { name: "New message" }).click();
  await page.locator(`[data-action="person-message:${id}"]`).click();
  await expect(page.locator(".overlay")).toHaveCount(0);
  await expect(page.locator("#message-input")).toBeVisible();
};
const send = async (page: Page, text: string) => {
  await page.locator("#message-input").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
};
const stored = async () => (await objects()) - base;
const mediaDrafts = async () => q(`select key, data from workspace_drafts where profile_id = $1 and kind = 'message-media'`, [avery]);
const textDrafts = async () => q(`select key, data from workspace_drafts where profile_id = $1 and kind = 'message' order by key`, [avery]);

test("MB-01 M02 a different text draft per conversation survives switching, closing and reload", async ({ browser, baseURL }) => {
  // Rows an earlier version left behind (it saved the whole draft list as if it were a conversation) are cleaned up, not kept.
  await q(`insert into workspace_drafts (profile_id, kind, key, data) values ($1, 'message', 'message', '{"x": "old"}'::jsonb), ($1, 'message', 'cover', '{"y": "old"}'::jsonb)`, [avery]);
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "Hello Bram.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  await startDirect(a.page, cass);
  await send(a.page, "Hello Cass.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  await a.page.locator("#message-input").fill("Unsent thought for Cass");
  // Switch to Bram's conversation and write something else there.
  await a.page.locator(".inbox-colleague", { hasText: "Bram" }).locator(".inbox-latest").click();
  await expect(a.page.locator("#message-input")).toHaveValue("");
  await a.page.locator("#message-input").fill("Unsent thought for Bram");
  await a.page.locator(".inbox-colleague", { hasText: "Cass" }).locator(".inbox-latest").click();
  await expect(a.page.locator("#message-input")).toHaveValue("Unsent thought for Cass");
  await expect.poll(async () => (await textDrafts()).length).toBe(2);
  // Close the page and come back: both are still there, in their own conversations.
  await a.page.reload();
  await a.page.locator(".inbox-colleague", { hasText: "Bram" }).locator(".inbox-latest").click();
  await expect(a.page.locator("#message-input")).toHaveValue("Unsent thought for Bram");
  await a.page.locator(".inbox-colleague", { hasText: "Cass" }).locator(".inbox-latest").click();
  await expect(a.page.locator("#message-input")).toHaveValue("Unsent thought for Cass");
  // Sending clears only that conversation's draft.
  await a.page.getByRole("button", { name: "Send message" }).click();
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  await expect.poll(async () => (await textDrafts()).length).toBe(1);
  expect(JSON.stringify((await textDrafts())[0].data)).toContain("for Bram");
  expect((await q(`select 1 from workspace_drafts where profile_id = $1 and kind = 'message' and key in ('message', 'cover', 'hub-state', 'message-media')`, [avery])).length).toBe(0);
  await a.context.close();
});

test("MB-02 M02 a file attached to an unsent message is kept across reload, then sent once", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "Seed.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  const bytes = Buffer.from("%PDF-1.4 fictional plan for tests only");
  await a.page.setInputFiles("#attachment-input", { name: "plan-b.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect(a.page.locator(".draft-attachment")).toContainText("plan-b.pdf");
  await expect.poll(stored).toBe(1);
  await expect.poll(async () => (await mediaDrafts()).length).toBe(1);
  // Reload: the file is still attached to that conversation, nothing was uploaded twice.
  await a.page.reload();
  await a.page.locator(".inbox-latest").first().click();
  await expect(a.page.locator(".draft-attachment")).toContainText("plan-b.pdf");
  expect(await stored()).toBe(1);
  // Another conversation does not show it.
  await startDirect(a.page, cass);
  await expect(a.page.locator(".draft-attachment")).toHaveCount(0);
  await send(a.page, "Seed for Cass.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  await a.page.locator(".inbox-colleague", { hasText: "Bram" }).locator(".inbox-latest").click();
  await expect(a.page.locator(".draft-attachment")).toContainText("plan-b.pdf");
  await send(a.page, "Here is the plan.");
  await expect.poll(async () => (await q(`select 1 from message_attachments`)).length).toBe(1);
  const att = await q(`select a.message_id, a.file_name, a.file_size from message_attachments a`);
  expect(att).toHaveLength(1);
  expect(att[0].file_name).toBe("plan-b.pdf");
  expect(await stored()).toBe(1);
  await expect.poll(async () => (await mediaDrafts()).length).toBe(0);
  // The sent file opens for the sender without a reload, and again after one.
  await expect(a.page.locator(".attachment-link", { hasText: "plan-b.pdf" })).toBeVisible();
  await a.page.reload();
  await a.page.locator(".inbox-colleague", { hasText: "Bram" }).locator(".inbox-latest").click();
  await expect(a.page.locator(".draft-attachment")).toHaveCount(0);
  const b = await openAs(browser, "bram", baseURL!);
  await b.page.locator(".inbox-latest").first().click();
  const got = await b.page.request.get(`/dashboard/message-files/${att[0].message_id}`);
  expect(got.status()).toBe(200);
  expect(await got.body()).toEqual(bytes);
  await a.context.close();
  await b.context.close();
});

test("MB-03 M02 a voice note is kept across reload, shown as ready to send, then sent and played", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "Seed.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  await a.page.locator('[data-action="record-start"]').click();
  await expect(a.page.locator("#record-timer")).toBeVisible();
  await a.page.waitForTimeout(1500);
  await a.page.locator('[data-action="record-stop"]').click();
  await expect(a.page.locator(".record-preview audio")).toBeVisible(); // heard before it is sent
  await expect.poll(stored).toBe(1);
  await expect.poll(async () => (await mediaDrafts()).length).toBe(1);
  expect((await mediaDrafts())[0].data.kind).toBe("audio");
  await a.page.reload();
  await a.page.locator(".inbox-latest").first().click();
  await expect(a.page.locator(".record-preview")).toContainText("Voice note ready to send");
  expect(await stored()).toBe(1);
  await a.page.locator('[data-action="audio-send"]').click();
  await expect.poll(async () => (await q(`select 1 from message_attachments`)).length).toBe(1);
  const att = await one(`select message_id, kind, file_size from message_attachments`);
  expect(att.kind).toBe("audio");
  expect(await stored()).toBe(1);
  await expect.poll(async () => (await mediaDrafts()).length).toBe(0);
  // The message Avery just sent plays for her (from the stored copy), and for Bram.
  await expect(a.page.locator(".audio-message audio").last()).toHaveAttribute("src", `/dashboard/message-files/${att.message_id}`);
  const b = await openAs(browser, "bram", baseURL!);
  await b.page.locator(".inbox-latest").first().click();
  await expect(b.page.locator(".audio-message audio")).toHaveAttribute("src", `/dashboard/message-files/${att.message_id}`);
  const ranged = await b.page.request.get(`/dashboard/message-files/${att.message_id}`, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  await a.context.close();
  await b.context.close();
});

test("MB-04 M03 a discarded voice note is taken out of storage and its draft row is removed", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "Seed.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  await a.page.locator('[data-action="record-start"]').click();
  await a.page.waitForTimeout(1200);
  await a.page.locator('[data-action="record-stop"]').click();
  await expect(a.page.locator(".record-preview audio")).toBeVisible();
  await expect.poll(stored).toBe(1);
  await a.page.locator('[data-action="record-cancel"]').click();
  await expect.poll(stored).toBe(0);
  await expect.poll(async () => (await mediaDrafts()).length).toBe(0);
  await expect(a.page.locator("#message-input")).toBeVisible(); // typing is immediate again
  await a.page.reload();
  await a.page.locator(".inbox-latest").first().click();
  await expect(a.page.locator(".record-preview")).toHaveCount(0);
  await a.context.close();
});

test("MB-05 M03 an upload that fails says so, keeps the message usable and leaves nothing behind", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "Seed.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  let refused = 0;
  await a.page.route("**/dashboard/message-files", async (route) => {
    if (route.request().method() === "POST" && refused === 0) { refused++; await route.abort("connectionreset"); } else await route.continue();
  });
  await a.page.locator("#message-input").fill("Words that must not be lost");
  await a.page.setInputFiles("#attachment-input", { name: "fails.txt", mimeType: "text/plain", buffer: Buffer.from("never arrives") });
  await expect(a.page.locator("#toast")).toContainText("could not be reached");
  await expect(a.page.locator(".draft-attachment")).toHaveCount(0);
  await expect(a.page.locator("#message-input")).toHaveValue("Words that must not be lost");
  expect(await stored()).toBe(0);
  // Try again (the connection is back): it works, and the message goes with its file.
  await a.page.setInputFiles("#attachment-input", { name: "works.txt", mimeType: "text/plain", buffer: Buffer.from("arrives") });
  await expect(a.page.locator(".draft-attachment")).toContainText("works.txt");
  await expect.poll(stored).toBe(1);
  await a.page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(async () => (await q(`select 1 from message_attachments where file_name = 'works.txt'`)).length).toBe(1);
  expect((await q(`select 1 from conversation_messages where body = 'Words that must not be lost'`)).length).toBe(1);
  await a.context.close();
});

test("MB-06 M03 removing a file while it is still uploading leaves nothing in storage", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "Seed.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  await a.page.route("**/dashboard/message-files", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1800));
    await route.continue();
  });
  await a.page.setInputFiles("#attachment-input", { name: "slow.txt", mimeType: "text/plain", buffer: Buffer.from("slow one") });
  await expect(a.page.locator(".draft-attachment")).toContainText("slow.txt");
  await a.page.locator('[data-action="attachment-remove"]').click();
  await expect(a.page.locator(".draft-attachment")).toHaveCount(0);
  await a.page.waitForTimeout(3500); // the slow upload finishes and is then taken back out
  await expect.poll(stored, { timeout: 10000 }).toBe(0);
  expect((await mediaDrafts()).length).toBe(0);
  await a.context.close();
});

test("MB-07 M03 access: strangers cannot add to, remove from or read a conversation's files; a removed message's file is gone", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await a.page.setInputFiles("#attachment-input", { name: "private.txt", mimeType: "text/plain", buffer: Buffer.from("between two people") });
  await expect.poll(stored).toBe(1);
  await send(a.page, "Private file.");
  await expect.poll(async () => (await q(`select 1 from message_attachments`)).length).toBe(1);
  const att = await one(`select message_id, storage_path from message_attachments`);
  const conv = String(att.storage_path).split("/")[0];
  const c = await openAs(browser, "cass", baseURL!);
  // Cass cannot add a file to their conversation (the key is not hers), cannot delete it, cannot open it.
  const key = (await one(`select context_key from conversations where id = $1`, [conv])).context_key;
  const add = await c.page.request.post("/dashboard/message-files", { multipart: { key, kind: "file", file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("nope") } } });
  expect(add.status()).toBe(404);
  const del = await c.page.request.delete("/dashboard/message-files", { data: { path: att.storage_path } });
  expect(del.status()).toBe(403);
  expect((await c.page.request.get(`/dashboard/message-files/${att.message_id}`)).status()).toBe(404);
  // Avery cannot delete a file that has been sent either.
  const sentDel = await a.page.request.delete("/dashboard/message-files", { data: { path: att.storage_path } });
  expect(sentDel.status()).toBe(409);
  // An empty file and one over 20 MB are refused by the server as well.
  const empty = await a.page.request.post("/dashboard/message-files", { multipart: { key, kind: "file", file: { name: "e.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) } } });
  expect(empty.status()).toBe(400);
  // Just under the limit goes through (a 10 MB body limit in the framework once cut files between 10 and 20 MB short).
  const near = await a.page.request.post("/dashboard/message-files", { multipart: { key, kind: "file", file: { name: "near.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(19 * 1024 * 1024, 65) } } });
  expect(near.status()).toBe(200);
  const nearPath = (await near.json()).attachment.path;
  expect((await a.page.request.delete("/dashboard/message-files", { data: { path: nearPath } })).status()).toBe(200);
  const big = await a.page.request.post("/dashboard/message-files", { multipart: { key, kind: "file", file: { name: "big.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(21 * 1024 * 1024) } } });
  expect(big.status()).toBe(413);
  const badAudio = await a.page.request.post("/dashboard/message-files", { multipart: { key, kind: "audio", file: { name: "a.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") } } });
  expect(badAudio.status()).toBe(415);
  // After Avery removes the message, Bram can no longer open the file.
  const b = await openAs(browser, "bram", baseURL!);
  expect((await b.page.request.get(`/dashboard/message-files/${att.message_id}`)).status()).toBe(200);
  await a.page.locator(".message-group.outgoing .message-menu-button").last().click();
  await a.page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(a.page.locator("#toast")).toContainText("Message removed");
  expect((await b.page.request.get(`/dashboard/message-files/${att.message_id}`)).status()).toBe(404);
  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test("MB-08 M02 pressing Send twice, and sending from two devices at once, still gives one logical message", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await a.page.locator("#message-input").fill("Only once please.");
  const button = a.page.getByRole("button", { name: "Send message" });
  await button.dblclick();
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  expect((await q(`select 1 from conversation_messages where body = 'Only once please.'`)).length).toBe(1);
  // The same message id arriving from a second device is stored once (the server keeps one row per client id).
  const conv = (await one(`select id, context_key from conversations where context_key like 'direct-%'`));
  const id = uuid();
  const [r1, r2] = await Promise.all([
    asMember(avery, `select public.message_send($1, 'Raced message', $2, null) as r`, [conv.context_key, id]),
    asMember(avery, `select public.message_send($1, 'Raced message', $2, null) as r`, [conv.context_key, id]),
  ]);
  expect(r1.rows[0].r.ok !== false && r2.rows[0].r.ok !== false).toBe(true);
  expect((await q(`select 1 from conversation_messages where body = 'Raced message'`)).length).toBe(1);
  await a.context.close();
});

test("MB-09 M01 a notification opens the exact conversation it is about, not the colleague's other one", async ({ browser, baseURL }) => {
  const ref = (await asMember(avery, `select public.referral_create($1::jsonb) as r`, [JSON.stringify({
    requestId: uuid(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual", insurance: "", language: "",
    prescribing: false, audience: "selected", selected: [bram], timeframe: "Within two weeks", message: "Evenings if possible.",
  })])).rows[0].r;
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "A direct note that is not the one in the notification.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  const b = await openAs(browser, "bram", baseURL!, `/dashboard/referrals?referral=${ref.referralId}`);
  await b.page.getByRole("button", { name: "Discuss first" }).click();
  await b.page.locator("#question-text").fill("Which evenings suit you?");
  await b.page.getByRole("button", { name: "Send question" }).click();
  await expect(b.page.locator("#toast")).toContainText("Your question is in");
  await b.context.close();
  // Avery's notifications list: the item about Bram's question opens the referral conversation.
  await a.page.goto("/dashboard/notifications");
  const row = a.page.locator("li, article, .notification, .notice-row", { hasText: "Bram" }).filter({ has: a.page.getByRole("button", { name: "Open" }) }).first();
  await row.getByRole("button", { name: "Open" }).click();
  await expect(a.page).toHaveURL(/\/dashboard\/messages\?thread=referral-/);
  await expect(a.page.locator(".context-strip")).toContainText("Referral");
  await expect(a.page.locator(".message-group", { hasText: "Which evenings suit you?" })).toBeVisible();
  await expect(a.page.locator(".message-group", { hasText: "not the one in the notification" })).toHaveCount(0);
  await a.context.close();
});

const unreadIn = async (prefix: string) => Number((await q(`select count(*)::int c from conversation_messages m join conversations c on c.id = m.conversation_id join conversation_participants p on p.conversation_id = m.conversation_id and p.profile_id = $1 where c.context_key like $2 and m.author_id <> $1 and m.deleted_at is null and m.created_at > coalesce(p.last_read_at, 'epoch')`, [avery, prefix + "%"]))[0].c);

test("MB-10 M01 one colleague, two contexts: the outer row shows the latest message and opens exactly that context, a count says how many, and opening one leaves the other unread", async ({ browser, baseURL }) => {
  const ref = (await asMember(avery, `select public.referral_create($1::jsonb) as r`, [JSON.stringify({
    requestId: uuid(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual", insurance: "", language: "",
    prescribing: false, audience: "selected", selected: [bram], timeframe: "Within two weeks", message: "Evenings if possible.",
  })])).rows[0].r;
  // Bram asks a question in the referral conversation; then Avery writes in the direct one, which is now the latest message.
  const b = await openAs(browser, "bram", baseURL!, `/dashboard/referrals?referral=${ref.referralId}`);
  await b.page.getByRole("button", { name: "Discuss first" }).click();
  await b.page.locator("#question-text").fill("Which evenings suit you?");
  await b.page.getByRole("button", { name: "Send question" }).click();
  await expect(b.page.locator("#toast")).toContainText("Your question is in");
  await b.context.close();
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  await send(a.page, "A direct note from me.");
  await expect(a.page.locator(".delivery-state.sent").last()).toBeVisible();
  await a.page.reload();
  const row = a.page.locator(".inbox-colleague", { hasText: "Bram" });
  await expect(row.locator(".inbox-latest-preview")).toHaveText("You: A direct note from me.");
  await expect(row.locator(".inbox-latest small")).not.toHaveText(""); // the context that produced it is named
  await expect(row.locator(".context-count")).toHaveText("2 conversations");
  const pill = row.locator(".inbox-person-meta .unread-pill");
  await expect(pill).toHaveText("1");
  await expect(pill).toHaveAttribute("aria-label", "1 unread message");
  const items = row.locator(".colleague-contexts .inbox-item");
  const open = async () => { if ((await items.count()) === 0) await row.getByRole("button", { name: /conversations with Bram/ }).click(); await expect(items).toHaveCount(2); };
  await open();
  const labels = (await items.locator(".inbox-context").allInnerTexts()).map((t) => t.trim());
  expect(new Set(labels).size).toBe(2);
  expect(labels.some((l) => /Referral/i.test(l))).toBe(true);
  await expect(items.filter({ hasText: "Which evenings suit you?" }).locator(".unread-pill")).toHaveText("1");
  // Opening the latest preview opens the context that produced it. The other context stays unread.
  await row.locator(".inbox-latest").click();
  await expect(a.page.locator(".message-group", { hasText: "A direct note from me." })).toBeVisible();
  await expect(a.page.locator(".message-group", { hasText: "Which evenings suit you?" })).toHaveCount(0);
  await a.page.waitForTimeout(1500);
  expect(await unreadIn("referral-")).toBe(1);
  await open();
  await items.filter({ hasText: "Which evenings suit you?" }).click();
  await expect(a.page.locator(".context-strip")).toContainText("Referral");
  await expect(a.page.locator(".message-group", { hasText: "Which evenings suit you?" })).toBeVisible();
  await expect(a.page.locator(".message-group", { hasText: "A direct note from me." })).toHaveCount(0);
  await expect.poll(() => unreadIn("referral-")).toBe(0);
  await a.context.close();
});

test("MB-11 M02 composing stays immediate while a message is sending, and a Retry pressed twice still gives one message", async ({ browser, baseURL }) => {
  const a = await openAs(browser, "avery", baseURL!);
  await startDirect(a.page, bram);
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  let aborted = 0;
  await a.page.route("**/dashboard/messages*", async (route) => {
    const post = route.request().method() === "POST" ? route.request().postData() || "" : "";
    if (post.includes("message.send") && post.includes("PB first")) { await held; await route.continue(); }
    else if (post.includes("message.send") && post.includes("PB third") && aborted === 0) { aborted++; await route.abort("connectionreset"); }
    else await route.continue();
  });
  await send(a.page, "PB first message");
  await expect(a.page.locator(".message-group", { hasText: "PB first message" }).locator(".delivery-state.sending")).toBeVisible();
  // The first is still on its way; the box is free, and the next message goes out on its own.
  await expect(a.page.locator("#message-input")).toBeEnabled();
  await send(a.page, "PB second message, typed while the first is sending");
  // It is in the conversation at once, in its place, and the box is free again. (Sends leave one after another, so it waits its turn.)
  await expect(a.page.locator(".message-group", { hasText: "PB second message" })).toBeVisible();
  await expect(a.page.locator("#message-input")).toHaveValue("");
  await expect(a.page.locator("#message-input")).toBeEnabled();
  release();
  await expect(a.page.locator(".message-group", { hasText: "PB first message" }).locator(".delivery-state.sent")).toBeVisible();
  await expect(a.page.locator(".message-group", { hasText: "PB second message" }).locator(".delivery-state.sent")).toBeVisible();
  const order = await q(`select body from conversation_messages where body like 'PB %' order by id`);
  expect(order.map((r) => (String(r.body).startsWith("PB first") ? "first" : "second"))).toEqual(["first", "second"]);
  // A send that fails and is retried twice in a row is still one message.
  await send(a.page, "PB third message");
  await expect(a.page.locator(".delivery-state.failed")).toBeVisible();
  await a.page.getByRole("button", { name: "Retry" }).dblclick();
  await expect(a.page.locator(".message-group", { hasText: "PB third message" }).locator(".delivery-state.sent")).toBeVisible();
  for (const t of ["PB first message", "PB second message", "PB third message"]) expect((await q(`select 1 from conversation_messages where body like $1`, [t + "%"])).length, t).toBe(1);
  await a.context.close();
});

test("MB-12 M02 two devices on one account: each message is shown once on both, in the conversation it was sent in", async ({ browser, baseURL }) => {
  const one_ = await openAs(browser, "avery", baseURL!);
  await startDirect(one_.page, bram);
  await send(one_.page, "PB from device one");
  await expect(one_.page.locator(".delivery-state.sent").last()).toBeVisible();
  const two = await openAs(browser, "avery", baseURL!);
  await two.page.locator(".inbox-colleague", { hasText: "Bram" }).locator(".inbox-latest").click();
  await expect(two.page.locator(".message-group", { hasText: "PB from device one" })).toHaveCount(1);
  await send(two.page, "PB from device two");
  await expect(two.page.locator(".delivery-state.sent").last()).toBeVisible();
  await expect(one_.page.locator(".message-group", { hasText: "PB from device two" })).toHaveCount(1, { timeout: 15000 });
  await expect(one_.page.locator(".message-group", { hasText: "PB from device one" })).toHaveCount(1);
  for (const t of ["PB from device one", "PB from device two"]) expect((await q(`select 1 from conversation_messages where body = $1`, [t])).length, t).toBe(1);
  await one_.context.close();
  await two.context.close();
});
