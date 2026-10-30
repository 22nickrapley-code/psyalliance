import { test } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { assertLocal, q, one } from "../../lib/staging";
const avery = account("avery").id, bram = account("bram").id;
test("dbg size", async ({ browser, baseURL }) => {
  assertLocal(baseURL!);
  await q(`delete from conversations where context_key = 'direct-dbg-size'`);
  const c = await one(`insert into conversations (created_by, title, context_key) values ($1, null, 'direct-dbg-size') returning id`, [avery]);
  await q(`insert into conversation_participants (conversation_id, profile_id, last_read_at) values ($1, $2, now()), ($1, $3, now())`, [c.id, avery, bram]);
  const context = await browser.newContext();
  await signInAs(context, "avery", baseURL!);
  const page = await context.newPage();
  await page.goto("/dashboard/messages");
  for (const mb of [1, 5, 9, 11, 15, 19.5, 21]) {
    const r = await page.request.post("/dashboard/message-files", { multipart: { key: "direct-dbg-size", kind: "file", file: { name: `s${mb}.bin`, mimeType: "application/octet-stream", buffer: Buffer.alloc(Math.round(mb * 1024 * 1024), 65) } } });
    console.log("SIZE", mb, "MB ->", r.status(), (await r.text()).slice(0, 90));
  }
  await q(`delete from conversations where context_key = 'direct-dbg-size'`);
  await context.close();
});
