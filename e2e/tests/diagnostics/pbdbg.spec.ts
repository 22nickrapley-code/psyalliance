import { test, expect } from "@playwright/test";
import { signInAs, account } from "../../lib/auth";
import { q, asMember } from "../../lib/staging";
const avery = account("avery").id, bram = account("bram").id;
test("pbdbg2", async ({ browser, baseURL }) => {
  await q(`delete from conversations where id in (select conversation_id from conversation_participants where profile_id = $1)`, [avery]);
  const ref = (await asMember(avery, `select public.referral_create($1::jsonb) as r`, [JSON.stringify({
    requestId: crypto.randomUUID(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual", insurance: "", language: "",
    prescribing: false, audience: "selected", selected: [bram], timeframe: "Within two weeks", message: "Evenings if possible.",
  })])).rows[0].r;
  const cb = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(cb, "bram", baseURL!);
  const b = await cb.newPage();
  await b.goto(`/dashboard/referrals?referral=${ref.referralId}`);
  await b.getByRole("button", { name: "Discuss first" }).click();
  await b.locator("#question-text").fill("Which evenings suit you?");
  await b.getByRole("button", { name: "Send question" }).click();
  await expect(b.locator("#toast")).toContainText("Your question is in");
  await cb.close();
  const rows = await q(`select c.context_key, p.profile_id = $1 as is_avery, p.last_read_at, (select count(*) from conversation_messages m where m.conversation_id = c.id) as msgs, (select max(created_at) from conversation_messages m where m.conversation_id = c.id) as last_msg from conversations c join conversation_participants p on p.conversation_id = c.id where c.context_key like 'referral-%' order by c.id desc limit 4`, [avery]);
  console.log("ROWS", JSON.stringify(rows));
  const boot = await asMember(avery, `select public.my_unread_message_count() as n`);
  console.log("UNREAD", JSON.stringify(boot.rows));
});
