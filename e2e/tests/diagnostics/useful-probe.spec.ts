import { test } from "@playwright/test";
import { signInAs, account, memberClient } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

// Diagnostic: Mark useful (a save that returns to the same page), repeated.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
for (let n = 0; n < Number(process.env.PROBES || 8); n++)
  test(`useful probe ${n}`, async ({ page, context, baseURL }) => {
    const avery = await memberClient("avery");
    const fenn = await memberClient("fenn");
    const { data: c } = await avery.from("consultations").insert({ author_profile_id: account("avery").id, question: `QA useful probe ${Date.now()}: a fictional question.`, status: "open", audience_type: "selected", audience_profile_ids: [account("fenn").id], deidentification_confirmed: true }).select("id").single();
    await fenn.from("consultation_responses").insert({ consultation_id: c!.id, responder_profile_id: account("fenn").id, body: "A fictional reply.", response_type: "reply" });
    await signInAs(context, "avery", baseURL!);
    let loads = 0;
    page.on("load", () => loads++);
    await page.goto(`/dashboard/consult/${c!.id}`);
    await page.waitForLoadState("networkidle");
    const before = loads;
    await page.getByRole("button", { name: "Mark useful" }).click();
    await page.waitForTimeout(6000);
    const ok = await page.getByRole("button", { name: /✓ Useful/ }).first().isVisible().catch(() => false);
    let detail = "";
    if (!ok) {
      detail = await page.evaluate(() => {
        const main = document.querySelector("main");
        const key = Object.keys(document).find((k) => k.startsWith("__reactContainer$"));
        const root = key ? (document as any)[key].stateNode : null;
        return JSON.stringify({ mainLen: main?.innerHTML.length, mainStart: main?.innerHTML.slice(0, 400), hidden: document.querySelectorAll("[hidden], template").length, pending: root ? (root.pendingLanes >>> 0).toString(2) : null, suspended: root ? (root.suspendedLanes >>> 0).toString(2) : null });
      });
    }
    console.log(`useful ${n}: ${ok ? (loads > before ? "recovered-by-load" : "ok") : "STALL " + detail}`);
  });
